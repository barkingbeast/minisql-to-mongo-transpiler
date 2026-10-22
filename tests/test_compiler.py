import json
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from compiler import compile_sql, transpile, DEMO_SCHEMA
from executor import execute_mql, parse_commands, seeded_database
from lexer import tokenize


class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.db = seeded_database()
        self.sql = sqlite3.connect(':memory:')
        self.sql.executescript("""
            CREATE TABLE users (id INT, name TEXT, age INT);
            INSERT INTO users VALUES (1,'Alice',25),(2,'Bob',17),(3,'Charlie',30);
            CREATE TABLE orders (id INT, user_id INT, total INT, status TEXT);
            INSERT INTO orders VALUES (101,1,50,'COMPLETED'),(102,1,150,'COMPLETED'),
                (103,2,200,'COMPLETED'),(104,3,300,'PENDING'),(105,3,100,'COMPLETED');
        """)

    def tearDown(self):
        self.sql.close()

    def run_sql(self, sql, schema=None):
        compiled = compile_sql(sql, schema)
        json.dumps(compiled)  # HTTP/Pyodide payload must serialize, including nested AST rows.
        return execute_mql('\n\n'.join(compiled['mongo_queries']), self.db)['result']

    def assert_sql_equivalent(self, sql, labels):
        expected = sorted(self.sql.execute(sql).fetchall(), key=repr)
        result = self.run_sql(sql, DEMO_SCHEMA)
        actual = sorted([tuple(row.get(label) for label in labels) for row in result], key=repr)
        self.assertEqual(actual, expected, sql)

    def test_boolean_precedence_and_parentheses(self):
        for where in (
            'age = 25 AND id = 1 OR id = 2',
            'id = 1 OR id = 2 AND age > 18',
            'NOT (age < 18 OR age > 29)',
            'NOT NOT age > 18',
            '18 <= age',
            'age >= id',
            'age <> 17',
            'age != 17',
            'age IS NOT NULL',
        ):
            with self.subTest(where=where):
                self.assert_sql_equivalent('SELECT name FROM users WHERE ' + where, ['name'])

    def test_join_filter_group_default_example(self):
        sql = """SELECT users.name, SUM(orders.total) FROM users
                 INNER JOIN orders ON users.id = orders.user_id
                 WHERE users.age >= 18 AND orders.status = 'COMPLETED'
                 GROUP BY users.name"""
        self.assert_sql_equivalent(sql, ['users_name', 'sum_orders_total'])

    def test_reversed_join_and_projection(self):
        self.assert_sql_equivalent(
            'SELECT users.name, orders.total FROM users JOIN orders ON orders.user_id = users.id',
            ['users_name', 'orders_total'])

    def test_inner_join_excludes_unmatched_rows(self):
        self.db.users.insert_one({'id': 4, 'name': 'No orders', 'age': 40})
        result = self.run_sql('SELECT users.name FROM users JOIN orders ON users.id = orders.user_id')
        self.assertNotIn('No orders', [r['users_name'] for r in result])

    def test_join_null_keys_do_not_match(self):
        self.db.users.insert_one({'id': None, 'name': 'Null user'})
        self.db.orders.insert_one({'user_id': None, 'total': 5})
        result = self.run_sql('SELECT users.name FROM users JOIN orders ON users.id = orders.user_id')
        self.assertNotIn('Null user', [r['users_name'] for r in result])

    def test_chained_join(self):
        self.db.items.insert_one({'order_id': 101, 'product': 'Book'})
        result = self.run_sql("""SELECT users.name, items.product FROM users
            JOIN orders ON users.id = orders.user_id
            JOIN items ON orders.id = items.order_id""")
        self.assertEqual(result, [{'users_name': 'Alice', 'items_product': 'Book'}])

    def test_aggregate_count_null_and_empty(self):
        self.db.users.insert_one({'id': 4, 'name': 'Null', 'age': None})
        self.sql.execute("INSERT INTO users VALUES (4, 'Null', NULL)")
        self.db.users.insert_one({'id': 5, 'name': 'Missing'})
        self.sql.execute("INSERT INTO users VALUES (5, 'Missing', NULL)")
        for where in ('', ' WHERE age > 100', ' WHERE age IS NULL'):
            with self.subTest(where=where):
                self.assert_sql_equivalent(
                    'SELECT COUNT(*), COUNT(age), SUM(age), AVG(age) FROM users' + where,
                    ['count_all', 'count_age', 'sum_age', 'avg_age'])

    def test_null_logic(self):
        for age in (None,):
            self.db.users.insert_one({'id': 4, 'name': 'Null', 'age': age})
        self.db.users.insert_one({'id': 5, 'name': 'Missing'})
        self.sql.executescript("INSERT INTO users VALUES (4,'Null',NULL),(5,'Missing',NULL);")
        for where in ('NOT age = 18', 'age != 18', 'age = NULL', 'NOT (age = NULL)',
                      'NOT (age > 18 AND id = 1)', 'NOT (age > 18 OR id = 4)', 'age IS NULL'):
            with self.subTest(where=where):
                self.assert_sql_equivalent('SELECT name FROM users WHERE ' + where, ['name'])

    def test_grouped_projection_and_null_sum(self):
        self.db.users.insert_one({'id': 4, 'name': 'Null', 'age': None})
        self.sql.execute("INSERT INTO users VALUES (4, 'Null', NULL)")
        self.assert_sql_equivalent(
            'SELECT age, COUNT(*), SUM(age), AVG(age) FROM users GROUP BY age',
            ['age', 'count_all', 'sum_age', 'avg_age'])

    def test_multirow_insert_inferred_columns_and_escaping(self):
        result = self.run_sql("""CREATE TABLE people (id INT, name VARCHAR(50));
            INSERT INTO people VALUES (-1, 'O''Brien'), (2, '$name');
            SELECT name FROM people;""")
        self.assertEqual(result[-1], [{'name': "O'Brien"}, {'name': '$name'}])

    def test_boolean_and_null_literals(self):
        result = self.run_sql("""CREATE TABLE flags (id int, enabled BOOLEAN);
            INSERT INTO flags VALUES (1, TRUE), (2, FALSE), (3, NULL);
            SELECT id FROM flags WHERE enabled = FALSE;""")
        self.assertEqual(result[-1], [{'id': 2}])

    def test_literal_dollar_comparison(self):
        self.db.users.insert_one({'name': '$age'})
        self.assertEqual(self.run_sql("SELECT name FROM users WHERE name = '$age'"), [{'name': '$age'}])

    def test_updates_and_deletes(self):
        result = self.run_sql("""UPDATE users SET age = 26 WHERE name = 'Alice';
            DELETE FROM users WHERE age < 18; SELECT name, age FROM users;""")
        self.assertEqual(result[0], {'matchedCount': 1, 'modifiedCount': 1})
        self.assertEqual(result[1], {'deletedCount': 1})
        self.assertEqual(result[2], [{'name': 'Alice', 'age': 26}, {'name': 'Charlie', 'age': 30}])

    def test_field_qualification(self):
        self.assertEqual(self.run_sql('SELECT users.name FROM users WHERE users.id = 1'),
                         [{'name': 'Alice'}])

    def test_comments_and_positions(self):
        result = self.run_sql("-- start\nSELECT name /* middle */ FROM users WHERE id = 1;")
        self.assertEqual(result, [{'name': 'Alice'}])
        tokens = tokenize("SELECT\n    name FROM users")
        self.assertEqual((tokens[1].line, tokens[1].column), (2, 5))
        tokens = tokenize("SELECT 'a\nb',\n  name FROM users")
        name = next(t for t in tokens if t.value == 'name')
        self.assertEqual((name.line, name.column), (3, 3))

    def test_semantic_rejections(self):
        cases = [
            'SELECT missing FROM users',
            'SELECT name FROM missing',
            'INSERT INTO users (id) VALUES (\'oops\')',
            'UPDATE users SET age = \'oops\'',
            'SELECT SUM(name) FROM users',
            'SELECT SUM(*) FROM users',
            'SELECT name, COUNT(*) FROM users',
            'SELECT age, COUNT(*) FROM users GROUP BY name',
            'SELECT id FROM users JOIN orders ON users.id = orders.user_id',
            'SELECT users.name FROM users JOIN orders ON users.id > orders.user_id',
            'INSERT INTO users (id,id) VALUES (1,2)',
            'UPDATE users SET age = 1, age = 2',
            'CREATE TABLE x (id int, id text)',
            'CREATE TABLE x (id nonsense)',
            'INSERT INTO users VALUES (1)',
            'SELECT SUM(age), SUM(age) FROM users',
        ]
        for sql in cases:
            with self.subTest(sql=sql):
                response = transpile(sql, DEMO_SCHEMA)
                self.assertFalse(response['success'], sql)
                self.assertNotIn('AttributeError', response['error'])

    def test_truncated_and_invalid_queries(self):
        for sql in ('', 'SELECT', 'SELECT name FROM', 'SELECT * FROM users WHERE',
                    "INSERT INTO users (id) VALUES (", 'CREATE TABLE users (id int name text)',
                    "SELECT name FROM users WHERE name = '", 'SELECT * FROM users SELECT * FROM users',
                    'SELECT COUNT(1) FROM users', 'SELECT * FROM users WHERE (id = 1'):
            with self.subTest(sql=sql):
                result = transpile(sql)
                self.assertFalse(result['success'])
                self.assertNotIn('NoneType', result['error'])

    def test_keywords_inside_strings(self):
        self.db.users.insert_one({'name': 'WHERE'})
        self.assertEqual(self.run_sql("SELECT name FROM users WHERE name = 'WHERE'"), [{'name': 'WHERE'}])

    def test_double_quoted_string(self):
        self.assertEqual(tokenize('SELECT "a""b" FROM users')[1].value, 'a"b')

    def test_id_projection(self):
        result = self.run_sql('SELECT _id FROM users')
        self.assertEqual(len(result), 3)
        self.assertEqual(list(result[0]), ['_id'])

    def test_multiple_statements_no_codegen_state_leak(self):
        result = self.run_sql("""SELECT users.name FROM users JOIN orders ON users.id = orders.user_id;
            SELECT name FROM users WHERE id = 1""")
        self.assertEqual(result[-1], [{'name': 'Alice'}])

    def test_ast_and_explanations(self):
        response = compile_sql('SELECT name FROM users', DEMO_SCHEMA)
        self.assertTrue(response['success'])
        self.assertEqual(response['ast'][0]['type'], 'SelectQuery')
        self.assertTrue(response['explanations'][0])
        self.assertEqual(response['tokens'][0]['column'], 1)

    def test_invalid_schema_and_large_input(self):
        for schema in ([], {'users': []}, {'users': {'id': 'bad'}}):
            self.assertFalse(transpile('SELECT * FROM users', schema)['success'])
        self.assertFalse(transpile('x' * 100001)['success'])


