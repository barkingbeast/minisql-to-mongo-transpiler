"""Regex scanner for the supported MiniSQL grammar."""
import math
import re

TOKEN_TYPES = [
    ('COMMENT', r'--[^\n]*|/\*[\s\S]*?\*/'),
    ('KEYWORD', r'\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|AND|OR|NOT|GROUP|BY|COUNT|SUM|AVG|INNER|JOIN|ON|NULL|TRUE|FALSE|IS)\b'),
    ('IDENTIFIER', r'[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?'),
    ('NUMBER', r'[+-]?\d+(?:\.\d+)?'),
    ('STRING', r"""'(?:''|[^'])*'|"(?:""|[^"])*" """.strip()),
    ('OPERATOR', r'>=|<=|!=|<>|==|=|>|<'),
    ('PUNCTUATION', r'[(),;*]'),
    ('WHITESPACE', r'\s+'),
    ('MISMATCH', r'[\s\S]'),
]
TOKEN_REGEX = re.compile('|'.join('(?P<%s>%s)' % pair for pair in TOKEN_TYPES), re.IGNORECASE)


class Token:
    def __init__(self, type, value, line, column):
        self.type, self.value = type, value
        self.line, self.column = line, column

    def __repr__(self):
        return f'{self.type}({self.value})'


def tokenize(text):
    tokens = []
    line, column = 1, 1
    for match in TOKEN_REGEX.finditer(text):
        kind, raw = match.lastgroup, match.group()
        value = raw
        if kind == 'MISMATCH':
            raise SyntaxError(f'Unexpected character {value!r} at line {line}, column {column}')
        if kind == 'NUMBER':
            value = float(raw) if '.' in raw else int(raw)
            if isinstance(value, float) and not math.isfinite(value):
                raise SyntaxError(f'Number out of range at line {line}, column {column}')
        elif kind == 'STRING':
            value = raw[1:-1].replace(raw[0] * 2, raw[0])
        elif kind == 'KEYWORD':
            value = raw.upper()
        if kind not in ('WHITESPACE', 'COMMENT'):
            tokens.append(Token(kind, value, line, column))
        if '\n' in raw:
            line += raw.count('\n')
            column = len(raw.rsplit('\n', 1)[1]) + 1
        else:
            column += len(raw)
    return tokens
