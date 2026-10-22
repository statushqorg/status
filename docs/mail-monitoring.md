# Mail delivery monitoring

Use the existing health monitor for the detailed, root-owned mail report. It
shows all 18 checks in the monitor's application health panel: TLS 1.2 and 1.3,
STARTTLS, padded TLS records, IMAP, delivery errors, DNSBL policy, disk space,
write durability and queued admin alerts. Reports older than 180 seconds,
future-dated reports, unavailable evidence and missing required checks fail.
HTTP 503 retains each failed check and its explanation.

Attach Discord to every monitor with `fires_on: both` for incident and recovery
notifications. A failed detailed check names the indicator in the incident
message. The root-owned mail watcher also sends to Discord when the set of
failing indicators changes, including a new failure during an existing outage,
and queues undelivered alerts durably. Unchanged failures do not repeat.
StatusHQ rejects unsuccessful chat transport results so its notification job's
three attempts and 30-second retry delay apply to Discord rejections and network
failures as well as thrown errors.

The suite adds external public-health, certificate and five TCP listener checks.
These run on the StatusHQ worker, independently of the mail host. The suite
sets `maxBackoffMultiplier: 1`, so outages do not stretch the configured polling
interval or delay recovery detection. Other monitors retain the default 16x cap. TCP checks
prove reachability; the detailed report proves the host's protocol and storage
checks. Synthetic receipt and forced storage-failure regressions also run in
the mail repository's CI. These checks reduce detection gaps; they do not prove
that every upstream sender delivered every individual message.

## Install into an existing account

First select an existing owner/admin account and its team. Configure at least one
enabled non-email notification channel in that same team, so mail outages can
still alert. Provision with the daemon's read-only health token on stdin:

```sh
secret-manager read mail-health-token | bun buddy mail:monitors \
  --email owner@example.com --team 9 --host mail.example.com --channels 12 --dry-run
```

Remove `--dry-run` to apply. The command creates eight monitors, keyed by a
stable hostname/check marker. Repeating it updates only those managed monitors,
preserves their history and existing channel attachments, and attaches the
selected channels to both incidents and recoveries. It refuses unknown accounts,
non-admin membership, cross-team channels and email-only routing before writing.
Tokens never appear in command arguments or output and grant no mailbox access.
Authenticated health requests refuse redirects to avoid disclosing the token.

The mail installer owns token generation and preserves it during deployments.
Use HTTPS `/health/report` for detailed monitoring and `/healthz` for public
availability. Mailbox passwords are separate credentials.
