import sys
from lexer import tokenize
from parser import Parser
from semantic import SemanticAnalyzer
from codegen import CodeGenerator

def process_query(sql):
    try:
        tokens = tokenize(sql)
        parser = Parser(tokens)
        ast = parser.parse()
        
        print("\n=== Abstract Syntax Tree ===")
        for node in ast:
            print(node.to_json())
            
        analyzer = SemanticAnalyzer()
        analyzer.analyze(ast)
        
        codegen = CodeGenerator()
        mongo_queries = codegen.generate(ast)
        
        print("\n=== Generated MongoDB Queries ===")
        for q in mongo_queries:
            print(q)
            
    except Exception as e:
        print(f"\n[Error] {e}")

def repl():
    print("=========================================")
    print("  MiniSQL to MongoDB Transpiler REPL     ")
    print("  Type your SQL queries. Type 'exit' to quit.")
    print("=========================================\n")
    while True:
        try:
            sql = input("minisql> ")
            if sql.strip().lower() in ('exit', 'quit'):
                break
            if sql.strip():
                if not sql.strip().endswith(';'):
                    sql += ';' # Optional semicolon appending
                process_query(sql)
        except EOFError:
            break
        except KeyboardInterrupt:
            print("\nType 'exit' to quit.")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            sql = f.read()
            process_query(sql)
    else:
        repl()
