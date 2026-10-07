# MiniSQL to MongoDB Transpiler

This project is a compiler design implementation that translates a subset of standard SQL (MiniSQL) into MongoDB query language (MQL).

## Features
* **Zero Dependencies**: Built purely with Python 3 standard libraries to demonstrate deep understanding of compiler architecture.
* **Full Pipeline Implementation**:
  1. **Lexical Analysis (Scanner)**: Custom Regex-based tokenizer.
  2. **Syntax Analysis (Parser)**: Custom Recursive Descent Parser building a full Abstract Syntax Tree (AST).
  3. **Semantic Analysis**: Basic schema and structure validation.
  4. **Code Generation**: AST traversal outputting stringified MongoDB commands.
* **Interactive REPL**: A live shell to type SQL and immediately see the generated AST and MongoDB query.
* **JSON AST Output**: The AST can be printed as JSON for easy visualization and debugging.

## Supported SQL Commands
- `CREATE TABLE`
- `INSERT INTO ... VALUES`
- `SELECT ... FROM ... WHERE`
- `UPDATE ... SET ... WHERE`
- `DELETE FROM ... WHERE`
- **Advanced**: Aggregations (`COUNT`, `SUM`, `AVG`) and `GROUP BY` via MongoDB Aggregation Pipelines!

## Usage

### Run the Interactive REPL
```bash
python src/main.py
```

### Run a SQL Script File
```bash
python src/main.py examples/test.sql
```

## Example
**Input SQL:**
```sql
SELECT COUNT(id), SUM(age) FROM users GROUP BY age;
```

**Output MongoDB Query:**
```javascript
db.users.aggregate([{'$group': {'_id': '$age', 'count_id': {'$sum': 1}, 'sum_age': {'$sum': '$age'}}}])
```
