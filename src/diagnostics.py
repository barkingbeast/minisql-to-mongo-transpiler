"""Structured compiler diagnostics shared by the HTTP and browser clients."""
from functools import wraps


class CompileError(SyntaxError):
    def __init__(self, message, phase='syntax', location=None):
        self.message = message
        self.phase = phase
        self.location = location or {'line': 1, 'column': 1, 'end_line': 1, 'end_column': 1}
        super().__init__(message)

    def __str__(self):
        return f"{self.message} at line {self.location['line']}, column {self.location['column']}"

    def to_dict(self):
        return {'message': self.message, 'phase': self.phase, **self.location}


def diagnostic_node(method):
    """Keep the location of the innermost semantic node that failed."""
    @wraps(method)
    def wrapped(self, node, *args, **kwargs):
        try:
            return method(self, node, *args, **kwargs)
        except CompileError:
            raise
        except (ValueError, TypeError) as error:
            raise CompileError(str(error), 'semantic', getattr(node, 'location', None)) from error
    return wrapped
