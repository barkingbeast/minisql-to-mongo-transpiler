import json

class ASTNode:
    def to_dict(self):
        def convert(value):
            if isinstance(value, ASTNode):
                return value.to_dict()
            if isinstance(value, list):
                return [convert(item) for item in value]
            if isinstance(value, dict):
                return {key: convert(item) for key, item in value.items()}
            return value
        return {"type": self.__class__.__name__, **{key: convert(value) for key, value in self.__dict__.items()}}
    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)

class SelectQuery(ASTNode):
    def __init__(self, fields, table, where_clause=None, group_by=None, joins=None):
        self.fields = fields
        self.table = table
        self.where_clause = where_clause
        self.group_by = group_by
        self.joins = joins or []
        self.having = None
        self.order_by = []
        self.limit = None
        self.offset = 0

class JoinClause(ASTNode):
    def __init__(self, table, condition):
        self.table = table
        self.condition = condition

class InsertQuery(ASTNode):
    def __init__(self, table, columns, values):
        self.table = table
        self.columns = columns
        self.values = values

class UpdateQuery(ASTNode):
    def __init__(self, table, set_clause, where_clause=None):
        self.table = table
        self.set_clause = set_clause
        self.where_clause = where_clause

class DeleteQuery(ASTNode):
    def __init__(self, table, where_clause=None):
        self.table = table
        self.where_clause = where_clause

class CreateTableQuery(ASTNode):
    def __init__(self, table, columns):
        self.table = table
        self.columns = columns

class BinaryOp(ASTNode):
    def __init__(self, left, op, right):
        self.left = left
        self.op = op
        self.right = right

class Identifier(ASTNode):
    def __init__(self, name):
        self.name = name

class UnaryOp(ASTNode):
    def __init__(self, op, operand):
        self.op = op
        self.operand = operand

class Literal(ASTNode):
    def __init__(self, value):
        self.value = value

class FunctionCall(ASTNode):
    def __init__(self, name, arg):
        self.name = name
        self.arg = arg
