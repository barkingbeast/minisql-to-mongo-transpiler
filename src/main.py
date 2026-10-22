"""Command-line interface using the same compiler as the browser and server."""
import sys
from compiler import compile_sql


def process_query(sql, schema=None):
    try:
        result = compile_sql(sql, schema)
        print('\n=== Abstract Syntax Tree ===')
        import json
        print(json.dumps(result['ast'], indent=2))
        print('\n=== Generated MongoDB Queries ===')
        for query in result['mongo_queries']:
            print(query)
        return result
    except (ValueError, TypeError, SyntaxError, RecursionError) as error:
        print(f'\n[Error] {error}', file=sys.stderr)
        return None


def repl():
    print("MiniSQL to MongoDB Transpiler. Type 'exit' to quit.")
    schema = None
    while True:
        try:
            sql = input('minisql> ')
            if sql.strip().lower() in ('exit', 'quit'):
                break
            if sql.strip():
                result = process_query(sql, schema)
                if result:
                    schema = result['schema'] or None
        except EOFError:
            break
        except KeyboardInterrupt:
            print("\nType 'exit' to quit.")


if __name__ == '__main__':
    if len(sys.argv) > 1:
        try:
            with open(sys.argv[1], encoding='utf-8') as source:
                result = process_query(source.read())
            sys.exit(0 if result else 1)
        except OSError as error:
            print(f'[Error] {error}', file=sys.stderr)
            sys.exit(1)
    else:
        repl()
