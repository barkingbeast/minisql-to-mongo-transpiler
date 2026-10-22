"""Recursive descent parser. Boolean precedence: NOT > AND > OR."""
from ast_nodes import (SelectQuery, JoinClause, InsertQuery, UpdateQuery, DeleteQuery,
                       CreateTableQuery, BinaryOp, UnaryOp, Identifier, Literal, FunctionCall)


class Parser:
    def __init__(self, tokens):
        self.tokens, self.pos = tokens, 0

    def current(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def error(self, message):
        token = self.current() or (self.tokens[-1] if self.tokens else None)
        location = f' at line {token.line}, column {token.column}' if token else ''
        raise SyntaxError(message + location)

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
        name = self.consume('IDENTIFIER').value
        if any(part.startswith('__minisql_') for part in name.split('.')):
            self.error('Names starting with __minisql_ are reserved for compiler fields')
        if not qualified and '.' in name:
            self.error('Expected an unqualified name')
        return Identifier(name)

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
        return methods[token.value]()

    def parse_select(self):
        self.consume('KEYWORD', 'SELECT')
        fields = [Identifier('*')] if self.punct('*') else [self.parse_field()]
        while self.punct(','):
            fields.append(self.parse_field())
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
        return SelectQuery(fields, table, where, group, joins)

    def parse_field(self):
        token = self.current()
        if token and token.type == 'KEYWORD' and token.value in ('COUNT', 'SUM', 'AVG'):
            name = self.consume().value
            self.consume('PUNCTUATION', '(')
            arg = Identifier('*') if self.punct('*') else self.identifier()
            self.consume('PUNCTUATION', ')')
            return FunctionCall(name, arg)
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
            name = self.identifier(False).name
            kind = self.consume('IDENTIFIER').value.lower()
            if self.punct('('):
                size = self.consume('NUMBER').value
                if type(size) is not int or size <= 0:
                    self.error('Column size must be a positive integer')
                self.consume('PUNCTUATION', ')')
                if kind not in ('varchar', 'char'):
                    self.error('Only CHAR and VARCHAR accept a size')
            columns.append({'name': name, 'type': kind})
            if not self.punct(','):
                break
        self.consume('PUNCTUATION', ')')
        return CreateTableQuery(table, columns)

    def parse_assignment(self):
        column = self.identifier()
        self.consume('OPERATOR', '=')
        return BinaryOp(column, '=', self.parse_literal())

    def parse_condition(self):
        node = self.parse_and()
        while self.keyword('OR'):
            node = BinaryOp(node, 'OR', self.parse_and())
        return node

    def parse_and(self):
        node = self.parse_not()
        while self.keyword('AND'):
            node = BinaryOp(node, 'AND', self.parse_not())
        return node

    def parse_not(self):
        if self.keyword('NOT'):
            return UnaryOp('NOT', self.parse_not())
        if self.punct('('):
            node = self.parse_condition()
            self.consume('PUNCTUATION', ')')
            return node
        left = self.parse_literal_or_id()
        if self.keyword('IS'):
            op = 'IS NOT' if self.keyword('NOT') else 'IS'
            self.consume('KEYWORD', 'NULL')
            return BinaryOp(left, op, Literal(None))
        op = self.consume('OPERATOR').value
        op = {'==': '=', '<>': '!='}.get(op, op)
        return BinaryOp(left, op, self.parse_literal_or_id())

    def parse_literal(self):
        token = self.current()
        if token and token.type in ('STRING', 'NUMBER'):
            return Literal(self.consume().value)
        if token and token.type == 'KEYWORD' and token.value in ('NULL', 'TRUE', 'FALSE'):
            return Literal({'NULL': None, 'TRUE': True, 'FALSE': False}[self.consume().value])
        self.error('Expected a literal')

    def parse_literal_or_id(self):
        if self.current() and self.current().type == 'IDENTIFIER':
            return self.identifier()
        return self.parse_literal()
