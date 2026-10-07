import re

TOKEN_TYPES = [
    ('KEYWORD', r'\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|AND|OR|NOT|GROUP|BY|COUNT|SUM|AVG|INNER|JOIN|ON)\b'),
    ('IDENTIFIER', r'[a-zA-Z_][a-zA-Z0-9_\.]*'),
    ('NUMBER', r'\d+(\.\d+)?'),
    ('STRING', r"'[^']*'|\"[^\"]*\""),
    ('OPERATOR', r'>=|<=|!=|==|=|>|<'),
    ('PUNCTUATION', r'[\(\)\,\;\*]'),
    ('WHITESPACE', r'\s+'),
    ('MISMATCH', r'.'),
]

class Token:
    def __init__(self, type, value, line, column):
        self.type = type
        self.value = value
        self.line = line
        self.column = column
    def __repr__(self):
        return f"{self.type}({self.value})"

def tokenize(text):
    tok_regex = '|'.join('(?P<%s>%s)' % pair for pair in TOKEN_TYPES)
    line_num = 1
    line_start = 0
    tokens = []
    for mo in re.finditer(tok_regex, text, re.IGNORECASE):
        kind = mo.lastgroup
        value = mo.group()
        column = mo.start() - line_start
        if kind == 'NUMBER':
            value = float(value) if '.' in value else int(value)
        elif kind == 'STRING':
            value = value[1:-1]
        elif kind == 'KEYWORD':
            value = value.upper()
        elif kind == 'WHITESPACE':
            if '\n' in value:
                line_num += value.count('\n')
                line_start = mo.end()
            continue
        elif kind == 'MISMATCH':
            raise SyntaxError(f"Unexpected character {value!r} at line {line_num} column {column}")
        
        tokens.append(Token(kind, value, line_num, column))
    return tokens
