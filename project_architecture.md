# MiniSQL to MongoDB Transpiler

## 1. Project Overview & Problem Statement
A transpiler that converts a subset of standard SQL (MiniSQL) into MongoDB queries (MQL). The goal is to demonstrate core compiler design principles (Lexical Analysis, Syntax Analysis, Semantic Analysis, Intermediate Representation, and Code Generation) in a practical, modern use case.

## 2. Supported Language Subset (MiniSQL)
To secure full marks, the transpiler should support a comprehensive set of operations:
*   **DDL**: `CREATE TABLE` -> `db.createCollection()`
*   **DML**:
    *   `INSERT INTO` -> `db.collection.insertOne()` / `insertMany()`
    *   `SELECT ... FROM ... WHERE ...` -> `db.collection.find()`
    *   `UPDATE ... SET ... WHERE ...` -> `db.collection.updateMany()`
    *   `DELETE FROM ... WHERE ...` -> `db.collection.deleteMany()`
*   **Advanced Features (Crucial for Top Grades)**:
    *   Aggregations (`COUNT`, `SUM`, `AVG`, `GROUP BY`) -> MongoDB Aggregation Pipeline (`$match`, `$group`, `$project`).
    *   Joins (`INNER JOIN`) -> MongoDB `$lookup`.
    *   Logical operators (`AND`, `OR`, `NOT`) and comparison operators (`=`, `>`, `<`, `>=`, `<=`, `!=`).

## 3. Compiler Architecture Pipeline

The project should strictly follow the standard compiler phases.

### Phase 1: Lexical Analysis (Scanner / Tokenizer)
*   **Responsibility**: Read the MiniSQL source code character by character and convert it into a stream of tokens (e.g., `KEYWORD(SELECT)`, `IDENTIFIER(users)`, `OPERATOR(>=)`, `LITERAL(18)`).
*   **Implementation**: Use a lexer generator like Lex/Flex, ANTLR, or PLY (Python Lex-Yacc), or write a custom regex-based tokenizer.
*   **Error Handling**: Detect invalid characters or malformed tokens.

### Phase 2: Syntax Analysis (Parser)
*   **Responsibility**: Process the token stream and ensure it conforms to the MiniSQL grammar. Build an Abstract Syntax Tree (AST).
*   **Implementation**: Define a Context-Free Grammar (CFG) for MiniSQL. Use a parser generator like Yacc/Bison, ANTLR, or implement a Recursive Descent Parser.
*   **Error Handling**: Provide meaningful syntax error messages with line and column numbers.

### Phase 3: Semantic Analysis
*   **Responsibility**: Enforce rules that cannot be captured by the grammar alone.
*   **Checks to implement**:
    *   Table existence validation (mocked schema).
    *   Column existence validation.
    *   Type checking (e.g., trying to use `SUM()` on a string column).

### Phase 4: Intermediate Representation (IR) - *Optional but Recommended*
*   **Responsibility**: Convert the AST into an intermediate, database-agnostic representation. Relational Algebra trees work perfectly here.
*   **Benefit**: Shows a deeper understanding of compiler design.

### Phase 5: Code Generation (Transpilation)
*   **Responsibility**: Walk the AST (or IR) and generate the equivalent MongoDB query string (e.g., Node.js syntax, Python PyMongo syntax, or raw mongo shell commands).

## 4. Recommended Tech Stack
*   **Language**: Python 3.x (Highly recommended for rapid prototyping and excellent text processing).
*   **Parser Generator**:
    *   **PLY (Python Lex-Yacc)**: Classic, educational, and easy to map to compiler theory.
    *   **Lark**: Modern, highly readable grammar definitions.
    *   **ANTLR4**: Industry standard, generates beautiful parse trees.
*   **Testing**: PyTest.
*   **Documentation**: Markdown & Graphviz (for AST visualizations).

## 5. Project Folder Structure
```text
compiler-project/
│
├── src/
│   ├── lexer.py         # Tokenization logic
│   ├── parser.py        # Grammar rules and AST generation
│   ├── ast_nodes.py     # Classes for AST nodes
│   ├── semantic.py      # Semantic validation rules
│   ├── codegen.py       # MongoDB query generation
│   └── main.py          # CLI entry point
│
├── tests/
│   ├── test_lexer.py
│   ├── test_parser.py
│   └── test_codegen.py
│
├── docs/                # Architecture diagrams and AST visual examples
├── examples/            # Sample .sql files and their .js (MongoDB) outputs
└── README.md
```

## 6. How to Get Full Marks (The "Wow" Factor)
1.  **Interactive REPL**: Build a command-line interface where the professor can type SQL and immediately see the generated MongoDB query (similar to the Python or Node shell).
2.  **AST Visualization**: Integrate a library like Graphviz to automatically generate PNG images of the AST for a given query. Visuals are incredibly impactful during a demo.
3.  **Detailed Error Reporting**: Instead of crashing with "Syntax Error", output something like: `Syntax Error at line 1, column 15: Expected identifier after SELECT`.
4.  **Support Aggregations & Joins**: Translating basic CRUD is easy. Translating `GROUP BY` into the MongoDB Aggregation Pipeline (`$group`) demonstrates advanced mastery of tree traversal.
5.  **Comprehensive Test Suite**: Have a folder of 20+ SQL files testing edge cases, deeply nested queries, and deliberate errors. 
