"""Regression coverage for extended SQL and source diagnostics."""
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from compiler import compile_sql, transpile, DEMO_SCHEMA
from executor import execute_mql, seeded_database, parse_commands


class ExtendedSQLTests(unittest.TestCase):
    def setUp(self):
        self.db = seeded_database()
        self.sqlite = sqlite3.connect(':memory:')
        self.sqlite.executescript("""
            CREATE TABLE users (id INT, name TEXT, age INT);
            INSERT INTO users VALUES (1,'Alice',25),(2,'Bob',17),(3,'Charlie',30);
            CREATE TABLE orders (id INT, user_id INT, total INT, status TEXT);
            INSERT INTO orders VALUES (101,1,50,'COMPLETED'),(102,1,150,'COMPLETED'),
                (103,2,200,'COMPLETED'),(104,3,300,'PENDING'),(105,3,100,'COMPLETED');
        """)

    def tearDown(self):
        self.sqlite.close()

    def result(self, sql):
        queries = compile_sql(sql, DEMO_SCHEMA)['mongo_queries']
        return execute_mql('\n\n'.join(queries), self.db)['result']

    def equivalent(self, sql, labels, ordered=True):
        expected = self.sqlite.execute(sql).fetchall()
        actual = [tuple(row.get(label) for label in labels) for row in self.result(sql)]
        if not ordered:
            actual, expected = sorted(actual, key=repr), sorted(expected, key=repr)
        self.assertEqual(actual, expected, sql)

    def test_sort_and_page(self):
        self.equivalent('SELECT name, age FROM users ORDER BY age DESC LIMIT 2 OFFSET 1', ['name', 'age'])

    def test_multiple_sort_keys(self):
        self.equivalent('SELECT user_id, total FROM orders ORDER BY user_id ASC, total DESC', ['user_id', 'total'])

    def test_sort_by_nonselected_column(self):
        self.equivalent('SELECT name FROM users ORDER BY age DESC', ['name'])

    def test_field_alias(self):
        self.equivalent('SELECT name AS person, age AS years FROM users ORDER BY years DESC', ['person', 'years'])

    def test_qualified_join_aliases(self):
        self.equivalent("""SELECT users.name AS person, orders.total AS amount FROM users
            JOIN orders ON users.id = orders.user_id ORDER BY amount DESC""", ['person', 'amount'])

    def test_having_alias(self):
        self.equivalent("""SELECT user_id, SUM(total) AS spent FROM orders
            GROUP BY user_id HAVING spent >= 200 ORDER BY spent DESC, user_id ASC""", ['user_id', 'spent'])

    def test_having_unselected_aggregate(self):
        self.equivalent("""SELECT user_id FROM orders GROUP BY user_id
            HAVING SUM(total) > 200 ORDER BY AVG(total) DESC""", ['user_id'])

    def test_having_nested_logic_and_aggregate(self):
        self.equivalent("""SELECT user_id, COUNT(*) AS purchases FROM orders GROUP BY user_id
            HAVING NOT (SUM(total) < 200 OR COUNT(*) = 1) ORDER BY user_id""", ['user_id', 'purchases'])

    def test_ungrouped_having(self):
        self.equivalent('SELECT COUNT(*) AS total FROM users HAVING total = 3', ['total'])

    def test_ungrouped_having_empty(self):
        self.equivalent('SELECT COUNT(*) AS total FROM users WHERE age > 100 HAVING COUNT(*) = 0', ['total'])

    def test_having_after_empty_sum(self):
        self.equivalent('SELECT SUM(age) AS total FROM users WHERE age > 100 HAVING total IS NULL', ['total'])

    def test_grouped_alias_and_limit(self):
        self.equivalent("""SELECT age AS years, COUNT(*) AS total FROM users GROUP BY age
            HAVING total > 0 ORDER BY years DESC LIMIT 1""", ['years', 'total'])

    def test_min_max(self):
        self.equivalent('SELECT MIN(age) AS youngest, MAX(age) AS oldest, MIN(name) AS first FROM users',
                        ['youngest', 'oldest', 'first'])

    def test_sort_and_min_max_with_nulls(self):
        self.db.users.insert_one({'id': 4, 'name': 'Null', 'age': None})
        self.sqlite.execute("INSERT INTO users VALUES (4, 'Null', NULL)")
        self.equivalent('SELECT name, age FROM users ORDER BY age ASC, name DESC', ['name', 'age'])
        self.equivalent('SELECT MIN(age), MAX(age) FROM users', ['min_age', 'max_age'])

    def test_zero_limit(self):
        self.assertEqual(self.result('SELECT * FROM users LIMIT 0'), [])
        self.assertEqual(self.result('SELECT COUNT(*) FROM users LIMIT 0'), [])

    def test_numeric_comparisons_accept_fractional_thresholds(self):
        self.equivalent('SELECT name FROM users WHERE age >= 17.5 ORDER BY age', ['name'])
        self.equivalent('SELECT COUNT(*) AS total FROM users HAVING total > 2.5', ['total'])
        self.assertFalse(transpile('UPDATE users SET age = 17.5', DEMO_SCHEMA)['success'])

    def test_star_does_not_leak_sort_helpers(self):
        rows = self.result('SELECT * FROM users ORDER BY id DESC LIMIT 1')
        self.assertEqual(rows[0]['name'], 'Charlie')
        self.assertFalse(any(k.startswith('__minisql_') for k in rows[0]))

    def test_invalid_extended_sql(self):
        for sql in (
            'SELECT name AS x, age AS x FROM users',
            'SELECT name FROM users LIMIT -1',
            'SELECT name FROM users LIMIT 1.5',
            'SELECT name FROM users LIMIT 2147483648',
            'SELECT name FROM users LIMIT 2 OFFSET -1',
            'SELECT name FROM users ORDER BY',
            'SELECT name FROM users HAVING age > 18',
            'SELECT name FROM users ORDER BY missing',
            'SELECT COUNT(*) FROM users HAVING age > 18',
            'SELECT MIN(*) FROM users',
            'SELECT MAX(*) FROM users',
            'SELECT COUNT(*) FROM users ORDER BY name',
            'SELECT age FROM users GROUP BY age HAVING missing > 1',
            'SELECT name FROM users ORDER BY age, age DESC',
        ):
            with self.subTest(sql=sql):
                result = transpile(sql, DEMO_SCHEMA)
                self.assertFalse(result['success'], sql)
                self.assertIn('diagnostic', result, sql)

    def test_easter_egg_is_valid_normal_sql(self):
        sql = 'CREATE TABLE Dr_BASKARAN_P (title TEXT, compiler_power INT);'
        response = compile_sql(sql, DEMO_SCHEMA)
        self.assertEqual(response['ast'][0]['table']['name'], 'Dr_BASKARAN_P')
        self.assertIn('Dr_BASKARAN_P', response['schema'])
        self.assertTrue(execute_mql(response['mongo_queries'][0], self.db)['success'])

    def test_new_stages_still_reject_invalid_arguments(self):
        for mql in (
            'db.users.aggregate([{"$sort":{"age":0}}])',
            'db.users.aggregate([{"$limit":0}])',
            'db.users.aggregate([{"$skip":-1}])',
            'db.users.aggregate([{"$addFields":{"x":{"$function":{}}}}])',
        ):
            with self.subTest(mql=mql):
                with self.assertRaises(ValueError):
                    parse_commands(mql)


