from ast_nodes import *

class SemanticAnalyzer:
    def __init__(self):
        # schema: { table_name: { column_name: column_type } }
        self.schema = {}

    def analyze(self, ast_nodes):
        for node in ast_nodes:
            self.visit(node)

    def visit(self, node):
        method_name = f'visit_{node.__class__.__name__}'
        visitor = getattr(self, method_name, self.generic_visit)
        return visitor(node)

    def generic_visit(self, node):
        pass

    def visit_CreateTableQuery(self, node):
        table_name = node.table.name
        if table_name in self.schema:
            pass # We could print warning
        # node.columns is list of dicts like {'name': 'id', 'type': 'uuid'}
        self.schema[table_name] = {c['name']: c['type'] for c in node.columns}

    def check_where(self, where_clause, table_name):
        if not where_clause:
            return
        if isinstance(where_clause, BinaryOp):
            if where_clause.op in ['AND', 'OR']:
                self.check_where(where_clause.left, table_name)
                self.check_where(where_clause.right, table_name)
            else:
                # Comparison operator
                left = where_clause.left
                right = where_clause.right
                
                # Simple type check: Identifier vs Literal
                if isinstance(left, Identifier) and isinstance(right, Literal):
                    col_name = left.name
                    # Handle table.column
                    if '.' in col_name:
                        parts = col_name.split('.')
                        col_table = parts[0]
                        col_name = parts[1]
                    else:
                        col_table = table_name
                        
                    if col_table in self.schema and col_name in self.schema[col_table]:
                        col_type = self.schema[col_table][col_name]
                        val = right.value
                        
                        # Int type expects int or float
                        if col_type == 'int' and not isinstance(val, (int, float)):
                            raise TypeError(f"Type mismatch: Column '{left.name}' is of type {col_type}, but compared to '{val}'")
                        
                        # Text/UUID type expects string
                        if col_type in ['text', 'uuid'] and not isinstance(val, str):
                            raise TypeError(f"Type mismatch: Column '{left.name}' is of type {col_type}, but compared to {val}")

    def visit_SelectQuery(self, node):
        table_name = node.table.name
        if self.schema and table_name not in self.schema:
            raise ValueError(f"Table '{table_name}' does not exist.")
        self.check_where(node.where_clause, table_name)
            
    def visit_InsertQuery(self, node):
        table_name = node.table.name
        if self.schema and table_name not in self.schema:
            raise ValueError(f"Table '{table_name}' does not exist.")
        if len(node.columns) != len(node.values):
            raise ValueError(f"Column count ({len(node.columns)}) does not match value count ({len(node.values)}) for table '{table_name}'.")

    def visit_UpdateQuery(self, node):
        table_name = node.table.name
        if self.schema and table_name not in self.schema:
            raise ValueError(f"Table '{table_name}' does not exist.")
        self.check_where(node.where_clause, table_name)

    def visit_DeleteQuery(self, node):
        table_name = node.table.name
        if self.schema and table_name not in self.schema:
            raise ValueError(f"Table '{table_name}' does not exist.")
        self.check_where(node.where_clause, table_name)
