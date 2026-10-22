"""Regex scanner for the supported MiniSQL grammar."""
import math
import re
from diagnostics import CompileError

TOKEN_TYPES = [
    ('COMMENT', r'--[^\n]*|/\*[\s\S]*?\*/'),
    ('KEYWORD', r'\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|AND|OR|NOT|GROUP|BY|COUNT|SUM|AVG|MIN|MAX|INNER|JOIN|ON|NULL|TRUE|FALSE|IS|AS|ORDER|ASC|DESC|LIMIT|OFFSET|HAVING)\b'),
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
    def __init__(self, type, value, line, column, end_line=None, end_column=None):
        self.type, self.value = type, value
        self.line, self.column = line, column
        self.end_line = end_line or line
        self.end_column = end_column if end_column is not None else column + len(str(value))

    def __repr__(self):
        return f'{self.type}({self.value})'


def tokenize(text):
    tokens = []
    line, column = 1, 1
    for match in TOKEN_REGEX.finditer(text):
        kind, raw = match.lastgroup, match.group()
        value = raw
        if kind == 'MISMATCH':
            message = 'Unclosed string literal' if value in ("'", '"') else f'Unexpected character {value!r}'
            raise CompileError(message, 'lexical', {'line': line, 'column': column, 'end_line': line, 'end_column': column + 1})
        if kind == 'NUMBER':
            value = float(raw) if '.' in raw else int(raw)
            if isinstance(value, float) and not math.isfinite(value):
                raise CompileError('Number out of range', 'lexical', {'line': line, 'column': column,
                    'end_line': line, 'end_column': column + len(raw)})
        elif kind == 'STRING':
            value = raw[1:-1].replace(raw[0] * 2, raw[0])
        elif kind == 'KEYWORD':
            value = raw.upper()
        if kind not in ('WHITESPACE', 'COMMENT'):
            end_line = line + raw.count('\n')
            end_column = len(raw.rsplit('\n', 1)[1]) + 1 if '\n' in raw else column + len(raw)
            tokens.append(Token(kind, value, line, column, end_line, end_column))
        if '\n' in raw:
            line += raw.count('\n')
            column = len(raw.rsplit('\n', 1)[1]) + 1
        else:
            column += len(raw)
    return tokens
