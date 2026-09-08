-- #1839 — Auth: bearer tokens never expire — add expiry + rotation
--
-- Revoke every existing access + refresh token at the moment we ship
-- the short-lived (1h) access + refresh-token rotation model. Up until
-- now stacks-issued bearer tokens lived for 30 days with no refresh
-- path; if any of them have leaked, there has been no recovery
-- mechanism short of dropping these tables by hand. This migration
-- makes the cutover explicit and forces every existing client to
-- re-authenticate on its next request — which then issues a token
-- under the new model.
--
-- The migration is intentionally a hard wipe rather than a
-- conditional `expires_at > NOW + 24h` filter because:
--   1. At deploy time every row in these tables is legacy by
--      definition (the new code paths haven't run yet).
--   2. A hard wipe is portable across SQLite, Postgres and MySQL
--      without driver-specific date arithmetic in this SQL file.
--   3. There is no half-measure for this fix — leaving tokens that
--      were issued under the old contract in place would leave the
--      same leak/rotation gap the issue is trying to close.
--
-- Refresh tokens go first because of the FK to oauth_access_tokens
-- (no ON DELETE CASCADE in the original schema — see the
-- create-oauth_refresh_tokens migration).
-- Create-if-absent before deleting, added 2026-09-08.
--
-- These two tables have no creating migration: @stacksjs/auth builds them
-- lazily the first time a token is issued. On any box where that had not yet
-- happened, the DELETE below hit a missing table, `buddy migrate` exited 1, and
-- every later migration was blocked -- silently, because deploy-prod does not
-- fail when migrate does. That is why statushq's worker was missing its queue
-- tables and throwing "no such table: queue_circuit_state" twice a second for
-- six days.
--
-- Creating them here is a no-op where they already exist, and where they do not
-- there are no legacy tokens to revoke, so the DELETE that follows correctly
-- does nothing. The schema is read back from a database @stacksjs/auth itself
-- created, not transcribed, so it matches what the auth code expects.
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        oauth_client_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        name VARCHAR(255),
        scopes TEXT,
        revoked BOOLEAN NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        -- What the browser called itself and where it came from, so a person
        -- can recognise their own sessions well enough to revoke one. Null for
        -- a token minted by a script, which has neither.
        user_agent VARCHAR(255),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

DELETE FROM oauth_refresh_tokens;
DELETE FROM oauth_access_tokens;