class DiagnosticTests(unittest.TestCase):
    def diagnostic(self, sql):
        response = transpile(sql, DEMO_SCHEMA)
        self.assertFalse(response['success'])
        return response['diagnostic']

    def test_unknown_column_exact_span(self):
        item = self.diagnostic('SELECT\n  missing FROM users;')
        self.assertEqual((item['phase'], item['line'], item['column'], item['end_column']),
                         ('semantic', 2, 3, 10))

    def test_unknown_table_span(self):
        item = self.diagnostic('SELECT name FROM missing;')
        self.assertEqual((item['line'], item['column'], item['end_column']), (1, 18, 25))

    def test_type_mismatch_underlines_the_literal(self):
        sql = "SELECT name FROM users WHERE age = 'oops';"
        item = self.diagnostic(sql)
        self.assertEqual(sql[item['column'] - 1:item['end_column'] - 1], "'oops'")

    def test_eof_is_a_point_diagnostic(self):
        sql = 'SELECT name FROM users WHERE age =\n   '
        item = self.diagnostic(sql)
        self.assertEqual((item['phase'], item['line'], item['column'], item['end_column']),
                         ('syntax', 2, 4, 4))

    def test_leading_whitespace_is_preserved(self):
        item = self.diagnostic('\n   SELECT missing FROM users')
        self.assertEqual((item['line'], item['column']), (2, 11))

    def test_lexical_error(self):
        item = self.diagnostic('SELECT @ FROM users')
        self.assertEqual((item['phase'], item['column'], item['end_column']), ('lexical', 8, 9))

    def test_unclosed_string(self):
        item = self.diagnostic("SELECT * FROM users WHERE name = 'Alice")
        self.assertIn('Unclosed', item['message'])

    def test_unsupported_type_span(self):
        sql = 'CREATE TABLE x (id nonsense);'
        item = self.diagnostic(sql)
        self.assertEqual(sql[item['column'] - 1:item['end_column'] - 1], 'nonsense')


if __name__ == '__main__':
    unittest.main()
