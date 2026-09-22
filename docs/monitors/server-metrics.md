---
title: Server Metrics
description: Understand how StatusHQ servers, agents, host samples, and attached monitors fit together.
---

# Server Metrics

Server metrics bring CPU, memory, and disk telemetry into StatusHQ. A small agent pushes samples from inside your infrastructure, so the monitored machine does not need a public inbound metrics port.

Server metrics are owned by a **Server**, not by a monitor. A Server owns one agent token, thresholds, a missed-push window, metric history, status, and server incidents. Any number of uptime, ping, port, or other monitors can attach to it.

## Server and monitor responsibilities

| Server | Monitor |
| --- | --- |
| Represents a physical or virtual machine | Represents an external check |
| Owns the metrics ingest token | Owns its URL, host, or check target |
| Stores CPU, memory, and disk samples | Stores availability and check results |
| Becomes `healthy`, `hot`, `quiet`, or `unknown` | Keeps its own up, down, degraded, or unknown state |
| Opens server heat and silence incidents | Opens incidents for its own failed checks |

A hot or quiet server does not overwrite the status of its attached monitors. Likewise, an unavailable site does not change the Server's metrics status.

## Data flow

1. Create a Server in the dashboard.
2. StatusHQ mints that Server's agent token.
3. Install an agent on the machine.
4. The agent samples CPU, memory, and disk and posts JSON to `/api/agent/{token}/metrics`.
5. StatusHQ stores the sample, evaluates each fresh host, updates the Server, and reconciles its incidents.
6. Attach the external monitors that run on that machine to show their relationship and blast radius.

## Payload

```bash
curl -fsS -X POST https://statushq.org/api/agent/<server-token>/metrics \
  -H "Content-Type: application/json" \
  -d '{"host":"web-01","cpuPercent":37.2,"ramPercent":38.4,"ramUsedMb":6112,"ramTotalMb":16384,"diskPercent":68}'
```

`cpuPercent`, `ramPercent`, `ramUsedMb`, and `ramTotalMb` are required. Percentages must be from 0 through 100, and memory values must be non-negative. `diskPercent` and `host` are optional.

The endpoint returns `422` for invalid metrics and `404` for an unknown token. Use a client that treats non-success HTTP responses as failures.

## Multiple hosts with one token

The `host` field separates machines or nodes that share one logical Server. StatusHQ normalizes the value and keeps the latest fresh reading for every host. If any fresh host crosses a threshold, the Server is hot. A healthy sample from another host cannot clear that breach.

For a single machine, keep the automatically reported hostname. For a pool, use stable unique host names. Host names are normalized to lowercase and limited to 64 characters.

## Next steps

- [Create and organize servers](/servers/)
- [Install the metrics agent](/servers/agent-installation)
- [Configure thresholds and incidents](/servers/thresholds-incidents)
- [Attach notification channels](/operate/notifications)
