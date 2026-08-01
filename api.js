import http from "http";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const r = await pool.query("SELECT category, repo, severity, message, created_at FROM alerts ORDER BY created_at DESC LIMIT 100");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(r.rows));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "query failed" }));
  }
}).listen(process.env.PORT || 3000);
