"""Local development server and isolated demo execution API."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import os
import secrets
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
from compiler import transpile
from executor import execute_mql, seeded_database

PORT = int(os.environ.get('PORT', '8000'))
MAX_BODY = 256_000
SESSIONS = {}
SESSION_LOCK = threading.Lock()


class TranspilerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'public'), **kwargs)

    def send_json(self, data, status=200):
        body = json.dumps(data, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if getattr(self, 'new_session', None):
            self.send_header('Set-Cookie', f'minisql_session={self.new_session}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        host = self.headers.get('Host', '')
        return host in (f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}')

    def do_POST(self):
        if not self.allowed_host():
            return self.send_json({'success': False, 'error': 'Invalid host'}, 403)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers['Host']:
            return self.send_json({'success': False, 'error': 'Cross-origin API requests are not allowed'}, 403)
        path = urlsplit(self.path).path
        if path not in ('/api/transpile', '/api/execute', '/api/reset'):
            return self.send_json({'success': False, 'error': 'Unknown API endpoint'}, 404)
        try:
            if self.headers.get_content_type() != 'application/json':
                return self.send_json({'success': False, 'error': 'Use application/json'}, 415)
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                return self.send_json({'success': False, 'error': 'Invalid or oversized request body'}, 413)
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if not isinstance(payload, dict):
                raise ValueError('Request must be a JSON object')
            if path == '/api/transpile':
                return self.send_json(transpile(payload.get('sql'), payload.get('schema')))
            with SESSION_LOCK:
                now = time.monotonic()
                for key in list(SESSIONS):
                    if now - SESSIONS[key]['accessed'] > 3600:
                        del SESSIONS[key]
                cookies = SimpleCookie()
                cookies.load(self.headers.get('Cookie', ''))
                token = cookies.get('minisql_session')
                token = token.value if token else None
                if token not in SESSIONS:
                    if len(SESSIONS) >= 100:
                        raise ValueError('Demo session limit reached; try again later')
                    token = secrets.token_urlsafe(32)
                    self.new_session = token
                    SESSIONS[token] = {'db': seeded_database(), 'accessed': now}
                session = SESSIONS[token]
                session['accessed'] = now
                if path == '/api/reset':
                    session['db'] = seeded_database()
                    result = {'success': True, 'result': 'Demo database reset'}
                else:
                    result = execute_mql(payload.get('mql'), session['db'])
            self.send_json(result)
        except (ValueError, TypeError, UnicodeError, RecursionError) as error:
            self.send_json({'success': False, 'error': str(error)}, 400)
        except ImportError:
            self.send_json({'success': False, 'error': 'Install demo dependencies: python -m pip install -r requirements.txt'}, 503)
        except Exception as error:
            # Database errors must never become a successful API response.
            self.send_json({'success': False, 'error': str(error)}, 400)

    def do_GET(self):
        if not self.allowed_host():
            return self.send_error(403, 'Invalid host')
        path = unquote(urlsplit(self.path).path)
        if path == '/api/health':
            return self.send_json({'success': True, 'engine': 'mongomock', 'persistent': False})
        # Serve known compiler modules for the same Pyodide fallback used on GitHub Pages.
        if path.startswith('/src/'):
            candidate = (ROOT / 'src' / path[5:]).resolve()
            if candidate.parent != ROOT / 'src' or candidate.suffix != '.py':
                return self.send_error(404)
        else:
            candidate = (ROOT / 'public' / path.lstrip('/')).resolve()
            if path == '/':
                candidate = ROOT / 'public' / 'index.html'
            if not candidate.is_relative_to(ROOT / 'public'):
                return self.send_error(404)
        if not candidate.is_file():
            return self.send_error(404)
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8' if candidate.suffix == '.py' else self.guess_type(str(candidate)))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    print(f'Starting demo server on http://localhost:{PORT}', flush=True)
    with ThreadingHTTPServer(('127.0.0.1', PORT), TranspilerHandler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down server.')
