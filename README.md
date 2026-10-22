# MiniSQL to MongoDB Transpiler

An educational compiler that translates a documented SQL subset into MongoDB shell commands.
The same Python lexer, recursive descent parser, AST, semantic analyzer and generator run in the
CLI, local API and browser (Pyodide).

## Run locally

Python 3.10 or newer is required.

```sh
python -m pip install -r requirements.txt
python server.py
```

Open http://localhost:8000. Click **EXECUTE** to compile and **RUN_DEMO** to execute the generated
commands in an isolated in-memory mongomock database. **RESET_DB** restores the sample users
and orders. This is a MongoDB simulation, not a connection to a production MongoDB server.

The server binds to loopback only. Execution sessions are separated by an HttpOnly,
SameSite=Strict cookie, expire after one hour of inactivity, and disappear when the server stops.
Tabs in the same browser cookie session share that demo database. A batch is not transactional;
a database error can leave earlier commands in that batch applied.

The compiler CLI itself has no third-party dependencies:

```sh
python src/main.py
python src/main.py examples/test.sql
```

The REPL retains table definitions between successful commands. File mode exits with a nonzero
status on a failed compilation or unreadable file.

## Supported MiniSQL

- CREATE TABLE with INT/INTEGER/BIGINT, FLOAT/REAL/DOUBLE/NUMBER, TEXT/VARCHAR/CHAR/UUID,
  BOOL/BOOLEAN and TIME/DATE/TIMESTAMP columns. Date/time/UUID values are represented as strings.
  VARCHAR/CHAR sizes are accepted as syntax; lengths and database constraints are not enforced.
- INSERT INTO with explicit columns, or inferred columns from the schema; one or multiple VALUES rows.
- SELECT *, field projections, WHERE, UPDATE SET, DELETE FROM.
- Comparisons =, ==, !=, <>, >, <, >=, <=; column-to-column and literal-to-column comparisons.
- NOT, AND, OR, parentheses, IS NULL, IS NOT NULL; NOT binds before AND, which binds before OR.
- COUNT(*), COUNT(column), SUM(column), AVG(column), MIN(column), MAX(column), and one GROUP BY column.
- Column and aggregate aliases with AS; multi-field ORDER BY with ASC/DESC (including output aliases).
- LIMIT with optional OFFSET; LIMIT 0 produces an empty result.
- HAVING with aggregate expressions, aggregate aliases, grouped fields, and nested boolean conditions.
- JOIN and INNER JOIN with one equality between qualified fields; chained joins are supported.
- Signed numbers, TRUE/FALSE/NULL, single or double quoted strings with doubled quote escaping,
  -- line comments and /* block comments */.
- Multiple statements separated by semicolons; the final semicolon is optional.

Table aliases, self joins, outer joins, subqueries, DISTINCT, constraints and
arithmetic expressions are not supported. Unsupported syntax returns an error.
Names are case-sensitive, keywords and type names are case-insensitive.
The prefix __minisql_ is reserved for compiler-generated fields.

With a schema, validation checks table/column existence, ambiguous references, value types,
numeric aggregates, INSERT row widths, duplicate columns, JOIN conditions and GROUP BY fields.
Schema Map supplies the browser schema and starts with the sample users/orders definitions.
CREATE TABLE statements in the submitted SQL can add or replace those definitions for compilation.
The compiler does not execute SQL DDL against an external database or enforce constraints in MongoDB.

Without a schema (CLI/API), standalone queries can compile against unknown collections. Such queries
are syntax-checked, but column/type validation requires CREATE TABLE statements or a supplied schema.
Qualify field names in schemaless JOIN queries.

### Example

```sql
SELECT users.name, SUM(orders.total)
FROM users
INNER JOIN orders ON users.id = orders.user_id
WHERE users.age >= 18 AND orders.status = 'COMPLETED'
GROUP BY users.name;
```

The generated pipeline uses $lookup, $unwind, $match, $group and $project.
With the sample data, RUN_DEMO returns:

```json
[
  {"users_name": "Alice", "sum_orders_total": 200},
  {"users_name": "Charlie", "sum_orders_total": 100}
]
```

