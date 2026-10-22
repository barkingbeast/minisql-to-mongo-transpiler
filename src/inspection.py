"""Read-only result comparison and optional pipeline snapshots for the demo engine."""
import json
import math
import sqlite3
from compiler import compile_sql
from executor import parse_commands, serialize


def prepare(sql, schema):
    compiled = compile_sql(sql, schema)
    if len(compiled['ast']) != 1 or compiled['ast'][0]['type'] != 'SelectQuery':
        raise ValueError('Choose one SELECT statement; inspection never executes writes.')
    table, method, args = parse_commands(compiled['mongo_queries'][0])[0]
    if method not in ('find', 'aggregate'):
        raise ValueError('Inspection supports SELECT only')
    return compiled, table, method, args


def bounded(rows, limit=500):
    result = []
    for row in rows:
        result.append(row)
        if len(result) > limit:
            raise ValueError(f'Inspection exceeds {limit} rows. Add WHERE or LIMIT.')
    return result


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def compare_results(sql, schema, db):
    compiled, table, method, args = prepare(sql, schema)
    ast = compiled['ast'][0]
    mongo = bounded(db[table].find(*args) if method == 'find' else db[table].aggregate(*args))
    connection = sqlite3.connect(':memory:')
    try:
        for name, columns in compiled['schema'].items():
            definitions = ', '.join(quote(column) for column in columns)
            if not definitions:
                continue
            connection.execute(f'CREATE TABLE {quote(name)} ({definitions})')
            docs = bounded(db[name].find(), 2000)
            if docs:
                values = []
                for doc in docs:
                    row = [doc.get(column) for column in columns]
                    if any(isinstance(value, (dict, list)) for value in row):
                        raise ValueError('Comparison requires scalar SQL values, not nested documents.')
                    values.append([serialize(value) for value in row])
                connection.executemany(
                    f'INSERT INTO {quote(name)} VALUES ({",".join("?" for _ in columns)})', values)
        # Only run the already-parsed SELECT, with a bounded SQLite VM budget.
        ticks = [0]
        def progress():
            ticks[0] += 1
            return ticks[0] > 10000
        connection.set_progress_handler(progress, 1000)
        cursor = connection.execute(sql)
        sql_rows = bounded(cursor)
        star = any(field.get('name') == '*' for field in ast['fields'])
        fields = []
        if star:
            tables = [ast['table']['name']] + [join['table']['name'] for join in ast['joins']]
            for name in tables:
                for column in compiled['schema'][name]:
                    fields.append((name + '_' if ast['joins'] else '') + column)
            mongo_rows = []
            for row in mongo:
                values = []
                for name in tables:
                    document = row if name == table else row.get('__minisql_' + name, {})
                    values.extend(serialize(document.get(column)) for column in compiled['schema'][name])
                mongo_rows.append(values)
        else:
            for field in ast['fields']:
                if field.get('alias'):
                    label = field['alias']
                elif field['type'] == 'FunctionCall':
                    label = field['name'].lower() + '_' + ('all' if field['arg']['name'] == '*' else field['arg']['name'].replace('.', '_'))
                else:
                    label = field['name'].replace('.', '_') if ast.get('joins') else field['name'].split('.')[-1]
                fields.append(label)
            mongo_rows = [[serialize(row.get(field)) for field in fields] for row in mongo]
        sql_rows = [list(row) for row in sql_rows]
        ordered = bool(ast.get('order_by'))
        def equal(left, right):
            return all((math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
                        if isinstance(a, (int, float)) and isinstance(b, (int, float))
                        else a == b) for a, b in zip(left, right)) and len(left) == len(right)
        unmatched = list(mongo_rows)
        differences = []
        for index, row in enumerate(sql_rows):
            if ordered:
                if index >= len(mongo_rows) or not equal(row, mongo_rows[index]):
                    differences.append({'row': index + 1, 'sql': row, 'mongo': mongo_rows[index] if index < len(mongo_rows) else None})
            else:
                match = next((i for i, other in enumerate(unmatched) if equal(row, other)), None)
                if match is None:
                    differences.append({'sql': row, 'mongo': None})
                else:
                    unmatched.pop(match)
        if not ordered:
            differences.extend({'sql': None, 'mongo': row} for row in unmatched)
        elif len(mongo_rows) > len(sql_rows):
            differences.extend({'sql': None, 'mongo': row} for row in mongo_rows[len(sql_rows):])
        return {'success': True, 'match': not differences, 'columns': fields,
                'sql_rows': sql_rows, 'mongo_rows': mongo_rows, 'differences': differences,
                'ordered': ordered, 'engines': 'SQLite vs MongoDB simulation (mongomock)',
                'note': ('Row order checked.' if ordered else 'Compared as multisets; duplicate counts matter.') + (' SELECT * uses schema columns; automatic MongoDB _id is omitted.' if star else '')}
    finally:
        connection.close()


def inspect_pipeline(sql, schema, db):
    compiled, table, method, args = prepare(sql, schema)
    stages = args[0] if method == 'aggregate' else [
        {'$match': args[0]}, *([{'$project': args[1]}] if len(args) > 1 else [])]
    snapshots = []
    for index in range(len(stages) + 1):
        rows = bounded(db[table].aggregate(stages[:index])) if index else bounded(db[table].find())
        snapshots.append({'stage': stages[index - 1] if index else {'INPUT': table},
                          'count': len(rows), 'rows': serialize(rows[:50]), 'sampled': len(rows) > 50})
    return {'success': True, 'snapshots': snapshots, 'engine': 'mongomock'}
