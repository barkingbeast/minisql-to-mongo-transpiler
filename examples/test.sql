CREATE TABLE users (id int, name varchar, age int);
INSERT INTO users (id, name, age) VALUES (1, 'Alice', 30);
SELECT name, age FROM users WHERE age >= 18;
UPDATE users SET age = 31 WHERE name = 'Alice';
DELETE FROM users WHERE age < 18;
SELECT COUNT(id), SUM(age) FROM users GROUP BY age;