class ExecutorTests(unittest.TestCase):
    def test_reject_python_and_unsupported_commands(self):
        for text in (
            "__import__('os').getcwd()", 'db.users.find({}).__class__',
            'db.users.drop()', 'db.users.find({"$where":"true"})',
            'db.users.aggregate([{"$out":"other"}])',
            'db.users.find({"$expr":{"$function":{"body":"return true"}}})',
            'db.users.find({},)', 'db.users.find({}, {"x": {"$function": {}}})',
            'db.users.updateMany({}, {"$rename":{"x":"y"}})',
        ):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    parse_commands(text)

    def test_json_literals_are_not_string_replaced(self):
        db = seeded_database()
        result = execute_mql('db.users.insertOne({"name":"true false null", "age":null}); db.users.find({"name":"true false null"}, {"_id":0})', db)
        self.assertEqual(result['result'][-1], [{'name': 'true false null', 'age': None}])

    def test_numeric_group_ids_keep_their_types(self):
        db = seeded_database()
        result = execute_mql('db.users.aggregate([{"$group":{"_id":"$age"}}])', db)
        self.assertTrue(all(type(row['_id']) is int for row in result['result']))

    def test_validate_all_commands_before_any_write(self):
        db = seeded_database()
        with self.assertRaises(ValueError):
            execute_mql('db.users.deleteMany({}); db.users.drop()', db)
        self.assertEqual(db.users.count_documents({}), 3)

    def test_independent_databases(self):
        one, two = seeded_database(), seeded_database()
        execute_mql('db.users.deleteMany({})', one)
        self.assertEqual(two.users.count_documents({}), 3)

    def test_result_limit(self):
        db = seeded_database()
        db.large.insert_many([{'n': i} for i in range(501)])
        with self.assertRaisesRegex(ValueError, '500'):
            execute_mql('db.large.find({})', db)


if __name__ == '__main__':
    unittest.main()
