"""Shared entry point for CLI, HTTP API and Pyodide."""
from lexer import tokenize
from parser import Parser
from semantic import SemanticAnalyzer
from codegen import CodeGenerator
from diagnostics import CompileError

MAX_SQL_LENGTH = 100_000
DEMO_SCHEMA = {
    'users': {'id': 'int', 'name': 'text', 'age': 'int'},
    'orders': {'id': 'int', 'user_id': 'int', 'total': 'int', 'status': 'text'},
}


def compile_sql(sql, schema=None):
    if not isinstance(sql, str) or not sql.strip():
        raise ValueError('Enter a SQL statement')
    if len(sql) > MAX_SQL_LENGTH:
        raise ValueError('SQL exceeds the 100,000 character limit')
    tokens = tokenize(sql)
    ast = Parser(tokens, sql).parse()
    analyzer = SemanticAnalyzer(schema)
    analyzer.analyze(ast)
    queries, explanations = CodeGenerator().generate(ast)
    return {
        'success': True, 'ast': [n.to_dict() for n in ast],
        'mongo_queries': queries, 'explanations': explanations,
        'tokens': [{'type': t.type, 'value': t.value, 'line': t.line, 'column': t.column,
                    'end_line': t.end_line, 'end_column': t.end_column} for t in tokens],
        'schema': analyzer.schema,
        'validation': 'Schema and type validation passed' if analyzer.schema else
                      'Syntax validated; provide a schema for column and type checks',
    }


def transpile(sql, schema=None):
    try:
        return compile_sql(sql, schema)
    except CompileError as error:
        return {'success': False, 'error': str(error), 'diagnostic': error.to_dict(),
                'suggestion': 'Check the highlighted SQL token and the Schema Map definitions.'}
    except (ValueError, TypeError, SyntaxError, RecursionError) as error:
        message = 'Query nesting is too deep' if isinstance(error, RecursionError) else str(error)
        return {'success': False, 'error': message,
                'suggestion': 'Check the supported SQL syntax and the table and column types in Schema Map.'}
