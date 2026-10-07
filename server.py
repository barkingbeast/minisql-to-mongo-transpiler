import http.server
import socketserver
import json
import os
import traceback
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

# Import the compiler modules
from lexer import tokenize
from parser import Parser
from semantic import SemanticAnalyzer
from codegen import CodeGenerator

PORT = 8000

class TranspilerHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/transpile':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            response = {}
            try:
                req = json.loads(post_data.decode('utf-8'))
                sql = req.get('sql', '')
                
                if not sql.strip().endswith(';'):
                    sql += ';'
                    
                tokens = tokenize(sql)
                parser = Parser(tokens)
                ast = parser.parse()
                
                analyzer = SemanticAnalyzer()
                analyzer.analyze(ast)
                
                codegen = CodeGenerator()
                mongo_queries, explanations = codegen.generate(ast)
                
                response['success'] = True
                response['ast'] = [node.to_dict() for node in ast]
                response['mongo_queries'] = mongo_queries
                response['explanations'] = explanations
                response['tokens'] = [{'type': t.type, 'value': t.value} for t in tokens]
            except Exception as e:
                response['success'] = False
                err_msg = str(e)
                response['error'] = err_msg
                
                # Basic rule-based error suggestions
                if "Type mismatch" in err_msg:
                    response['suggestion'] = "Hint: Check if you are comparing the correct data types (e.g., numbers without quotes, strings with quotes)."
                elif "Syntax" in err_msg or "Unexpected token" in err_msg:
                    response['suggestion'] = "Tip: There might be a missing keyword, comma, or a mismatched quote."
                elif "Table" in err_msg and "does not exist" in err_msg:
                    response['suggestion'] = "Tip: Make sure the table name matches one you've defined in the Schema Map."
                elif "Column count" in err_msg:
                    response['suggestion'] = "Hint: The number of values doesn't seem to match the number of columns provided."
                else:
                    response['suggestion'] = "Tip: Double check the SQL syntax."
                    
                traceback.print_exc()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        elif self.path == '/api/execute':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            response = {}
            try:
                req = json.loads(post_data.decode('utf-8'))
                mql = req.get('mql', '')
                
                # Setup mongomock environment for eval
                import mongomock
                if not hasattr(self.__class__, 'mongo_client'):
                    self.__class__.mongo_client = mongomock.MongoClient()
                    db = self.__class__.mongo_client.db
                    
                    # Seed mock data for the default query
                    db.users.insert_many([
                        {"id": 1, "name": "Alice", "age": 25},
                        {"id": 2, "name": "Bob", "age": 17},
                        {"id": 3, "name": "Charlie", "age": 30}
                    ])
                    db.orders.insert_many([
                        {"id": 101, "user_id": 1, "total": 50, "status": "COMPLETED"},
                        {"id": 102, "user_id": 1, "total": 150, "status": "COMPLETED"},
                        {"id": 103, "user_id": 2, "total": 200, "status": "COMPLETED"},
                        {"id": 104, "user_id": 3, "total": 300, "status": "PENDING"},
                        {"id": 105, "user_id": 3, "total": 100, "status": "COMPLETED"}
                    ])
                
                mongo_db = self.__class__.mongo_client.db
                
                class MockDB:
                    def createCollection(self, name):
                        mongo_db.create_collection(name)
                        return {"message": f"Collection '{name}' created"}
                        
                    def __getattr__(self, name):
                        class Collection:
                            def aggregate(self, pipeline):
                                return list(mongo_db[name].aggregate(pipeline))
                            def find(self, query=None, projection=None):
                                if query is None: query = {}
                                cursor = mongo_db[name].find(query, projection) if projection else mongo_db[name].find(query)
                                return list(cursor)
                            def insertOne(self, doc):
                                res = mongo_db[name].insert_one(doc)
                                return {"insertedId": str(res.inserted_id)}
                            def updateMany(self, query, update_doc):
                                res = mongo_db[name].update_many(query, update_doc)
                                return {"matchedCount": res.matched_count, "modifiedCount": res.modified_count}
                            def deleteMany(self, query):
                                res = mongo_db[name].delete_many(query)
                                return {"deletedCount": res.deleted_count}
                        return Collection()

                db = MockDB()
                
                def serialize_mongo(obj):
                    if isinstance(obj, list):
                        return [serialize_mongo(i) for i in obj]
                    elif isinstance(obj, dict):
                        return {k: str(v) if k == '_id' else serialize_mongo(v) for k, v in obj.items()}
                    return obj

                # Prepare the mql string for Python evaluation
                mql_py = mql.replace('true', 'True').replace('false', 'False').replace('null', 'None')
                
                # Support running multiple queries if necessary (separated by newlines)
                # Support running multiple queries separated by blank lines
                results = []
                for query_block in mql_py.split('\n\n'):
                    query_block = query_block.strip()
                    if not query_block or query_block.startswith('//'):
                        continue
                        
                    try:
                        res = eval(query_block, {"db": db})
                        results.append(serialize_mongo(res))
                    except Exception as ev_e:
                        results.append({"error": str(ev_e), "query": query_block})

                response['success'] = True
                response['result'] = results if len(results) > 1 else (results[0] if results else None)
                
            except Exception as e:
                response['success'] = False
                response['error'] = str(e)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        else:
            self.send_response(404)
            self.end_headers()
            
    def do_GET(self):
        # Serve static files from the 'public' directory
        if self.path == '/':
            self.path = '/index.html'
        
        filepath = os.path.join(os.getcwd(), 'public', self.path.lstrip('/'))
        if os.path.exists(filepath) and not os.path.isdir(filepath):
            self.send_response(200)
            if filepath.endswith('.html'):
                self.send_header('Content-Type', 'text/html')
            elif filepath.endswith('.css'):
                self.send_header('Content-Type', 'text/css')
            elif filepath.endswith('.js'):
                self.send_header('Content-Type', 'application/javascript')
            self.end_headers()
            with open(filepath, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    print(f"Starting server on http://localhost:{PORT}")
    with socketserver.TCPServer(("", PORT), TranspilerHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
