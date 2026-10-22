"""Schema validation and identifier resolution without connecting to a database."""
from ast_nodes import (SelectQuery, InsertQuery, UpdateQuery, DeleteQuery, CreateTableQuery,
                       BinaryOp, UnaryOp, Identifier, Literal, FunctionCall)

TYPE_ALIASES = {
    'int': 'int', 'integer': 'int', 'bigint': 'int',
    'float': 'number', 'real': 'number', 'double': 'number', 'number': 'number',
    'text': 'text', 'varchar': 'text', 'char': 'text', 'uuid': 'text',
    'time': 'text', 'date': 'text', 'timestamp': 'text',
    'bool': 'bool', 'boolean': 'bool',
}


class SemanticAnalyzer:
    def __init__(self, schema=None):
        self.schema = {}
        if schema is not None:
            if not isinstance(schema, dict):
                raise ValueError('Schema must be an object mapping tables to columns')
            for table, columns in schema.items():
                if not isinstance(columns, dict) or not columns:
                    raise ValueError(f"Table '{table}' must have column definitions")
                self.schema[table] = {name: self.normalize_type(kind) for name, kind in columns.items()}
        self.created = set()

    @staticmethod
    def normalize_type(kind):
        if not isinstance(kind, str) or kind.lower() not in TYPE_ALIASES:
            raise ValueError(f'Unsupported column type: {kind!r}')
        return TYPE_ALIASES[kind.lower()]

    def analyze(self, nodes):
        for node in nodes:
            getattr(self, f'visit_{type(node).__name__}')(node)

    def table(self, name):
        if self.schema and name not in self.schema:
            raise ValueError(f"Table '{name}' does not exist in the schema")

    def resolve(self, identifier, tables):
        name = identifier.name
        if name == '*':
            return None
        if '.' in name:
            table, column = name.split('.', 1)
            if table not in tables:
                raise ValueError(f"Table '{table}' is not in this query")
        else:
            column = name
            candidates = [t for t in tables if column in self.schema.get(t, {})]
            if len(candidates) > 1:
                raise ValueError(f"Ambiguous column '{name}'; qualify it with its table")
            if not self.schema and len(tables) > 1:
                raise ValueError(f"Qualify column '{name}' when using JOIN without a schema")
            table = candidates[0] if candidates else tables[0]
        if self.schema and column not in self.schema.get(table, {}):
            raise ValueError(f"Column '{name}' does not exist in table '{table}'")
        identifier.resolved_name = f'{table}.{column}'
        return self.schema.get(table, {}).get(column)

    @staticmethod
    def check_value(kind, value, name):
        if value is None or kind is None:
            return
        valid = ((kind == 'int' and type(value) is int) or
                 (kind == 'number' and type(value) in (int, float)) or
                 (kind == 'text' and isinstance(value, str)) or
                 (kind == 'bool' and type(value) is bool))
        if not valid:
            raise TypeError(f"Type mismatch: Column '{name}' expects {kind}, got {value!r}")

    def check_where(self, node, tables):
        if node is None:
            return
        if isinstance(node, UnaryOp):
            self.check_where(node.operand, tables)
        elif node.op in ('AND', 'OR'):
            self.check_where(node.left, tables)
            self.check_where(node.right, tables)
        else:
            left_type = self.resolve(node.left, tables) if isinstance(node.left, Identifier) else None
            right_type = self.resolve(node.right, tables) if isinstance(node.right, Identifier) else None
            if isinstance(node.right, Literal) and isinstance(node.left, Identifier):
                self.check_value(left_type, node.right.value, node.left.name)
            elif isinstance(node.left, Literal) and isinstance(node.right, Identifier):
                self.check_value(right_type, node.left.value, node.right.name)
            elif left_type and right_type and left_type != right_type:
                if {left_type, right_type} != {'int', 'number'}:
                    raise TypeError('Type mismatch between compared columns')

    def visit_CreateTableQuery(self, node):
        name = node.table.name
        if name in self.created:
            raise ValueError(f"Table '{name}' is defined more than once")
        names = [c['name'] for c in node.columns]
        if len(names) != len(set(names)):
            raise ValueError(f"Duplicate column in table '{name}'")
        self.schema[name] = {c['name']: self.normalize_type(c['type']) for c in node.columns}
        self.created.add(name)

    def visit_SelectQuery(self, node):
        tables = [node.table.name]
        self.table(tables[0])
        for join in node.joins:
            table = join.table.name
            self.table(table)
            if table in tables:
                raise ValueError('Self joins and repeated JOIN tables require aliases, which are not supported')
            condition = join.condition
            if not (isinstance(condition, BinaryOp) and condition.op == '=' and
                    isinstance(condition.left, Identifier) and isinstance(condition.right, Identifier)):
                raise ValueError('JOIN ON supports one equality between qualified columns')
            if '.' not in condition.left.name or '.' not in condition.right.name:
                raise ValueError('JOIN ON columns must be qualified with table names')
            sides = {condition.left.name.split('.')[0], condition.right.name.split('.')[0]}
            if table not in sides or len(sides) != 2 or not (sides - {table}).issubset(set(tables)):
                raise ValueError('JOIN ON must connect the new table to a preceding table')
            tables.append(table)
            self.check_where(condition, tables)
        self.check_where(node.where_clause, tables)
        if node.group_by:
            self.resolve(node.group_by, tables)
        aggregates = any(isinstance(f, FunctionCall) for f in node.fields)
        labels = []
        for field in node.fields:
            if isinstance(field, FunctionCall):
                kind = self.resolve(field.arg, tables)
                if field.arg.name == '*' and field.name != 'COUNT':
                    raise ValueError('Only COUNT accepts *')
                if field.name in ('SUM', 'AVG') and kind not in (None, 'int', 'number'):
                    raise TypeError(f'Type mismatch: {field.name} requires a numeric column')
                label = f'{field.name.lower()}_{field.arg.name.replace(".", "_").replace("*", "all")}'
            else:
                self.resolve(field, tables)
                if aggregates or node.group_by:
                    if not node.group_by or getattr(field, 'resolved_name', None) != node.group_by.resolved_name:
                        raise ValueError('Every selected non-aggregate column must appear in GROUP BY')
                label = field.name.replace('.', '_') if node.joins else field.name.split('.')[-1]
            if label in labels:
                raise ValueError(f'Duplicate output field: {label}')
            labels.append(label)
        if len(node.fields) > 1 and any(isinstance(f, Identifier) and f.name == '*' for f in node.fields):
            raise ValueError('SELECT * cannot be mixed with other fields')

    def visit_InsertQuery(self, node):
        name = node.table.name
        self.table(name)
        if not node.columns:
            if name not in self.schema:
                raise ValueError('INSERT without columns requires a table definition in the schema')
            node.columns = [Identifier(c) for c in self.schema[name]]
        names = [c.name for c in node.columns]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate INSERT column')
        kinds = [self.resolve(c, [name]) for c in node.columns]
        for row in node.rows:
            if len(row) != len(node.columns):
                raise ValueError(f'Column count ({len(node.columns)}) does not match value count ({len(row)})')
            for column, kind, value in zip(node.columns, kinds, row):
                self.check_value(kind, value.value, column.name)

    def visit_UpdateQuery(self, node):
        name = node.table.name
        self.table(name)
        assigned = set()
        for assignment in node.set_clause:
            kind = self.resolve(assignment.left, [name])
            column = assignment.left.name.split('.')[-1]
            if column in assigned:
                raise ValueError(f'Duplicate assignment for column {column}')
            assigned.add(column)
            self.check_value(kind, assignment.right.value, column)
        self.check_where(node.where_clause, [name])

    def visit_DeleteQuery(self, node):
        self.table(node.table.name)
        self.check_where(node.where_clause, [node.table.name])
