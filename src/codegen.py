"""Generate JSON-argument MongoDB shell commands from validated AST nodes."""
import json
from ast_nodes import UnaryOp, Identifier, FunctionCall


class CodeGenerator:
    def generate(self, nodes):
        pairs = [getattr(self, f'visit_{type(node).__name__}')(node) for node in nodes]
        return [p[0] for p in pairs], [p[1] for p in pairs]

    @staticmethod
    def command(table, method, *args):
        arguments = ',\n    '.join(json.dumps(arg, indent=2, allow_nan=False).replace('\n', '\n    ') for arg in args)
        return f'db.getCollection({json.dumps(table)}).{method}(\n    {arguments}\n)'

    def path(self, identifier, base):
        name = getattr(identifier, 'resolved_name', identifier.name)
        if '.' not in name:
            return name
        table, column = name.split('.', 1)
        alias = getattr(self, 'join_aliases', {}).get(table, table)
        return column if table == base else f'{alias}.{column}'

    def operand(self, node, base):
        if isinstance(node, Identifier):
            return {'$ifNull': ['$' + self.path(node, base), None]}
        # $literal prevents strings starting with $ from becoming field references.
        return {'$literal': node.value}

    def expression(self, node, base, negate=False):
        if isinstance(node, UnaryOp):
            return self.expression(node.operand, base, not negate)
        if node.op in ('AND', 'OR'):
            logical = node.op if not negate else ('OR' if node.op == 'AND' else 'AND')
            return {'$' + logical.lower(): [self.expression(node.left, base, negate),
                                           self.expression(node.right, base, negate)]}
        left, right = self.operand(node.left, base), self.operand(node.right, base)
        op = node.op
        if op in ('IS', 'IS NOT'):
            equal = (op == 'IS') != negate
            return {'$eq' if equal else '$ne': [left, None]}
        if negate:
            op = {'=': '!=', '!=': '=', '>': '<=', '<': '>=', '>=': '<', '<=': '>'}[op]
        mongo = {'=': '$eq', '!=': '$ne', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte'}[op]
        # SQL comparisons involving NULL are UNKNOWN, including under NOT.
        return {'$and': [{'$ne': [left, None]}, {'$ne': [right, None]}, {mongo: [left, right]}]}

    def parse_where(self, node, base=''):
        return {'$expr': self.expression(node, base)} if node else {}

    @staticmethod
    def label(field, joined=False):
        if isinstance(field, FunctionCall):
            return f'{field.name.lower()}_{field.arg.name.replace(".", "_").replace("*", "all")}'
        return field.name.replace('.', '_') if joined else field.name.split('.')[-1]

    def visit_SelectQuery(self, node):
        self.join_aliases = {}
        base = node.table.name
        explain = [f"Scan collection '{base}'"]
        aggregation = bool(node.joins or node.group_by or any(isinstance(f, FunctionCall) for f in node.fields))
        if not aggregation:
            projection = {}
            if node.fields[0].name != '*':
                projection = {self.path(f, base): 1 for f in node.fields}
                if '_id' not in projection:
                    projection['_id'] = 0
            explain.append('Filter WHERE conditions and return selected fields')
            args = [self.parse_where(node.where_clause, base)]
            if projection:
                args.append(projection)
            return self.command(base, 'find', *args), explain
        pipeline = []
        for join in node.joins:
            left, right = join.condition.left, join.condition.right
            if left.name.split('.')[0] == join.table.name:
                left, right = right, left
            joined = join.table.name
            # A temporary array avoids overwriting an existing base-table column.
            alias = '__minisql_' + joined
            pipeline.extend([
                {'$lookup': {'from': joined, 'localField': self.path(left, base),
                             'foreignField': right.name.split('.', 1)[1], 'as': alias}},
                {'$unwind': '$' + alias},
            ])
            # Rewrite the joined table prefix to its actual array alias.
            self.join_aliases[joined] = alias
            pipeline.append({'$match': {'$expr': {'$and': [
                {'$ne': [{'$ifNull': ['$' + self.path(left, base), None]}, None]},
                {'$ne': [{'$ifNull': ['$' + alias + '.' + right.name.split('.', 1)[1], None]}, None]},
            ]}}})
            explain.append(f"INNER JOIN '{joined}' using $lookup and $unwind")
        # All joined field paths use aliases, including joins to earlier joined tables.
        if node.where_clause:
            pipeline.append({'$match': self.parse_where(node.where_clause, base)})
        grouped = bool(node.group_by or any(isinstance(f, FunctionCall) for f in node.fields))
        if grouped:
            group = {'_id': self.operand(node.group_by, base) if node.group_by else None}
            project = {'_id': 0}
            defaults = {}
            for index, field in enumerate(node.fields):
                label = self.label(field, bool(node.joins))
                if isinstance(field, FunctionCall):
                    value = self.operand(field.arg, base) if field.arg.name != '*' else None
                    if field.name == 'COUNT':
                        group[label] = {'$sum': 1 if field.arg.name == '*' else {'$cond': [{'$ne': [value, None]}, 1, 0]}}
                        defaults[label] = 0
                    else:
                        group[label] = {'$' + field.name.lower(): value}
                        defaults[label] = None
                        if field.name == 'SUM':
                            count_label = f'__minisql_nonnull_{index}'
                            group[count_label] = {'$sum': {'$cond': [{'$ne': [value, None]}, 1, 0]}}
                            project[label] = {'$cond': [{'$gt': ['$' + count_label, 0]}, '$' + label, None]}
                            continue
                    project[label] = 1
                else:
                    project[label] = '$_id'
            if node.group_by:
                pipeline.extend([{'$group': group}, {'$project': project}])
            else:
                # A facet preserves the one-row SQL aggregate result even on an empty input.
                pipeline.extend([
                    {'$facet': {'stats': [{'$group': group}, {'$project': project}]}},
                    {'$project': {'_id': 0, **{
                        label: {'$ifNull': [{'$arrayElemAt': ['$stats.' + label, 0]}, default]}
                        for label, default in defaults.items()}}},
                ])
            explain.append('Group rows and compute SQL aggregates (COUNT ignores NULL columns)')
        elif node.fields[0].name != '*':
            pipeline.append({'$project': {'_id': 0, **{
                self.label(f, bool(node.joins)): '$' + self.path(f, base) for f in node.fields}}})
        query = self.command(base, 'aggregate', pipeline)
        self.join_aliases = {}
        return query, explain

    def visit_InsertQuery(self, node):
        docs = [{c.name: value.value for c, value in zip(node.columns, row)} for row in node.rows]
        method = 'insertOne' if len(docs) == 1 else 'insertMany'
        return self.command(node.table.name, method, docs[0] if len(docs) == 1 else docs), ['Insert documents']

    def visit_UpdateQuery(self, node):
        base = node.table.name
        update = {'$set': {a.left.name.split('.')[-1]: a.right.value for a in node.set_clause}}
        return self.command(base, 'updateMany', self.parse_where(node.where_clause, base), update), ['Update matching documents']

    def visit_DeleteQuery(self, node):
        base = node.table.name
        return self.command(base, 'deleteMany', self.parse_where(node.where_clause, base)), ['Delete matching documents']

    def visit_CreateTableQuery(self, node):
        return f'db.createCollection({json.dumps(node.table.name)})', ['Create collection; SQL types are validated by the compiler']
