---
title: Thresholds and incidents
description: Understand server status, freshness windows, alert behavior, and maintenance.
---

# Thresholds and incidents

Each Server has CPU, memory, and disk thresholds plus a missed-push window.

## Defaults

| Setting | Default | Behavior |
| --- | --- | --- |
| CPU | `90%` | Breaches when CPU is greater than or equal to the threshold |
| Memory | `90%` | Breaches when memory is greater than or equal to the threshold |
| Disk | `85%` | Breaches when reported disk use is greater than or equal to the threshold |
| Missed-push window | `300` seconds | Becomes quiet when no sample arrives within the window |

Set a metric threshold to `0` to disable alerting for that metric. Disk is evaluated only when the agent includes it.

## Server states

| State | Meaning |
| --- | --- |
| `unknown` | No valid sample has ever arrived |
| `healthy` | Every fresh host is inside its thresholds |
| `hot` | At least one fresh host is breaching a threshold |
| `quiet` | A previously reporting Server has not pushed inside its window |

Freshness and thresholds use the same window. When a breaching host ages out while another host continues reporting, the stale reading stops holding the Server hot.

## Incident types

StatusHQ creates at most one open incident of each Server type:

- `server_hot` describes the current set of breaching hosts and metrics.
- `server_silent` describes an agent that stopped pushing within the configured window.

Changing which hosts or metrics are breaching updates the existing heat incident rather than paging again for a duplicate. A healthy push resolves the heat incident. Any fresh push proves the agent is alive and resolves a silence incident.

Server incidents are issues, not proof that a public site is down. They do not overwrite monitor status or availability history.

## Notifications

Server incidents use the notification routing associated with the Server's attached monitors. Attach the relevant monitors and configure their channels before relying on alerts.

## Maintenance windows

A Server does not have its own maintenance schedule. Its incidents are suppressed only when it has attached monitors and every attached monitor is inside a maintenance window. If any attached monitor is still being watched, a Server incident remains eligible for notification.

## Choosing a window

Use a window comfortably longer than the reporting interval and expected network jitter. For a 60-second agent, 300 seconds allows several missed sends without immediate noise. A shorter window detects silence sooner but is more sensitive to restarts and transient egress failures.
