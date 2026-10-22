/* Always-visible review presets; independent of saved/recent query history. */
(function (root) {
    const queries = [
        {title:'01 · Filter, sort and paginate', note:'Explain WHERE → ORDER BY → LIMIT/OFFSET. Compare results below the AST.', kind:'query', sql:`SELECT name, age FROM users
WHERE age >= 18
ORDER BY age DESC LIMIT 2 OFFSET 0;`},
        {title:'02 · JOIN + aggregate pipeline', note:'Main demo: show AST, walkthrough, $lookup/$unwind/$group, pipeline stages and matching results.', kind:'query', sql:`SELECT users.name, SUM(orders.total) AS spending
FROM users JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'COMPLETED'
GROUP BY users.name
ORDER BY spending DESC, users.name ASC;`},
        {title:'03 · HAVING + five aggregate functions', note:'Explain WHERE vs HAVING, output aliases and aggregate calculations.', kind:'query', sql:`SELECT status, COUNT(*) AS order_count, SUM(total) AS total_amount,
AVG(total) AS average_amount, MIN(total) AS smallest, MAX(total) AS largest
FROM orders GROUP BY status
HAVING SUM(total) >= 100
ORDER BY total_amount DESC;`},
        {title:'04 · Boolean expressions and NULL checks', note:'Show NOT/AND/OR precedence, parentheses and IS NOT NULL.', kind:'query', sql:`SELECT name, age FROM users
WHERE NOT (age < 18 OR name IS NULL)
AND age <= 30
ORDER BY name;`},
        {title:'05 · Full CRUD lifecycle', note:'EXECUTE compiles; RUN_DEMO runs the batch. RESET_DB before repeating this demo. Use other presets for result comparison.', kind:'query', sql:`CREATE TABLE review_demo (id INT, topic TEXT);
INSERT INTO review_demo (id, topic) VALUES (1, 'Lexer'), (2, 'Parser');
SELECT id, topic FROM review_demo;
UPDATE review_demo SET topic = 'AST' WHERE id = 2;
SELECT id, topic FROM review_demo;
DELETE FROM review_demo WHERE id = 1;
SELECT id, topic FROM review_demo;`},
        {title:'06 · Semantic error (intentional)', note:'Show unknown-column validation and the highlighted error token. This is supposed to fail.', kind:'error', sql:'SELECT salary FROM users;'},
        {title:'07 · Syntax error (intentional)', note:'Show parser diagnostics: missing FROM, line/column and Go to error. This is supposed to fail.', kind:'error', sql:'SELECT name users;'},
        {title:'08 · Dhawal boss fight 🏃', note:'Easter egg: EXECUTE to play as Sir. Dodge excuses; Space or OBJECTION activates the shield.', kind:'egg', sql:'RUN FROM CLASS;'},
        {title:'09 · Professor celebration 🎉', note:'EXECUTE to reveal the existing professor appreciation Easter egg.', kind:'egg', sql:`CREATE TABLE Dr_BASKARAN_P (
    title TEXT,
    compiler_power INT
);`}
    ];
    root.MiniSQLReview = queries;
    if (typeof module !== 'undefined') module.exports = queries;
})(typeof window === 'undefined' ? globalThis : window);
