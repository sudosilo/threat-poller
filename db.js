import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

export async function insertAlert(category, repo, severity, message) {
  await pool.query(
    "INSERT INTO alerts (category, repo, severity, message) VALUES ($1, $2, $3, $4)",
    [category, repo, severity, message]
  );
}

export async function getRecentAlerts(limit) {
  const r = await pool.query(
    "SELECT category, repo, severity, message, created_at FROM alerts ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return r.rows;
}

export async function insertCatalogEntry(entry) {
  const r = await pool.query(
    "INSERT INTO tools_catalog (category, capability_tags, name, vendor, license, url, discovered_from_repo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [entry.category, entry.capability_tags || [], entry.name, entry.vendor || null, entry.license || null, entry.url || null, entry.discovered_from_repo || null]
  );
  return r.rows[0].id;
}

export async function getCatalogEntries() {
  const r = await pool.query(
    "SELECT id, category, capability_tags, name, vendor, license, url, discovered_from_repo, created_at FROM tools_catalog ORDER BY created_at DESC"
  );
  return r.rows;
}

export async function insertSiteCheck(url, nickname, hash, changed) {
  await pool.query(
    "INSERT INTO site_checks (url, nickname, hash, changed) VALUES ($1, $2, $3, $4)",
    [url, nickname || null, hash, changed]
  );
}

export async function getSiteCheckHistory(url, limit) {
  const r = await pool.query(
    "SELECT url, nickname, hash, changed, checked_at FROM site_checks WHERE url = $1 ORDER BY checked_at DESC LIMIT $2",
    [url, limit]
  );
  return r.rows;
}

export async function closePool() {
  await pool.end();
}
