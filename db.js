import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function insertAlert(category, repo, severity, message) {
  await pool.query(
    "INSERT INTO alerts (category, repo, severity, message) VALUES ($1, $2, $3, $4)",
    [category, repo, severity, message]
  );
}

export async function closePool() {
  await pool.end();
}
