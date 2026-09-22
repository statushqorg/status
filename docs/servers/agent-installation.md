---
title: Agent installation
description: Install, verify, upgrade, rotate, and remove the StatusHQ metrics agent.
---

# Agent installation

The Server page contains an install command with that Server's token. Run it on the machine as root:

```bash
curl -fsSL https://statushq.org/install-agent.sh | sudo sh -s -- --token=<YOUR-SERVER-TOKEN>
```

The installer writes:

- `/usr/local/bin/statushq-agent`, a readable POSIX shell collector
- `/etc/statushq-agent.env`, the token and origin with mode `0600`
- A systemd service and timer, or `/etc/cron.d/statushq-agent` when systemd is unavailable

It immediately sends one sample. A bad token or blocked outbound connection therefore fails while you are still at the terminal.

## Requirements

The shell collector requires Linux, `curl`, `awk`, readable `/proc/stat`, readable `/proc/meminfo`, and `df`. CPU usage is measured from the change in kernel counters over one second. Memory uses `MemAvailable` where available.

## Installer options

| Flag | Default | Purpose |
| --- | --- | --- |
| `--token=<TOKEN>` | Required | Server metrics ingest token |
| `--url=<URL>` | `https://statushq.org` | Hosted or self-hosted StatusHQ origin |
| `--interval=<SEC>` | `60` | Seconds between systemd samples, minimum 10 |
| `--mount=<PATH>` | `/` | Filesystem used for disk percentage |
| `--uninstall` | None | Remove the collector, credentials, service, timer, and cron entry |

Cron scheduling has one-minute granularity and ignores a custom interval. Keep the effective interval below the Server's missed-push window.

## Verify the agent

```bash
systemctl list-timers statushq-agent.timer
journalctl -u statushq-agent.service -f
/usr/local/bin/statushq-agent
```

The collector uses `curl -f`, so `404`, `422`, and other HTTP errors make the service fail visibly.

## Upgrade or change settings

Re-run the installer with the desired token, URL, interval, and mount. It safely replaces the collector and configuration.

## Rotate a token

Rotate the token from the Server page if it may have been exposed. The old token stops working. Immediately re-run the new install command on every machine using that logical Server.

The token is a bearer credential for metrics submission. Store it like a secret even though it cannot read dashboard data.

## Uninstall

```bash
curl -fsSL https://statushq.org/install-agent.sh | sudo sh -s -- --uninstall
```

Removing the agent does not remove the Server in StatusHQ. After its window expires, a previously reporting Server becomes quiet and may open an incident. Delete or intentionally maintain the Server if monitoring is no longer required.

## Bun and Node package

Applications can use `@statushq/agent` instead of the shell collector. It supports one-shot reporting and a long-running reporter. Use the same Server token and set a stable `host` when several processes or machines share it.
