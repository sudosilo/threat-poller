CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  repo TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tools_catalog (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  capability_tags TEXT[] NOT NULL DEFAULT '{}',
  name TEXT NOT NULL,
  vendor TEXT,
  license TEXT,
  url TEXT,
  discovered_from_repo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_checks (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  nickname TEXT,
  hash TEXT NOT NULL,
  changed BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_checks_url ON site_checks (url, checked_at DESC);
