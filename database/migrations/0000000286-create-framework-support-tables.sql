-- Two tables the framework reads that this app never had a migration for.
--
-- `payment_webhook_events` is where @stacksjs/payments remembers the Stripe
-- events it has already handled, by provider and event id. Without the table a
-- redelivered event is recognised only inside the process that saw it first,
-- so a restart between two deliveries handles the same event twice.
--
-- `queue_workers` is where each queue worker writes its heartbeat. Without it
-- the worker logs "Queue worker telemetry unavailable" and the dashboard has
-- no workers to show.
--
-- Why they were absent: both arrived in the framework after this app was
-- created, and an app with its own app/Models does not receive the framework's
-- model migrations. Production applies committed files and generates none.
--
-- Hand-written and additive; no app/Models/*.ts. Same shape as the
-- framework's own migrations for these tables.
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "provider" TEXT not null,
  "event_id" TEXT not null,
  "processed_at" TEXT not null,
  "created_at" TEXT not null default CURRENT_TIMESTAMP,
  "updated_at" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_unique" ON "payment_webhook_events" ("provider", "event_id");

CREATE TABLE IF NOT EXISTS "queue_workers" (
  "worker_id" TEXT PRIMARY KEY,
  "snapshot" TEXT not null,
  "heartbeat_at" INTEGER not null
);
CREATE INDEX IF NOT EXISTS "queue_workers_heartbeat_at_index" ON "queue_workers" ("heartbeat_at");
