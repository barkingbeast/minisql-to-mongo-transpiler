from lexer import tokenize
from ast_nodes import *

class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def current(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def consume(self, expected_type=None, expected_value=None):
        token = self.current()
        if not token:
            raise SyntaxError("Unexpected end of input")
        if expected_type and token.type != expected_type:
            raise SyntaxError(f"Expected token type {expected_type} but got {token.type} at line {token.line}")
        if expected_value and token.value != expected_value:
            raise SyntaxError(f"Expected '{expected_value}' but got '{token.value}' at line {token.line}")
        self.pos += 1
        return token

    def match(self, expected_type=None, expected_value=None):
        token = self.current()
        if not token: return False
        if expected_type and token.type != expected_type: return False
        if expected_value and token.value != expected_value: return False
        self.pos += 1
        return True

    def parse(self):
        statements = []
        while self.pos < len(self.tokens):
            if self.current().value == ';':
                self.consume()
                continue
            statements.append(self.parse_statement())
        return statements

    def parse_statement(self):
        token = self.current()
        if token.value == 'SELECT':
            return self.parse_select()
        elif token.value == 'INSERT':
            return self.parse_insert()
        elif token.value == 'UPDATE':
            return self.parse_update()
        elif token.value == 'DELETE':
            return self.parse_delete()
        elif token.value == 'CREATE':
            return self.parse_create()
        else:
            raise SyntaxError(f"Unexpected token {token.value} at line {token.line}")

    def parse_select(self):
        self.consume(expected_value='SELECT')
        fields = []
        if self.match(expected_value='*'):
            fields.append(Identifier('*'))
        else:
            fields.append(self.parse_field())
            while self.match(expected_value=','):
                fields.append(self.parse_field())
        
        self.consume(expected_value='FROM')
        table = Identifier(self.consume('IDENTIFIER').value)
        
        joins = []
        while self.match(expected_value='JOIN'):
            join_table = Identifier(self.consume('IDENTIFIER').value)
            self.consume(expected_value='ON')
            join_cond = self.parse_condition()
            joins.append(JoinClause(join_table, join_cond))
        
        where_clause = None
        if self.match(expected_value='WHERE'):
            where_clause = self.parse_condition()
            
        group_by = None
        if self.match(expected_value='GROUP'):
            self.consume(expected_value='BY')
            group_by = Identifier(self.consume('IDENTIFIER').value)
            
        return SelectQuery(fields, table, where_clause, group_by, joins)

    def parse_field(self):
        token = self.current()
        if token.value in ('COUNT', 'SUM', 'AVG'):
            func = self.consume().value
            self.consume(expected_value='(')
            arg = self.consume().value # identifier or *
            self.consume(expected_value=')')
            return FunctionCall(func, Identifier(arg))
        else:
            return Identifier(self.consume('IDENTIFIER').value)

    def parse_insert(self):
        self.consume(expected_value='INSERT')
        self.consume(expected_value='INTO')
        table = Identifier(self.consume('IDENTIFIER').value)
        
        columns = []
        if self.match(expected_value='('):
            columns.append(Identifier(self.consume('IDENTIFIER').value))
            while self.match(expected_value=','):
                columns.append(Identifier(self.consume('IDENTIFIER').value))
            self.consume(expected_value=')')
            
        self.consume(expected_value='VALUES')
        self.consume(expected_value='(')
        values = []
        values.append(self.parse_literal())
        while self.match(expected_value=','):
            values.append(self.parse_literal())
        self.consume(expected_value=')')
        
        return InsertQuery(table, columns, values)

    def parse_update(self):
        self.consume(expected_value='UPDATE')
        table = Identifier(self.consume('IDENTIFIER').value)
        self.consume(expected_value='SET')
        
        set_clause = []
        set_clause.append(self.parse_assignment())
        while self.match(expected_value=','):
            set_clause.append(self.parse_assignment())
            
        where_clause = None
        if self.match(expected_value='WHERE'):
            where_clause = self.parse_condition()
            
        return UpdateQuery(table, set_clause, where_clause)

    def parse_delete(self):
        self.consume(expected_value='DELETE')
        self.consume(expected_value='FROM')
        table = Identifier(self.consume('IDENTIFIER').value)
        where_clause = None
        if self.match(expected_value='WHERE'):
            where_clause = self.parse_condition()
        return DeleteQuery(table, where_clause)

    def parse_create(self):
        self.consume(expected_value='CREATE')
        self.consume(expected_value='TABLE')
        table = Identifier(self.consume('IDENTIFIER').value)
        self.consume(expected_value='(')
        columns = []
        while not self.match(expected_value=')'):
            col_name = self.consume('IDENTIFIER').value
            col_type = self.consume('IDENTIFIER').value
            columns.append({"name": col_name, "type": col_type})
            self.match(expected_value=',')
        return CreateTableQuery(table, columns)

    def parse_assignment(self):
        col = Identifier(self.consume('IDENTIFIER').value)
        self.consume(expected_value='=')
        val = self.parse_literal()
        return BinaryOp(col, '=', val)

    def parse_condition(self):
        left = self.parse_literal_or_id()
        op = self.consume('OPERATOR').value
        right = self.parse_literal_or_id()
        condition = BinaryOp(left, op, right)
        
        if self.match(expected_value='AND') or self.match(expected_value='OR'):
            logical_op = self.tokens[self.pos-1].value
            next_cond = self.parse_condition()
            return BinaryOp(condition, logical_op, next_cond)
            
        return condition

    def parse_literal(self):
        token = self.current()
        if token.type in ('STRING', 'NUMBER'):
            return Literal(self.consume().value)
        raise SyntaxError(f"Expected literal at line {token.line}")

    def parse_literal_or_id(self):
        token = self.current()
        if token.type in ('STRING', 'NUMBER'):
            return Literal(self.consume().value)
        elif token.type == 'IDENTIFIER':
            return Identifier(self.consume().value)
        raise SyntaxError(f"Expected literal or identifier at line {token.line}")
