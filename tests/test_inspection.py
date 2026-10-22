import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from compiler import DEMO_SCHEMA
from executor import seeded_database
from inspection import compare_results, inspect_pipeline


class InspectionTests(unittest.TestCase):
    def setUp(self):
        self.db = seeded_database()

    def test_supported_queries_match(self):
        for sql in [
            'SELECT name, age FROM users WHERE age >= 18 ORDER BY age DESC;',
            'SELECT users.name, SUM(orders.total) FROM users JOIN orders ON users.id = orders.user_id GROUP BY users.name;',
            'SELECT name AS person FROM users ORDER BY person LIMIT 2 OFFSET 1;',
            'SELECT COUNT(*) AS n, SUM(age) AS total FROM users WHERE age < 0;',
            'SELECT status, COUNT(*) FROM orders GROUP BY status HAVING COUNT(*) > 1;',
            'SELECT age FROM users WHERE name IS NOT NULL;',
            'SELECT * FROM users;',
            'SELECT * FROM users JOIN orders ON users.id = orders.user_id;',
        ]:
            with self.subTest(sql=sql):
                result = compare_results(sql, DEMO_SCHEMA, self.db)
                self.assertTrue(result['match'], result)

    def test_current_database_and_duplicates(self):
        self.db.users.insert_one({'id': 4, 'name': 'Alice', 'age': None})
        result = compare_results('SELECT name FROM users;', DEMO_SCHEMA, self.db)
        self.assertTrue(result['match'])
        self.assertEqual(result['sql_rows'].count(['Alice']), 2)
        self.assertEqual(len(result['mongo_rows']), 4)
        self.assertTrue(compare_results('SELECT age FROM users;', DEMO_SCHEMA, self.db)['match'])

    def test_real_difference_is_reported(self):
        # SQLite's ASCII LIKE semantics aren't involved: double quoted strings
        # resolving to an existing column are a real dialect difference.
        result = compare_results('SELECT name FROM users WHERE name = "name";', DEMO_SCHEMA, self.db)
        self.assertFalse(result['match'])
        self.assertEqual(len(result['sql_rows']), 3)
        self.assertEqual(result['mongo_rows'], [])
        self.assertEqual(len(result['differences']), 3)

    def test_read_only_and_single_select(self):
        for function in (compare_results, inspect_pipeline):
            for sql in ("DELETE FROM users;", "SELECT name FROM users; DELETE FROM users;", "UPDATE users SET age = 0;"):
                with self.assertRaises(ValueError):
                    function(sql, DEMO_SCHEMA, self.db)
        self.assertEqual(self.db.users.count_documents({}), 3)

    def test_snapshots_are_real_and_final_matches(self):
        result = inspect_pipeline('SELECT users.name, orders.total FROM users JOIN orders ON users.id = orders.user_id WHERE orders.total > 100;', DEMO_SCHEMA, self.db)
        snapshots = result['snapshots']
        self.assertEqual(snapshots[0]['count'], 3)
        self.assertEqual(next(s['count'] for s in snapshots if '$unwind' in s['stage']), 5)
        self.assertEqual(snapshots[-1]['count'], 3)
        self.assertEqual(snapshots[-1]['rows'][0].keys(), {'users_name', 'orders_total'})
        self.assertEqual(self.db.orders.count_documents({}), 5)

    def test_find_pipeline_and_empty_results(self):
        result = inspect_pipeline('SELECT name FROM users WHERE age < 0;', DEMO_SCHEMA, self.db)
        self.assertEqual(result['snapshots'][-1]['count'], 0)
        self.assertEqual(result['snapshots'][1]['stage'].keys(), {'$match'})

    def test_large_result_is_not_declared_a_match(self):
        self.db.users.insert_many([{'id': i + 10, 'name': 'X', 'age': 20} for i in range(501)])
        with self.assertRaises(ValueError):
            compare_results('SELECT name FROM users;', DEMO_SCHEMA, self.db)

if __name__ == '__main__':
    unittest.main()
