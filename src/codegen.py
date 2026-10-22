"""Generate JSON-argument MongoDB shell commands from validated AST nodes."""
import json
from ast_nodes import UnaryOp, Identifier, FunctionCall
from query_utils import output_label, aggregate_key, all_aggregates


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
        if getattr(self, 'post_group', False):
            if isinstance(node, FunctionCall):
                return '$' + self.aggregate_fields[aggregate_key(node)]
            if getattr(node, 'aggregate_reference', None):
                return '$' + self.aggregate_fields[node.aggregate_reference]
            if getattr(node, 'group_reference', False):
                return {'$ifNull': ['$_id', None]}
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

    label = staticmethod(output_label)

    def visit_SelectQuery(self, node):
        self.join_aliases = {}
        self.post_group = False
        base = node.table.name
        explain = [f"Scan collection '{base}'"]
        aggregates = list(all_aggregates(node))
        grouped = bool(node.group_by or aggregates)
        extended = node.order_by or node.limit is not None or any(getattr(f, 'alias', None) for f in node.fields)
        if not (node.joins or grouped or extended):
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
            alias = '__minisql_' + joined
            pipeline.extend([
                {'$lookup': {'from': joined, 'localField': self.path(left, base),
                             'foreignField': right.name.split('.', 1)[1], 'as': alias}},
                {'$unwind': '$' + alias},
            ])
            self.join_aliases[joined] = alias
            pipeline.append({'$match': {'$expr': {'$and': [
                {'$ne': [{'$ifNull': ['$' + self.path(left, base), None]}, None]},
                {'$ne': [{'$ifNull': ['$' + alias + '.' + right.name.split('.', 1)[1], None]}, None]},
            ]}}})
            explain.append(f"INNER JOIN '{joined}' using $lookup and $unwind")
        if node.where_clause:
            pipeline.append({'$match': self.parse_where(node.where_clause, base)})
            explain.append('Apply WHERE before grouping')
        if grouped:
            group = {'_id': self.operand(node.group_by, base) if node.group_by else None}
            normalize = {'_id': 1}
            defaults = {}
            self.aggregate_fields = {}
            for field in aggregates:
                key = aggregate_key(field)
                if key in self.aggregate_fields:
                    continue
                internal = f'__minisql_agg_{len(self.aggregate_fields)}'
                self.aggregate_fields[key] = internal
                value = self.operand(field.arg, base) if field.arg.name != '*' else None
                defaults[internal] = 0 if field.name == 'COUNT' else None
                if field.name == 'COUNT':
                    group[internal] = {'$sum': 1 if field.arg.name == '*' else {'$cond': [{'$ne': [value, None]}, 1, 0]}}
                    normalize[internal] = 1
                else:
                    group[internal] = {'$' + field.name.lower(): value}
                    normalize[internal] = 1
                    if field.name == 'SUM':
                        count = internal + '_nonnull'
                        group[count] = {'$sum': {'$cond': [{'$ne': [value, None]}, 1, 0]}}
                        normalize[internal] = {'$cond': [{'$gt': ['$' + count, 0]}, '$' + internal, None]}
            stages = [{'$group': group}, {'$project': normalize}]
            if node.group_by:
                pipeline.extend(stages)
            else:
                pipeline.extend([
                    {'$facet': {'stats': stages}},
                    {'$project': {'_id': 0, **{
                        name: {'$ifNull': [{'$arrayElemAt': ['$stats.' + name, 0]}, default]}
                        for name, default in defaults.items()}}},
                ])
            self.post_group = True
            explain.append('Group rows and calculate aggregates with SQL NULL semantics')
            if node.having:
                pipeline.append({'$match': self.parse_where(node.having, base)})
                explain.append('Apply HAVING to aggregate results')
        sort_fields = {}
        for index, order in enumerate(node.order_by):
            sort_fields[f'__minisql_sort_{index}'] = self.operand(order['expression'], base)
        if sort_fields:
            pipeline.append({'$addFields': sort_fields})
            pipeline.append({'$sort': {name: order['direction'] for name, order in zip(sort_fields, node.order_by)}})
            explain.append('Sort rows using ORDER BY')
        if node.offset:
            pipeline.append({'$skip': node.offset})
            explain.append(f'Skip {node.offset} rows')
        if node.limit is not None:
            pipeline.append({'$limit': node.limit} if node.limit else {'$match': {'$expr': {'$literal': False}}})
            explain.append(f'Return at most {node.limit} rows')
        if grouped:
            project = {'_id': 0}
            for field in node.fields:
                value = '$' + self.aggregate_fields[aggregate_key(field)] if isinstance(field, FunctionCall) else '$_id'
                project[output_label(field, bool(node.joins))] = value
            pipeline.append({'$project': project})
        elif node.fields[0].name != '*':
            pipeline.append({'$project': {'_id': 0, **{
                output_label(field, bool(node.joins)): self.operand(field, base) for field in node.fields}}})
        elif sort_fields:
            pipeline.append({'$project': {name: 0 for name in sort_fields}})
        query = self.command(base, 'aggregate', pipeline)
        self.post_group = False
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
