"""Schema validation and identifier resolution without connecting to a database."""
from ast_nodes import (SelectQuery, InsertQuery, UpdateQuery, DeleteQuery, CreateTableQuery,
                       BinaryOp, UnaryOp, Identifier, Literal, FunctionCall)
from diagnostics import CompileError, diagnostic_node
from query_utils import output_label, aggregate_key, all_aggregates

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

    def table(self, name, node=None):
        if self.schema and name not in self.schema:
            raise CompileError(f"Table '{name}' does not exist in the schema", 'semantic', getattr(node, 'location', None))

    @diagnostic_node
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
    def check_value(kind, value, name, node=None):
        if value is None or kind is None:
            return
        valid = ((kind == 'int' and type(value) is int) or
                 (kind == 'number' and type(value) in (int, float)) or
                 (kind == 'text' and isinstance(value, str)) or
                 (kind == 'bool' and type(value) is bool))
        if not valid:
            raise CompileError(f"Type mismatch: Column '{name}' expects {kind}, got {value!r}", 'semantic', getattr(node, 'location', None))

    @diagnostic_node
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
                self.check_value('number' if left_type == 'int' else left_type, node.right.value, node.left.name, node.right)
            elif isinstance(node.left, Literal) and isinstance(node.right, Identifier):
                self.check_value('number' if right_type == 'int' else right_type, node.left.value, node.right.name, node.left)
            elif left_type and right_type and left_type != right_type:
                if {left_type, right_type} != {'int', 'number'}:
                    raise TypeError('Type mismatch between compared columns')

    @diagnostic_node
    def visit_CreateTableQuery(self, node):
        name = node.table.name
        if name in self.created:
            raise ValueError(f"Table '{name}' is defined more than once")
        columns = {}
        for column in node.columns:
            if column['name'] in columns:
                raise CompileError(f"Duplicate column in table '{name}'", 'semantic', column.get('location'))
            try:
                columns[column['name']] = self.normalize_type(column['type'])
            except ValueError as error:
                raise CompileError(str(error), 'semantic', column.get('type_location')) from error
        self.schema[name] = columns
        self.created.add(name)

    @diagnostic_node
    def visit_SelectQuery(self, node):
        tables = [node.table.name]
        self.table(tables[0], node.table)
        for join in node.joins:
            table = join.table.name
            self.table(table, join.table)
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
        aggregates = list(all_aggregates(node))
        for aggregate in aggregates:
            self.validate_aggregate(aggregate, tables)
        grouped = bool(aggregates or node.group_by)
        if node.having and not grouped:
            raise ValueError('HAVING requires GROUP BY or an aggregate function')
        labels = {}
        for field in node.fields:
            if not isinstance(field, FunctionCall):
                self.resolve(field, tables)
                if grouped and (not node.group_by or getattr(field, 'resolved_name', None) != node.group_by.resolved_name):
                    raise CompileError('Every selected non-aggregate column must appear in GROUP BY', 'semantic', field.location)
            label = output_label(field, bool(node.joins))
            if label in labels:
                raise CompileError(f'Duplicate output field: {label}', 'semantic', field.location)
            labels[label] = field
        if len(node.fields) > 1 and any(isinstance(f, Identifier) and f.name == '*' for f in node.fields):
            raise ValueError('SELECT * cannot be mixed with other fields')
        self.check_output_condition(node.having, node, tables, labels)
        ordered = set()
        for order in node.order_by:
            expression = order['expression']
            self.output_operand(expression, node, tables, labels, grouped)
            key = ('aggregate', aggregate_key(expression)) if isinstance(expression, FunctionCall) else (
                getattr(expression, 'aggregate_reference', None) or getattr(expression, 'resolved_name', expression.name))
            if key in ordered:
                raise CompileError('Duplicate ORDER BY expression', 'semantic', expression.location)
            ordered.add(key)

    @diagnostic_node
    def validate_aggregate(self, field, tables):
        kind = self.resolve(field.arg, tables)
        if field.arg.name == '*' and field.name != 'COUNT':
            raise ValueError('Only COUNT accepts *')
        if field.name in ('SUM', 'AVG') and kind not in (None, 'int', 'number'):
            raise TypeError(f'Type mismatch: {field.name} requires a numeric column')
        return 'int' if field.name == 'COUNT' else ('number' if field.name in ('SUM', 'AVG') else kind)

    @diagnostic_node
    def output_operand(self, field, query, tables, labels, grouped):
        if isinstance(field, Literal):
            return None
        if isinstance(field, FunctionCall):
            return self.validate_aggregate(field, tables)
        reference = labels.get(field.name) if '.' not in field.name else None
        if reference is not None:
            if isinstance(reference, FunctionCall):
                field.aggregate_reference = aggregate_key(reference)
                return self.validate_aggregate(reference, tables)
            field.resolved_name = reference.resolved_name
            table, column = reference.resolved_name.split('.', 1)
            kind = self.schema.get(table, {}).get(column)
        else:
            kind = self.resolve(field, tables)
        if grouped:
            if not query.group_by or getattr(field, 'resolved_name', None) != query.group_by.resolved_name:
                raise ValueError('Post-group columns must be a GROUP BY field or an aggregate alias')
            field.group_reference = True
        return kind

    @diagnostic_node
    def check_output_condition(self, condition, query, tables, labels):
        if condition is None:
            return
        if isinstance(condition, UnaryOp):
            return self.check_output_condition(condition.operand, query, tables, labels)
        if condition.op in ('AND', 'OR'):
            self.check_output_condition(condition.left, query, tables, labels)
            self.check_output_condition(condition.right, query, tables, labels)
            return
        left_type = self.output_operand(condition.left, query, tables, labels, True)
        right_type = self.output_operand(condition.right, query, tables, labels, True)
        if isinstance(condition.right, Literal):
            self.check_value('number' if left_type == 'int' else left_type, condition.right.value, 'HAVING expression', condition.right)
        elif isinstance(condition.left, Literal):
            self.check_value('number' if right_type == 'int' else right_type, condition.left.value, 'HAVING expression', condition.left)
        elif left_type and right_type and left_type != right_type and {left_type, right_type} != {'int', 'number'}:
            raise TypeError('Type mismatch between HAVING operands')

    @diagnostic_node
    def visit_InsertQuery(self, node):
        name = node.table.name
        self.table(name, node.table)
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
                self.check_value(kind, value.value, column.name, value)

    @diagnostic_node
    def visit_UpdateQuery(self, node):
        name = node.table.name
        self.table(name, node.table)
        assigned = set()
        for assignment in node.set_clause:
            kind = self.resolve(assignment.left, [name])
            column = assignment.left.name.split('.')[-1]
            if column in assigned:
                raise ValueError(f'Duplicate assignment for column {column}')
            assigned.add(column)
            self.check_value(kind, assignment.right.value, column, assignment.right)
        self.check_where(node.where_clause, [name])

    @diagnostic_node
    def visit_DeleteQuery(self, node):
        self.table(node.table.name, node.table)
        self.check_where(node.where_clause, [node.table.name])
