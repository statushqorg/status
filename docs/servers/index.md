---
title: Servers
description: Model infrastructure separately from the external monitors that run on it.
---

# Servers

A Server represents one physical machine, virtual machine, or logical host pool. It is the parent for metrics collection and can be connected to any number of monitors.

## Why Servers are separate

One machine often runs several websites, APIs, cron jobs, or ports. If metrics belonged to one monitor, the same CPU history and alert thresholds would be duplicated across each check. StatusHQ keeps machine state on the Server and service state on each monitor.

## Create a Server

Open **Dashboard > Servers**, choose **Add a server**, then set:

- A recognizable name
- CPU threshold
- Memory threshold
- Disk threshold
- Missed-push window

New Servers begin as `unknown`. They do not create a silence incident until at least one sample has arrived. This gives you time to install the agent without producing a false alert.

## Attach monitors

From a Server page, choose **Manage monitors** and select the checks that run on the machine. A monitor can belong to at most one Server. Selecting a monitor that belongs to another Server moves it.

Attaching does not combine their health:

- The Server reports host resource and agent freshness state.
- Each monitor continues to report the result of its own check.
- The Server page lists attached monitor states to show possible blast radius.
- Monitor and site pages link back to full Server telemetry.

## Edit and delete

Changing a Server name, thresholds, or window does not rotate its token or alter monitor state. Deleting a Server removes its metric samples and server incidents, while its monitors are detached and kept.

## Team isolation

Servers, samples, attached monitors, and management actions are scoped to the active team. The token is hidden from general API serialization and appears only in the team-controlled agent setup experience.
