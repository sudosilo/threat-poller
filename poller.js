import { insertAlert, closePool } from "./db.js";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const HIGH_MULTIPLIER = 3;
const HISTORY_LENGTH = 14;
const DORMANT_DAYS = 60;

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json"
  };
}

async function fetchCurrentState(repo) {
  const headers = ghHeaders();

  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  const repoData = await repoRes.json();
  if (!repoRes.ok) {
    throw new Error(`repo fetch failed for ${repo}: ${repoData.message}`);
  }

  const commitsRes = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
  const commitsData = await commitsRes.json();
  if (!Array.isArray(commitsData)) {
    throw new Error(`commits fetch failed for ${repo}: ${commitsData.message}`);
  }
  const latestSha = commitsData[0] ? commitsData[0].sha : null;

  const releasesRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=1`, { headers });
  const releasesData = await releasesRes.json();
  if (!Array.isArray(releasesData)) {
    throw new Error(`releases fetch failed for ${repo}: ${releasesData.message}`);
  }
  const latestRelease = releasesData[0] ? releasesData[0].tag_name : null;

  return {
    sha: latestSha,
    release: latestRelease,
    pushedAt: repoData.pushed_at
  };
}

async function fetchRecentCommitCount(repo) {
  const headers = ghHeaders();
  const since = new Date(Date.now() - 86400000).toISOString();

  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`,
    { headers }
  );
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`commit count failed for ${repo}: ${data.message}`);
  }
  return data.length;
}

function checkCritical(repo, current, previous) {
  const alerts = [];
  if (current.sha !== previous.sha) {
    alerts.push(`new commit on ${repo}`);
  }
  if (current.release !== previous.release) {
    alerts.push(`new release on ${repo}, tag ${current.release}`);
  }
  return alerts;
}

function checkHighActivity(repo, count, history, multiplier) {
  if (history.length < 3) {
    return [];
  }
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  if (mean === 0) {
    return [];
  }
  if (count > mean * multiplier) {
    return [`${repo} commit rate ${count} in 24h, baseline ${mean.toFixed(1)}`];
  }
  return [];
}

function daysSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / 86400000;
}

function checkDormant(repo, current, previous, thresholdDays) {
  if (current.pushedAt === previous.pushedAt) {
    return [];
  }
  const quietFor = daysSince(previous.pushedAt);
  if (quietFor < thresholdDays) {
    return [];
  }
  return [`${repo} woke up after ${Math.floor(quietFor)} days quiet`];
}

async function checkOne(repo, category) {
  const current = await fetchCurrentState(repo);
  const previousRaw = await redis.get(`repo:${repo}`);

  if (!previousRaw) {
    if (category === "high") {
      current.history = [await fetchRecentCommitCount(repo)];
    }
    console.log(`${repo}: no previous state, saving baseline`);
    await redis.set(`repo:${repo}`, JSON.stringify(current));
    return;
  }

  const previous = JSON.parse(previousRaw);

  let alerts = [];

  if (category === "critical") {
    alerts = checkCritical(repo, current, previous);
  } else if (category === "high") {
    const count = await fetchRecentCommitCount(repo);
    const history = previous.history || [];
    alerts = checkHighActivity(repo, count, history, HIGH_MULTIPLIER);
    current.history = [...history, count].slice(-HISTORY_LENGTH);
    if (history.length < 3) {
      console.log(`${repo}: building baseline, ${history.length + 1} of 3 samples`);
    }
  } else if (category === "dormant") {
    alerts = checkDormant(repo, current, previous, DORMANT_DAYS);
  } else {
    console.log(`${repo}: unknown category ${category}, state updated only`);
  }

  for (const a of alerts) {
    console.log(`ALERT: ${a}`);
    await insertAlert(category, repo, category === "activity" ? "medium" : "high", a);
  }

  await redis.set(`repo:${repo}`, JSON.stringify(current));
}

async function runOnce() {
  const watchlist = await redis.smembers("watchlist");
  const categories = await redis.hgetall("category");

  if (watchlist.length === 0) {
    console.log("watchlist is empty, nothing to poll");
    return;
  }

  for (const repo of watchlist) {
    const category = categories[repo] || "critical";
    try {
      await checkOne(repo, category);
    } catch (err) {
      console.log(`ERROR on ${repo}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

runOnce().then(() => {
  console.log("Poll complete.");
  closePool();
  redis.disconnect();
});
