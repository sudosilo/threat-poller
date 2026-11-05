import http from "http";
import crypto from "crypto";
import Redis from "ioredis";
import {
  getRecentAlerts,
  insertCatalogEntry,
  getCatalogEntries,
  insertSiteCheck,
  closePool
} from "./db.js";

const redis = new Redis(process.env.REDIS_URL);
const ADMIN_KEY = process.env.ADMIN_KEY;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function checkKey(body) {
  return ADMIN_KEY && body.key === ADMIN_KEY;
}

function stripToVisibleText(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.replace(/\s+/g, " ").trim();
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { send(res, 204, {}); return; }
  const url = new URL(req.url, "http://internal");
  const path = url.pathname;

  try {
    if (path === "/" && req.method === "GET") {
      const rows = await getRecentAlerts(100);
      send(res, 200, rows);
      return;
    }

    if (path === "/watchlist" && req.method === "GET") {
      const names = await redis.smembers("watchlist");
      const categories = await redis.hgetall("category");
      const out = names.map((n) => ({ repo: n, category: categories[n] || "critical" }));
      send(res, 200, out);
      return;
    }

    if (path === "/watchlist" && req.method === "POST") {
      const body = await readBody(req);
      if (!checkKey(body)) { send(res, 401, { error: "bad key" }); return; }
      if (!body.repo) { send(res, 400, { error: "repo required" }); return; }
      await redis.sadd("watchlist", body.repo);
      await redis.hset("category", body.repo, body.category || "critical");
      send(res, 200, { added: body.repo });
      return;
    }

    if (path === "/watchlist/remove" && req.method === "POST") {
      const body = await readBody(req);
      if (!checkKey(body)) { send(res, 401, { error: "bad key" }); return; }
      if (!body.repo) { send(res, 400, { error: "repo required" }); return; }
      await redis.srem("watchlist", body.repo);
      await redis.hdel("category", body.repo);
      send(res, 200, { removed: body.repo });
      return;
    }

    if (path === "/catalog" && req.method === "GET") {
      const rows = await getCatalogEntries();
      send(res, 200, rows);
      return;
    }

    if (path === "/catalog" && req.method === "POST") {
      const body = await readBody(req);
      if (!checkKey(body)) { send(res, 401, { error: "bad key" }); return; }
      if (!body.name || !body.category) { send(res, 400, { error: "name and category required" }); return; }
      const id = await insertCatalogEntry({
        category: body.category,
        capability_tags: body.capability_tags || [],
        name: body.name,
        vendor: body.vendor,
        license: body.license,
        url: body.url,
        discovered_from_repo: body.discovered_from_repo
      });
      send(res, 200, { id });
      return;
    }

    if (path === "/check" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.url) { send(res, 400, { error: "url required" }); return; }
      let pageRes;
      try {
        pageRes = await fetch(body.url, { redirect: "follow" });
      } catch (err) {
        send(res, 502, { error: "fetch failed", detail: err.message });
        return;
      }
      if (!pageRes.ok) {
        send(res, 502, { error: "server answered " + pageRes.status });
        return;
      }
      const html = await pageRes.text();
      const text = stripToVisibleText(html);
      const hash = crypto.createHash("sha256").update(text).digest("hex");

      const stateKey = "site:" + body.url;
      const previousRaw = await redis.get(stateKey);
      const changed = previousRaw !== null && previousRaw !== hash;
      await redis.set(stateKey, hash);
      await insertSiteCheck(body.url, body.nickname, hash, changed);

      send(res, 200, { url: body.url, hash, changed });
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: "server error", detail: err.message });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("api listening on " + port);
});

process.on("SIGTERM", async () => {
  await closePool();
  redis.disconnect();
  process.exit(0);
});
