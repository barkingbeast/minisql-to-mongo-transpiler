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

Projects autosave locally when browser storage is available. **Save project** forces a save;
**Export JSON** and **Import JSON** round-trip the SQL, schema, PK/FK metadata, table positions
and query history using a validated versioned project file (max 2 MB). Reload restores the saved
project. Demo database contents remain temporary and are not part of project files.

### Result comparison and pipeline inspection

Below the AST, **Compare results** executes one SELECT in SQLite and the MongoDB simulation
against the calling session's current demo data. It never applies writes. It checks duplicate counts,
uses a small floating-point tolerance, and checks row order when ORDER BY is present. SELECT *
is flattened to schema columns for comparison (including joins); MongoDB's automatic _id is omitted
unless declared in the schema. Both tables and any differences are shown. Dialect differences are
reported rather than hidden. Nested source values are not supported by the SQLite comparison.
Outputs are cleared when the query/schema changes or the demo database is run/reset.

The optional **Pipeline / Watch the data** panel shows actual documents and counts at every
pipeline stage, with input, stage navigation, previous/next and up to 50 sample documents per stage.
For simple find queries, the equivalent match/project stages are inspected. Inspection rejects
intermediate results over 500 documents instead of presenting a truncated total as complete.
Click **Hide** to hide it temporarily. To remove it independently, remove just the
`pipeline_visualizer.js` script tag from `public/index.html`; the module creates its own panel and
does not affect comparison, schema editing or the compiler.

### Editable relationships

In Schema Map, click **PK** to select one primary-key column per table. Choose another column's
reference dropdown to link to an exact PK column of the same type. Connections show N:1 and
attach to column rows. Stable IDs keep links through renames and movement; removing a referenced
column/table or replacing a PK clears affected links. Incompatible type edits display an error until
corrected. Composite keys are not supported. These relationships are design metadata saved in
projects; MongoDB constraints are not enforced, and Generate SQL emits the supported column/type
DDL without PK/FK clauses.

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

### Review-ready History Log

History always starts with nine pinned review demonstrations, including for existing saved projects.
Each button includes a title, what to explain and the SQL. Clicking loads it; EXECUTE compiles it.
The sequence covers filter/sort/pagination; JOIN + aggregation; HAVING and five aggregate functions;
boolean/NULL checks; the full CRUD lifecycle; intentional semantic/syntax errors; the Dhawal game;
and the professor celebration. User history stays below the pinned group and is not replaced.
For CRUD, RUN_DEMO executes the batch; RESET_DB before repeating. The read-only SELECT presets
work with both result comparison and pipeline inspection. ORDER BY ties in the main JOIN demo use
a second sort column for deterministic engine comparisons.

### Classroom chase Easter egg: Sir vs Dhawal

Choose **08 · Dhawal boss fight** in History, or enter `RUN FROM CLASS;`
(or `SELECT * FROM attendance;`) and click EXECUTE. The opening shows Dhawal escaping the
first compiler-design class and Sir chasing him, using the existing professor portrait and the supplied Dhawal photo. Dhawal’s photo avatar dances
and performs somersaults in the opening, chase and escape ending. Motion pauses with the game;
reduced-motion preferences disable the flips and dancing. The original photo is preserved as an asset.

You play as Sir. There are **three lives and a 400-point target**, with three escalating phases:
The Great Escape, Viva Panic and Reply-All Apocalypse. Targeted attacks and two-lane barrages
have visible danger warnings and always leave a safe lane. The guaranteed safe lane changes on
each wave. Later phases shorten both warning and travel time. Use left/right, A/D, or touch buttons.

- **OBJECTION! / Space:** a 0.65-second shield with a five-second cooldown. Blocking saves a
  life but awards no points and resets your combo. It is not an unlimited escape button.
- **Combos:** 10 points per dodge, rising to x2 at four consecutive dodges and x3 at eight.
- **Close calls:** leaving an incoming attack lane in the final 0.23 seconds earns +5 on a dodge.
- **Coffee:** every fifth wave has a pickup in the safe lane; catching it subtracts two seconds
  from the shield cooldown. It never damages Sir.

Pause/Resume (or P), automatic background pause, replay and Escape/Close are supported.
Winning animates Sir's fictional email addressed to **Dhawal**. Losing awards Dhawal a degree in
“Advanced Excuse Engineering”. No real email is sent. A new best-score key separates this harder
edition from the original five-dodge game. Reduced-motion users get simplified decorative motion.
Existing Easter eggs and the professor appreciation celebration remain available.

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
- /api/compare: {"sql": "SELECT name FROM users;", "schema": {...}}. Read-only SQLite vs mongomock comparison.
- /api/pipeline: same payload; read-only intermediate stage snapshots.
- /api/reset: {}. Resets only the calling browser's demo session.

GET /api/health reports the mock execution engine.
The executor never evaluates Python/JavaScript or exposes raw database/SQL access.
It restricts methods and aggregation stages, caps request sizes, and limits returned documents.
It is a local educational demo server, not an internet-facing deployment server.

## Tests

```sh
python -m unittest discover -s tests -v
node tests/test_browser_logic.cjs
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
