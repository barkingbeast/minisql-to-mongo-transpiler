from ast_nodes import *
import json

class CodeGenerator:
    def __init__(self):
        pass

    def generate(self, ast_nodes):
        queries = []
        explanations = []
        for node in ast_nodes:
            query, explanation = self.visit(node)
            queries.append(query)
            explanations.append(explanation)
        return queries, explanations

    def visit(self, node):
        method_name = f'visit_{node.__class__.__name__}'
        visitor = getattr(self, method_name, self.generic_visit)
        return visitor(node)

    def generic_visit(self, node):
        raise Exception(f'No visit_{node.__class__.__name__} method defined in codegen')

    def visit_SelectQuery(self, node):
        collection = node.table.name
        
        has_joins = hasattr(node, 'joins') and bool(node.joins)
        has_group = bool(node.group_by)
        has_agg_func = any(isinstance(f, FunctionCall) for f in node.fields)
        
        explanation = []
        explanation.append(f"Scan collection '{collection}'")
        
        # Aggregation pipeline
        if has_group or has_agg_func or has_joins:
            pipeline = []
            
            # 1. Joins ($lookup)
            if has_joins:
                for join in node.joins:
                    # Parse condition (e.g., A.id = B.user_id)
                    left = join.condition.left.name
                    right = join.condition.right.name
                    # Get field names without table prefix for local and foreign fields
                    local_field = left.split('.')[-1] if '.' in left else left
                    foreign_field = right.split('.')[-1] if '.' in right else right
                    
                    pipeline.append({
                        '$lookup': {
                            'from': join.table.name,
                            'localField': local_field,
                            'foreignField': foreign_field,
                            'as': f"{join.table.name}_joined"
                        }
                    })
                    explanation.append(f"Join with '{join.table.name}' matching {local_field} = {foreign_field}")

            # 2. Match stage
            if node.where_clause:
                pipeline.append({'$match': self.parse_where(node.where_clause)})
                explanation.append("Filter documents based on WHERE condition")
                
            # 3. Group stage
            if has_group or has_agg_func:
                group_stage = {'_id': f"${node.group_by.name}" if node.group_by else None}
                for field in node.fields:
                    if isinstance(field, FunctionCall):
                        if field.name == 'COUNT':
                            group_stage[f'count_{field.arg.name}'] = {'$sum': 1}
                        elif field.name in ('SUM', 'AVG'):
                            mongo_op = f"${field.name.lower()}"
                            group_stage[f'{field.name.lower()}_{field.arg.name}'] = {mongo_op: f"${field.arg.name}"}
                    elif isinstance(field, Identifier) and field.name != '*':
                        pass # Implicitly handled in _id if it's the group by field
                pipeline.append({'$group': group_stage})
                if has_group:
                    explanation.append(f"Group documents by '{node.group_by.name}' and compute aggregations")
                else:
                    explanation.append("Compute aggregations over the filtered documents")
            
            pipeline_str = json.dumps(pipeline, indent=2)
            # Adjust indentation for aggregate
            pipeline_str = pipeline_str.replace('\n', '\n    ')
            return f"db.{collection}.aggregate(\n    {pipeline_str}\n)", explanation
            
        else:
            # Simple Find
            query = self.parse_where(node.where_clause) if node.where_clause else {}
            if node.where_clause:
                explanation.append("Filter documents based on WHERE condition")
                
            projection = {}
            if len(node.fields) == 1 and isinstance(node.fields[0], Identifier) and node.fields[0].name == '*':
                explanation.append("Return all fields")
            else:
                for field in node.fields:
                    if isinstance(field, Identifier):
                        projection[field.name] = 1
                if projection:
                    projection['_id'] = 0
                explanation.append(f"Project specified fields: {list(projection.keys())}")
            
            query_str = json.dumps(query, indent=2).replace('\n', '\n    ') if query else "{}"
            proj_str = f",\n    {json.dumps(projection, indent=2).replace(chr(10), chr(10)+'    ')}" if projection else ""
            return f"db.{collection}.find(\n    {query_str}{proj_str}\n)", explanation

    def visit_InsertQuery(self, node):
        collection = node.table.name
        doc = {}
        for col, val in zip(node.columns, node.values):
            doc[col.name] = val.value
        doc_str = json.dumps(doc, indent=2).replace('\n', '\n    ')
        return f"db.{collection}.insertOne(\n    {doc_str}\n)", [f"Insert a single document into '{collection}'"]

    def visit_UpdateQuery(self, node):
        collection = node.table.name
        query = self.parse_where(node.where_clause) if node.where_clause else {}
        update_doc = {'$set': {}}
        for assign in node.set_clause:
            update_doc['$set'][assign.left.name] = assign.right.value
        query_str = json.dumps(query, indent=2).replace('\n', '\n    ') if query else "{}"
        update_str = json.dumps(update_doc, indent=2).replace('\n', '\n    ')
        return f"db.{collection}.updateMany(\n    {query_str},\n    {update_str}\n)", [f"Update documents in '{collection}' matching the condition"]

    def visit_DeleteQuery(self, node):
        collection = node.table.name
        query = self.parse_where(node.where_clause) if node.where_clause else {}
        query_str = json.dumps(query, indent=2).replace('\n', '\n    ') if query else "{}"
        return f"db.{collection}.deleteMany(\n    {query_str}\n)", [f"Delete documents from '{collection}' matching the condition"]

    def visit_CreateTableQuery(self, node):
        return f"db.createCollection('{node.table.name}')", [f"Create a new collection named '{node.table.name}'"]

    def parse_where(self, node):
        if not node: return {}
        if isinstance(node, BinaryOp):
            if node.op == 'AND':
                return {'$and': [self.parse_where(node.left), self.parse_where(node.right)]}
            elif node.op == 'OR':
                return {'$or': [self.parse_where(node.left), self.parse_where(node.right)]}
            else:
                field = node.left.name
                val = node.right.value
                op_map = {
                    '=': '$eq', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte', '!=': '$ne'
                }
                if node.op == '=':
                    return {field: val}
                return {field: {op_map[node.op]: val}}
        return {}
