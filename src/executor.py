"""An isolated in-memory MongoDB demo. Only allowlisted commands with JSON args run."""
import json
import re

COMMAND = re.compile(
    r'db\.(?:getCollection\(\s*("(?:(?:\\.)|[^"\\])*")\s*\)|'
    r'([A-Za-z_][A-Za-z0-9_]*))\.([A-Za-z]+)\s*\(|db\.(createCollection)\s*\('
)
METHODS = {
    'find': (1, 2), 'aggregate': (1, 1), 'insertOne': (1, 1),
    'insertMany': (1, 1), 'updateMany': (2, 2), 'deleteMany': (1, 1),
    'createCollection': (1, 1),
}
OPERATORS = {
    '$expr', '$and', '$or', '$nor', '$not', '$eq', '$ne', '$gt', '$lt', '$gte', '$lte',
    '$ifNull', '$literal', '$cond', '$sum', '$avg', '$arrayElemAt', '$in', '$exists',
}
STAGES = {'$match', '$project', '$group', '$lookup', '$unwind', '$facet'}


def check_operators(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.startswith('$') and key not in OPERATORS:
                raise ValueError(f'Unsupported MongoDB operator: {key}')
            if key != '$literal':
                check_operators(item)
    elif isinstance(value, list):
        for item in value:
            check_operators(item)


def check_pipeline(pipeline, depth=0):
    if not isinstance(pipeline, list) or len(pipeline) > 100 or depth > 5:
        raise ValueError('Expected a bounded aggregation pipeline')
    for stage in pipeline:
        if not isinstance(stage, dict) or len(stage) != 1:
            raise ValueError('Each pipeline stage must contain one operator')
        name, value = next(iter(stage.items()))
        if name not in STAGES:
            raise ValueError(f'Unsupported aggregation stage: {name}')
        if name == '$facet':
            if not isinstance(value, dict):
                raise ValueError('$facet expects an object')
            for nested in value.values():
                check_pipeline(nested, depth + 1)
        elif name == '$lookup':
            if not isinstance(value, dict) or set(value) != {'from', 'localField', 'foreignField', 'as'}:
                raise ValueError('Only equality $lookup is supported')
            for item in value.values():
                if not isinstance(item, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.]*', item):
                    raise ValueError('Invalid $lookup name')
        else:
            check_operators(value)


def parse_commands(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 200_000:
        raise ValueError('Provide MongoDB commands up to 200,000 characters')
    decoder = json.JSONDecoder()
    commands, pos = [], 0
    while pos < len(text):
        while pos < len(text) and (text[pos].isspace() or text[pos] == ';'):
            pos += 1
        if pos == len(text):
            break
        match = COMMAND.match(text, pos)
        if not match:
            raise ValueError('Only supported db collection commands with JSON arguments are allowed')
        quoted, plain, method, create = match.groups()
        method = create or method
        table = json.loads(quoted) if quoted else plain
        if method not in METHODS:
            raise ValueError(f'Unsupported MongoDB method: {method}')
        pos = match.end()
        args = []
        while True:
            while pos < len(text) and text[pos].isspace():
                pos += 1
            if pos < len(text) and text[pos] == ')':
                pos += 1
                break
            try:
                arg, end = decoder.raw_decode(text, pos)
            except (ValueError, RecursionError) as error:
                raise ValueError('Command arguments must be valid JSON') from error
            args.append(arg)
            pos = end
            while pos < len(text) and text[pos].isspace():
                pos += 1
            if pos < len(text) and text[pos] == ',':
                pos += 1
                # Disallow a trailing comma.
                if pos >= len(text) or text[pos:].lstrip().startswith(')'):
                    raise ValueError('Expected a JSON argument after comma')
                continue
            if pos >= len(text) or text[pos] != ')':
                raise ValueError('Expected a closing parenthesis')
            pos += 1
            break
        minimum, maximum = METHODS[method]
        if not minimum <= len(args) <= maximum:
            raise ValueError(f'Invalid argument count for {method}')
        if method == 'createCollection':
            table = args[0]
        if not isinstance(table, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', table):
            raise ValueError('Invalid collection name')
        if method == 'aggregate':
            check_pipeline(args[0])
        elif method in ('find', 'deleteMany', 'updateMany'):
            if not isinstance(args[0], dict):
                raise ValueError('Expected a filter object')
            check_operators(args[0])
            if method == 'find' and len(args) == 2:
                if not isinstance(args[1], dict):
                    raise ValueError('Expected a projection object')
                check_operators(args[1])
            if method == 'updateMany':
                if not isinstance(args[1], dict) or set(args[1]) != {'$set'} or not isinstance(args[1]['$set'], dict):
                    raise ValueError('Only $set updates are supported')
        elif method == 'insertOne' and not isinstance(args[0], dict):
            raise ValueError('insertOne expects a document')
        elif method == 'insertMany':
            if not isinstance(args[0], list) or not args[0] or not all(isinstance(x, dict) for x in args[0]):
                raise ValueError('insertMany expects a nonempty list of documents')
        commands.append((table, method, args))
        if len(commands) > 100:
            raise ValueError('At most 100 commands may run at once')
    if not commands:
        raise ValueError('No MongoDB commands provided')
    return commands


def seeded_database():
    import mongomock
    db = mongomock.MongoClient().db
    db.users.insert_many([
        {'id': 1, 'name': 'Alice', 'age': 25},
        {'id': 2, 'name': 'Bob', 'age': 17},
        {'id': 3, 'name': 'Charlie', 'age': 30},
    ])
    db.orders.insert_many([
        {'id': 101, 'user_id': 1, 'total': 50, 'status': 'COMPLETED'},
        {'id': 102, 'user_id': 1, 'total': 150, 'status': 'COMPLETED'},
        {'id': 103, 'user_id': 2, 'total': 200, 'status': 'COMPLETED'},
        {'id': 104, 'user_id': 3, 'total': 300, 'status': 'PENDING'},
        {'id': 105, 'user_id': 3, 'total': 100, 'status': 'COMPLETED'},
    ])
    return db


def serialize(value):
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize(v) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def execute_mql(text, db):
    commands = parse_commands(text)  # Validate the entire request before executing any command.
    results = []
    for table, method, args in commands:
        collection = db[table]
        if method == 'createCollection':
            db.create_collection(table)
            result = {'message': f"Collection '{table}' created"}
        elif method == 'find':
            result = list(collection.find(*args).limit(501))
        elif method == 'aggregate':
            result = []
            for row in collection.aggregate(*args):
                result.append(row)
                if len(result) > 500:
                    break
        elif method == 'insertOne':
            result = {'insertedId': str(collection.insert_one(args[0]).inserted_id)}
        elif method == 'insertMany':
            result = {'insertedIds': [str(x) for x in collection.insert_many(args[0]).inserted_ids]}
        elif method == 'updateMany':
            change = collection.update_many(*args)
            result = {'matchedCount': change.matched_count, 'modifiedCount': change.modified_count}
        else:
            result = {'deletedCount': collection.delete_many(*args).deleted_count}
        if isinstance(result, list) and len(result) > 500:
            raise ValueError('Result exceeds 500 documents; add a WHERE condition')
        results.append(serialize(result))
    return {'success': True, 'result': results[0] if len(results) == 1 else results,
            'engine': 'mongomock', 'persistent': False}
