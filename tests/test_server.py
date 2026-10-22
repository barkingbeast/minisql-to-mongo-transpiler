from http.cookiejar import CookieJar
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import build_opener, HTTPCookieProcessor, Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from compiler import DEMO_SCHEMA
from http.server import ThreadingHTTPServer


class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.TranspilerHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def setUp(self):
        self.client = build_opener(HTTPCookieProcessor(CookieJar()))

    def request(self, path, payload=None, client=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
        req = Request(self.base + path, data=data, headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            response = (client or self.client).open(req)
        except HTTPError as error:
            response = error
        with response:
            body = response.read()
            if response.headers.get_content_type() == 'application/json':
                body = json.loads(body)
            return response.status, body

    def test_compile_and_execute_real_default(self):
        status, compiled = self.request('/api/transpile', {'sql':
            "SELECT users.name, SUM(orders.total) FROM users INNER JOIN orders ON users.id = orders.user_id WHERE users.age >= 18 AND orders.status = 'COMPLETED' GROUP BY users.name",
            'schema': DEMO_SCHEMA})
        self.assertEqual(status, 200)
        self.assertTrue(compiled['success'])
        status, data = self.request('/api/execute', {'mql': compiled['mongo_queries'][0]})
        self.assertEqual(status, 200)
        self.assertEqual(data['result'], [
            {'users_name': 'Alice', 'sum_orders_total': 200},
            {'users_name': 'Charlie', 'sum_orders_total': 100}])

    def test_session_isolation_and_reset(self):
        other = build_opener(HTTPCookieProcessor(CookieJar()))
        self.request('/api/execute', {'mql': 'db.users.deleteMany({})'})
        _, mine = self.request('/api/execute', {'mql': 'db.users.find({})'})
        _, theirs = self.request('/api/execute', {'mql': 'db.users.find({})'}, client=other)
        self.assertEqual(mine['result'], [])
        self.assertEqual(len(theirs['result']), 3)
        self.request('/api/reset', {})
        _, reset = self.request('/api/execute', {'mql': 'db.users.find({})'})
        self.assertEqual(len(reset['result']), 3)

    def test_inspection_endpoints_share_only_callers_session(self):
        other = build_opener(HTTPCookieProcessor(CookieJar()))
        payload = {'sql': 'SELECT name FROM users;', 'schema': DEMO_SCHEMA}
        self.request('/api/execute', {'mql': 'db.users.deleteMany({})'})
        status, mine = self.request('/api/compare', payload)
        self.assertEqual(status, 200)
        self.assertTrue(mine['match'])
        self.assertEqual(mine['sql_rows'], [])
        _, theirs = self.request('/api/compare', payload, client=other)
        self.assertEqual(len(theirs['sql_rows']), 3)
        _, stages = self.request('/api/pipeline', payload)
        self.assertEqual(stages['snapshots'][0]['count'], 0)
        status, rejected = self.request('/api/pipeline', {'sql': 'DELETE FROM users;', 'schema': DEMO_SCHEMA})
        self.assertEqual(status, 400)
        self.assertFalse(rejected['success'])

    def test_malformed_input(self):
        for payload in ([], {'sql': 123}, {'sql': None}, {'sql': ''}):
            status, data = self.request('/api/transpile', payload)
            self.assertFalse(data['success'])
        status, data = self.request('/api/execute', raw=b'not-json')
        self.assertEqual(status, 400)
        self.assertFalse(data['success'])

    def test_reject_unsafe_execution(self):
        status, data = self.request('/api/execute', {'mql': "__import__('os').getcwd()"})
        self.assertEqual(status, 400)
        self.assertFalse(data['success'])

    def test_database_errors_are_failures(self):
        self.request('/api/execute', {'mql': 'db.createCollection("x")'})
        status, data = self.request('/api/execute', {'mql': 'db.createCollection("x")'})
        self.assertEqual(status, 400)
        self.assertFalse(data['success'])

    def test_path_traversal_and_no_directory_listing(self):
        for path in ('/../server.py', '/%2e%2e/server.py', '/src/../server.py', '/src/', '/'):
            status, body = self.request(path)
            self.assertEqual(status, 200 if path == '/' else 404)
        self.assertEqual(self.request('/src/compiler.py')[0], 200)
        self.assertEqual(self.request('/style.css?v=1')[0], 200)

    def test_cross_origin_and_host_rejection(self):
        self.assertEqual(self.request('/api/transpile', {'sql': 'SELECT * FROM users'},
                                     headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/transpile', {'sql': 'SELECT * FROM users'},
                                     headers={'Host': 'evil.example'})[0], 403)

    def test_body_limits(self):
        status, _ = self.request('/api/transpile', raw=b'x' * 256001)
        self.assertEqual(status, 413)

    def test_unknown_route(self):
        self.assertEqual(self.request('/api/missing', {})[0], 404)

    def test_cli_exit_codes_and_output(self):
        root = Path(__file__).resolve().parents[1]
        success = subprocess.run([sys.executable, '-B', str(root / 'src/main.py'), str(root / 'examples/test.sql')],
                                 capture_output=True, text=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertIn('db.getCollection("users").find(', success.stdout)
        self.assertNotIn('[Error]', success.stdout)
        failure = subprocess.run([sys.executable, '-B', str(root / 'src/main.py'), str(root / 'missing.sql')],
                                 capture_output=True, text=True)
        self.assertEqual(failure.returncode, 1)


if __name__ == '__main__':
    unittest.main()
