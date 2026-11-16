-- The two tables behind `buddy hq:connect statushq` and the route checks that
-- follow it (app/Hq, routes/api.ts).
--
-- NOTE ON STYLE: no semicolons in these comments. The migration runner splits
-- the file on semicolons without first stripping comment lines.
--
-- `hq_connect_codes` holds pending and approved connect attempts. It is the
-- table of `connectCodesMigrationSql()` from `@stacksjs/hq/service`, written
-- out here because production applies committed files and generates none. No
-- secret is at rest in it: `code_hash` is the SHA-256 of the code the CLI
-- holds, and `sealed_grant` is the app's keys encrypted under a key derived
-- from that code. Rows live ten minutes and are pruned when a code is issued.
--
-- `hq_apps` is an app connected from the CLI: a name under a team, its two
-- keys, and the one monitor its routes are checked by once the app has sent
-- them. The keys are kept as issued because a second connect of the same app
-- answers the same keys, and each is found by its hash. `monitor_id` is not a
-- foreign key: deleting the monitor in the dashboard must not delete the app,
-- and the next sync sees the monitor gone and makes a new one.
--
-- Hand-written and additive, with no app/Models/*.ts behind either table.
CREATE TABLE IF NOT EXISTS hq_connect_codes (
  code_hash CHAR(64) NOT NULL,
  app VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  sealed_grant TEXT,
  claim CHAR(36),
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (code_hash)
);

CREATE TABLE IF NOT EXISTS hq_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  ingest_key TEXT NOT NULL,
  ingest_key_hash TEXT NOT NULL,
  read_key TEXT NOT NULL,
  read_key_hash TEXT NOT NULL,
  monitor_id INTEGER,
  routes_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS hq_apps_ingest_key_hash_unique ON hq_apps (ingest_key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS hq_apps_read_key_hash_unique ON hq_apps (read_key_hash);
CREATE INDEX IF NOT EXISTS hq_apps_team_id_index ON hq_apps (team_id);
