"""Shared naming and aggregate discovery for semantic analysis and generation."""
from ast_nodes import FunctionCall, UnaryOp, BinaryOp


def output_label(field, joined=False):
    if getattr(field, 'alias', None):
        return field.alias
    if isinstance(field, FunctionCall):
        return f'{field.name.lower()}_{field.arg.name.replace(".", "_").replace("*", "all")}'
    return field.name.replace('.', '_') if joined else field.name.split('.')[-1]


def aggregate_key(field):
    return field.name + ':' + getattr(field.arg, 'resolved_name', field.arg.name)


def aggregate_nodes(node):
    if isinstance(node, FunctionCall):
        yield node
    elif isinstance(node, UnaryOp):
        yield from aggregate_nodes(node.operand)
    elif isinstance(node, BinaryOp):
        yield from aggregate_nodes(node.left)
        yield from aggregate_nodes(node.right)


def all_aggregates(query):
    for field in query.fields:
        yield from aggregate_nodes(field)
    yield from aggregate_nodes(query.having)
    for order in query.order_by:
        yield from aggregate_nodes(order['expression'])