Qualified projected names are flattened for JOIN output (users.name becomes users_name);
aggregate labels use count_all, count_age, sum_orders_total, etc.
COUNT(column) excludes null/missing values. An ungrouped aggregate on empty input returns
one row: counts are zero and SUM/AVG/MIN/MAX are null. Explicit projections omit MongoDB's generated _id
unless requested. SELECT * retains MongoDB document shapes, including nested JOIN documents.

## UI features

- Schema Map: edit table/column definitions and generate CREATE TABLE SQL.
- Debug: step through actual tokens, AST, validation status and generated MongoDB commands.
- Walkthrough: after compilation, watch tokens become an expandable AST, schema checks and generated
  MongoDB commands. Includes Play/Pause, phase selection, Previous/Next and arrow-key navigation.
  Autoplay is off when the browser requests reduced motion.
- Error highlighting: lexical, syntax and semantic diagnostics underline the offending token, mark its
  line and gutter, and offer a Go to error action. Missing input at EOF is marked with a caret.
- Explain: inspect the generated execution plan.
- History: local query history, safely rendered as text.
- Demo execution and reset: temporary sample data, with stale output disabled after an edit.

Query history is stored locally when browser storage is available. Schema changes are kept for the
current page session; refresh restores the default map.

### Review celebration

Enter this valid SQL and click EXECUTE:

```sql
CREATE TABLE Dr_BASKARAN_P (
    title TEXT,
    compiler_power INT
);
```

After successful compilation, the supplied portrait flips and travels around the screen with
confetti, the message **DR. BASKARAN P — THE BEST COMPILER DESIGN TEACHER!**, and:

```text
✓ Knowledge: UNLIMITED
✓ Syntax errors: Too scared to appear
✓ Quiz marks: 10/20
```

The celebration closes after eight seconds or with Escape/Close, then returns focus to EXECUTE.
Reduced-motion users see a stationary portrait. Only this CREATE TABLE AST triggers it; strings,
comments, failed compilations, Debug and Walkthrough do not trigger the celebration.

## Static hosting / GitHub Pages

The deploy workflow tests the project, bundles src/*.py into public/src/, and deploys public/.
No Python server is required: Pyodide runs the same compiler and mongomock demo inside the tab.
The browser initially downloads Pyodide and, on first RUN_DEMO, installs the pinned pure-Python
demo dependencies. This requires network access to the CDNs/package index. Browser demo data
is isolated per tab and resets on reload. Compilation and execution use that same browser engine
once the static fallback is selected.

To preview the static build locally:

```sh
python scripts/build_site.py
python -m http.server 8001 --bind 127.0.0.1 --directory public
```

Open http://localhost:8001. No Supabase credentials are required. Supabase's Postgres database
is not used as a MongoDB executor; cloud authentication or durable saved projects would be a
separate integration.

## Local API

POST JSON to:

- /api/transpile: {"sql": "...", "schema": {"users": {"id": "int"}}}. Schema is optional.
- /api/execute: {"mql": "..."}. Only supported MongoDB methods with JSON arguments are accepted.
- /api/reset: {}. Resets only the calling browser's demo session.

GET /api/health reports the mock execution engine.
The executor never evaluates Python/JavaScript or exposes raw database/SQL access.
It restricts methods and aggregation stages, caps request sizes, and limits returned documents.
It is a local educational demo server, not an internet-facing deployment server.

## Tests

```sh
python -m unittest discover -s tests -v
node --check public/script.js
node --check public/pyodide_bridge.js
node --check public/easter_eggs.js
node --check public/professor_celebration.js
node --check public/walkthrough.js
```

Tests include comparisons against SQLite for boolean expressions, joins, grouping, null and
empty-aggregate behavior; parser and semantic failures; CRUD; command restrictions; API session
isolation/reset; path traversal and request validation; and CLI output/exit codes.
Extended tests compare sorting, aliases, pagination, MIN/MAX and HAVING against SQLite and
verify exact error spans, leading whitespace and EOF locations.
