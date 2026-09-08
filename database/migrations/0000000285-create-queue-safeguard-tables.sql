-- The queue's safeguard tables.
--
-- @stacksjs/queue reads queue_circuit_state on every tick, and the worker has
-- been throwing "no such table: queue_circuit_state" roughly twice a second
-- since 2026-09-02 -- 192,000+ events into bughq off this one issue. The other
-- four are created by the same framework helper and were missing for the same
-- reason, so they are added together rather than one outage at a time.
--
-- Why they were absent: `buddy make:queue-table` creates these directly in the
-- database it is pointed at and writes no migration file, so running it on a
-- laptop does nothing for a deployed box. jobs and failed_jobs have migrations
-- here and therefore existed in production; these five never did.
--
-- DDL is taken verbatim from what the framework helper produced against sqlite,
-- read back out of sqlite_master rather than transcribed, so the columns match
-- what @stacksjs/queue expects. IF NOT EXISTS throughout, because any box where
-- the helper was already run by hand must migrate cleanly too.

CREATE TABLE IF NOT EXISTS queue_circuit_state (
      queue_name TEXT PRIMARY KEY,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      paused_at DATETIME,
      resume_at DATETIME
    );

CREATE TABLE IF NOT EXISTS job_batches (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            total_jobs INTEGER NOT NULL DEFAULT 0,
            pending_jobs INTEGER NOT NULL DEFAULT 0,
            failed_jobs INTEGER NOT NULL DEFAULT 0,
            failed_job_ids TEXT NOT NULL DEFAULT '[]',
            options TEXT,
            cancelled_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME
          );

CREATE TABLE IF NOT EXISTS job_idempotency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      job_name TEXT NOT NULL,
      queue TEXT NOT NULL DEFAULT 'default',
      dispatched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      connection TEXT NOT NULL,
      queue TEXT NOT NULL,
      payload TEXT NOT NULL,
      exception TEXT NOT NULL,
      reason TEXT NOT NULL,
      total_failures INTEGER NOT NULL DEFAULT 1,
      first_failed_at DATETIME,
      last_failed_at DATETIME,
      dead_lettered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS job_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      failure_count INTEGER NOT NULL DEFAULT 0,
      window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
      quarantined_at DATETIME,
      UNIQUE(job_name, payload_hash)
    );
