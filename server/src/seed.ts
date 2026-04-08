import { pool, migrate } from "./db.js";
import { createProject, upsertFile } from "./services/fileService.js";

await migrate();

const { rows: existing } = await pool.query(
  "SELECT id FROM users WHERE username = 'demo'",
);
let userId: number;
if (existing.length > 0) {
  userId = existing[0].id;
  console.log("[seed] demo user already exists — skipping reseed");
} else {
  const { rows } = await pool.query(
    "INSERT INTO users (username) VALUES ('demo') RETURNING id",
  );
  userId = rows[0].id;

  const py = await createProject(userId, "fizzbuzz-py", "python");
  await upsertFile(
    py.id,
    "main.py",
    `from helpers import fizzbuzz\n\nfor i in range(1, 21):\n    print(fizzbuzz(i))\n`,
  );
  await upsertFile(
    py.id,
    "helpers.py",
    `def fizzbuzz(n: int) -> str:\n    if n % 15 == 0:\n        return "FizzBuzz"\n    if n % 3 == 0:\n        return "Fizz"\n    if n % 5 == 0:\n        return "Buzz"\n    return str(n)\n`,
  );

  const js = await createProject(userId, "primes-node", "node");
  await upsertFile(
    js.id,
    "index.js",
    `const { primesUpTo } = require("./primes.js");\n\nconsole.log("primes < 50:", primesUpTo(50).join(", "));\n`,
  );
  await upsertFile(
    js.id,
    "primes.js",
    `function primesUpTo(n) {\n  const sieve = new Array(n).fill(true);\n  const out = [];\n  for (let i = 2; i < n; i++) {\n    if (!sieve[i]) continue;\n    out.push(i);\n    for (let j = i * i; j < n; j += i) sieve[j] = false;\n  }\n  return out;\n}\n\nmodule.exports = { primesUpTo };\n`,
  );
  console.log("[seed] created demo user + 2 projects");
}

await pool.end();
