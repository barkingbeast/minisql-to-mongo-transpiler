"""Recursive descent parser. Boolean precedence: NOT > AND > OR."""
from ast_nodes import (SelectQuery, JoinClause, InsertQuery, UpdateQuery, DeleteQuery,
                       CreateTableQuery, BinaryOp, UnaryOp, Identifier, Literal, FunctionCall)
from diagnostics import CompileError


class Parser:
    def __init__(self, tokens, source=None):
        self.tokens, self.pos = tokens, 0
        self.source = source

    def current(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def error(self, message):
        token = self.current()
        if token:
            location = self.location(token)
        elif self.source is not None:
            line = self.source.count('\n') + 1
            column = len(self.source.rsplit('\n', 1)[-1]) + 1
            location = {'line': line, 'column': column, 'end_line': line, 'end_column': column}
        elif self.tokens:
            last = self.tokens[-1]
            location = {'line': last.end_line, 'column': last.end_column,
                        'end_line': last.end_line, 'end_column': last.end_column}
        else:
            location = None
        raise CompileError(message, 'syntax', location)

    @staticmethod
    def location(token):
        return {'line': token.line, 'column': token.column,
                'end_line': token.end_line, 'end_column': token.end_column}

    def attach(self, node, token):
        node.location = self.location(token)
        return node

    @staticmethod
    def binary(left, op, right):
        node = BinaryOp(left, op, right)
        node.location = getattr(left, 'location', None)
        return node

    def consume(self, expected_type=None, expected_value=None):
        token = self.current()
        if token is None:
            self.error('Unexpected end of input')
        if expected_type and token.type != expected_type:
            self.error(f'Expected {expected_type}, got {token.value!r}')
        if expected_value is not None and token.value != expected_value:
            self.error(f'Expected {expected_value!r}, got {token.value!r}')
        self.pos += 1
        return token

    def match(self, expected_type=None, expected_value=None):
        token = self.current()
        if token is None:
            return False
        if expected_type and token.type != expected_type:
            return False
        if expected_value is not None and token.value != expected_value:
            return False
        self.pos += 1
        return True

    def keyword(self, value):
        return self.match('KEYWORD', value)

    def punct(self, value):
        return self.match('PUNCTUATION', value)

    def identifier(self, qualified=True):
        token = self.consume('IDENTIFIER')
        name = token.value
        if any(part.startswith('__minisql_') for part in name.split('.')):
            raise CompileError('Names starting with __minisql_ are reserved for compiler fields', 'syntax', self.location(token))
        if not qualified and '.' in name:
            self.error('Expected an unqualified name')
        return self.attach(Identifier(name), token)

    def parse(self):
        statements = []
        while self.current():
            if self.punct(';'):
                continue
            statements.append(self.parse_statement())
            if self.current() and not self.punct(';'):
                self.error('Expected a semicolon between statements')
        if not statements:
            self.error('Expected a SQL statement')
        return statements

    def parse_statement(self):
        token = self.current()
        methods = {'SELECT': self.parse_select, 'INSERT': self.parse_insert,
                   'UPDATE': self.parse_update, 'DELETE': self.parse_delete,
                   'CREATE': self.parse_create}
        if token.type != 'KEYWORD' or token.value not in methods:
            self.error(f'Unexpected token {token.value!r}')
        return self.attach(methods[token.value](), token)

    def parse_select(self):
        self.consume('KEYWORD', 'SELECT')
        star = self.current()
        fields = [self.attach(Identifier('*'), star)] if self.punct('*') else [self.parse_select_field()]
        while self.punct(','):
            fields.append(self.parse_select_field())
        self.consume('KEYWORD', 'FROM')
        table = self.identifier(False)
        joins = []
        while self.current() and self.current().value in ('INNER', 'JOIN'):
            self.keyword('INNER')
            self.consume('KEYWORD', 'JOIN')
            join_table = self.identifier(False)
            self.consume('KEYWORD', 'ON')
            joins.append(JoinClause(join_table, self.parse_condition()))
        where = self.parse_condition() if self.keyword('WHERE') else None
        group = None
        if self.keyword('GROUP'):
            self.consume('KEYWORD', 'BY')
            group = self.identifier()
        node = SelectQuery(fields, table, where, group, joins)
        if self.keyword('HAVING'):
            node.having = self.parse_condition(aggregates=True)
        if self.keyword('ORDER'):
            self.consume('KEYWORD', 'BY')
            while True:
                expression = self.parse_field()
                direction = -1 if self.keyword('DESC') else 1
                if direction == 1:
                    self.keyword('ASC')
                node.order_by.append({'expression': expression, 'direction': direction})
                if not self.punct(','):
                    break
        if self.keyword('LIMIT'):
            node.limit = self.parse_nonnegative_integer('LIMIT')
            if self.keyword('OFFSET'):
                node.offset = self.parse_nonnegative_integer('OFFSET')
        return node

    def parse_nonnegative_integer(self, clause):
        token = self.current()
        if token is None or token.type != 'NUMBER' or type(token.value) is not int or not 0 <= token.value <= 2_147_483_647:
            self.error(f'{clause} requires an integer between 0 and 2147483647')
        return self.consume().value

    def parse_select_field(self):
        field = self.parse_field()
        if self.keyword('AS'):
            field.alias = self.identifier(False).name
        return field

    def parse_field(self):
        token = self.current()
        if token and token.type == 'KEYWORD' and token.value in ('COUNT', 'SUM', 'AVG', 'MIN', 'MAX'):
            name = self.consume().value
            self.consume('PUNCTUATION', '(')
            star = self.current()
            arg = self.attach(Identifier('*'), star) if self.punct('*') else self.identifier()
            self.consume('PUNCTUATION', ')')
            return self.attach(FunctionCall(name, arg), token)
        return self.identifier()

    def parse_insert(self):
        self.consume('KEYWORD', 'INSERT')
        self.consume('KEYWORD', 'INTO')
        table = self.identifier(False)
        columns = []
        if self.punct('('):
            columns.append(self.identifier(False))
            while self.punct(','):
                columns.append(self.identifier(False))
            self.consume('PUNCTUATION', ')')
        self.consume('KEYWORD', 'VALUES')
        rows = []
        while True:
            self.consume('PUNCTUATION', '(')
            row = [self.parse_literal()]
            while self.punct(','):
                row.append(self.parse_literal())
            self.consume('PUNCTUATION', ')')
            rows.append(row)
            if not self.punct(','):
                break
        node = InsertQuery(table, columns, rows[0])
        node.rows = rows
        return node

    def parse_update(self):
        self.consume('KEYWORD', 'UPDATE')
        table = self.identifier(False)
        self.consume('KEYWORD', 'SET')
        assignments = [self.parse_assignment()]
        while self.punct(','):
            assignments.append(self.parse_assignment())
        where = self.parse_condition() if self.keyword('WHERE') else None
        return UpdateQuery(table, assignments, where)

    def parse_delete(self):
        self.consume('KEYWORD', 'DELETE')
        self.consume('KEYWORD', 'FROM')
        table = self.identifier(False)
        return DeleteQuery(table, self.parse_condition() if self.keyword('WHERE') else None)

    def parse_create(self):
        self.consume('KEYWORD', 'CREATE')
        self.consume('KEYWORD', 'TABLE')
        table = self.identifier(False)
        self.consume('PUNCTUATION', '(')
        columns = []
        while True:
            column = self.identifier(False)
            name = column.name
            type_token = self.consume('IDENTIFIER')
            kind = type_token.value.lower()
            if self.punct('('):
                size = self.consume('NUMBER').value
                if type(size) is not int or size <= 0:
                    self.error('Column size must be a positive integer')
                self.consume('PUNCTUATION', ')')
                if kind not in ('varchar', 'char'):
                    self.error('Only CHAR and VARCHAR accept a size')
            columns.append({'name': name, 'type': kind, 'location': column.location, 'type_location': self.location(type_token)})
            if not self.punct(','):
                break
        self.consume('PUNCTUATION', ')')
        return CreateTableQuery(table, columns)

    def parse_assignment(self):
        column = self.identifier()
        self.consume('OPERATOR', '=')
        return self.binary(column, '=', self.parse_literal())

    def parse_condition(self, aggregates=False):
        node = self.parse_and(aggregates)
        while self.keyword('OR'):
            node = self.binary(node, 'OR', self.parse_and(aggregates))
        return node

    def parse_and(self, aggregates=False):
        node = self.parse_not(aggregates)
        while self.keyword('AND'):
            node = self.binary(node, 'AND', self.parse_not(aggregates))
        return node

    def parse_not(self, aggregates=False):
        token = self.current()
        if self.keyword('NOT'):
            return self.attach(UnaryOp('NOT', self.parse_not(aggregates)), token)
        if self.punct('('):
            node = self.parse_condition(aggregates)
            self.consume('PUNCTUATION', ')')
            return node
        left = self.parse_literal_or_id(aggregates)
        if self.keyword('IS'):
            op = 'IS NOT' if self.keyword('NOT') else 'IS'
            self.consume('KEYWORD', 'NULL')
            return self.binary(left, op, Literal(None))
        op = self.consume('OPERATOR').value
        op = {'==': '=', '<>': '!='}.get(op, op)
        return self.binary(left, op, self.parse_literal_or_id(aggregates))

    def parse_literal(self):
        token = self.current()
        if token and token.type in ('STRING', 'NUMBER'):
            return self.attach(Literal(self.consume().value), token)
        if token and token.type == 'KEYWORD' and token.value in ('NULL', 'TRUE', 'FALSE'):
            return self.attach(Literal({'NULL': None, 'TRUE': True, 'FALSE': False}[self.consume().value]), token)
        self.error('Expected a literal')

    def parse_literal_or_id(self, aggregates=False):
        if aggregates and self.current() and self.current().value in ('COUNT', 'SUM', 'AVG', 'MIN', 'MAX') and self.current().type == 'KEYWORD':
            return self.parse_field()
        if self.current() and self.current().type == 'IDENTIFIER':
            return self.identifier()
        return self.parse_literal()
