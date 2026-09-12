import { response } from '@stacksjs/router'
import CheckResult from '../../Models/CheckResult'
import Incident from '../../Models/Incident'
import IncidentUpdate from '../../Models/IncidentUpdate'
import { aggregateHostStatus, describeBreaches, normalizeHost, readingsFromRows } from '../../lib/agentHosts'
import { openIncident } from '../../lib/maintenance'
import { isActivelyPolled } from '../../lib/monitorTypes'
import { broadcastMonitorUpdate } from '../../Realtime/broadcastMonitorUpdate'
import { parseAgentMetricsPayload } from './metricsPayload'
import { evaluateBreaches, parseMetricsThresholds } from './metricsThresholds'

/**
 * The monitor-keyed ingest, exactly as it behaved before Servers existed —
 * moved here byte-for-byte rather than rewritten, so that between the deploy
 * of the server ingest and the `buddy servers:backfill` backfill every already
 * installed agent keeps working against the token still sitting on its
 * monitor.
 *
 * ReceiveMetricsAction resolves `servers.metrics_token` first and only falls
 * back to this when the token matches no server. Once the backfill has run,
 * every live token is on a server and nothing mints monitor tokens any more,
 * so this file is unreachable — it and the fallback branch are deleted in
 * ship step 6.
 *
 * Everything this does that the server path deliberately does NOT: it writes
 * monitors.status and monitors.consecutive_failures, it writes a check_results
 * row per sample (the agent-region voting bug), and it opens/resolves its
 * incident off a status EDGE rather than from state.
 */
export async function legacyReceiveMetrics(request: any, monitor: any): Promise<any> {
  const parsed = parseAgentMetricsPayload({
    cpuPercent: request.get('cpuPercent'),
    ramPercent: request.get('ramPercent'),
    ramUsedMb: request.get('ramUsedMb'),
    ramTotalMb: request.get('ramTotalMb'),
    diskPercent: request.get('diskPercent'),
    host: request.get('host'),
  })
  if (!parsed.ok) {
    return response.json(
      { success: false, message: parsed.error },
      { status: 422 },
    )
  }
  const { cpuPercent, ramPercent, ramUsedMb, ramTotalMb, diskPercent, hasDisk } = parsed.value

  // Which machine this sample describes. Absent for agents predating the
  // field, which normalize to a single 'default' host and behave exactly as
  // they did before.
  const host = normalizeHost(parsed.value.host)

  const thresholds = parseMetricsThresholds(monitor.config)
  const breaches = evaluateBreaches({ cpuPercent, ramPercent, diskPercent }, thresholds)
  // A breach is 'degraded', never 'down'. This sample exists because the
  // agent pushed it, so the machine is reachable — it is busy. Writing
  // 'down' made a 51%-against-50% CPU reading indistinguishable from the
  // host being switched off: it cost uptime, turned the pill red, and paged
  // the down-only channels. Genuine unreachability is CheckStaleMetrics'
  // job, off the absence of pushes rather than their contents.
  const sampleStatus: 'up' | 'degraded' = breaches.length > 0 ? 'degraded' : 'up'
  const checkedAt = new Date().toISOString()

  await CheckResult.create({
    monitor_id: monitor.id,
    status: sampleStatus,
    message: breaches.length > 0 ? `Threshold breach on ${host}: ${breaches.join('; ')}` : `Agent metrics received from ${host}`,
    // breaches are persisted so the monitor's status can be recomputed from
    // the stored samples without re-evaluating thresholds that may since
    // have been edited.
    metadata: JSON.stringify({ host, cpuPercent, ramPercent, ramUsedMb, ramTotalMb, ...(hasDisk ? { diskPercent } : {}), breaches }),
    region: 'agent',
    checkedAt: checkedAt,
  })

  // The monitor's status is the whole fleet's, not this sample's. With two
  // hosts pushing, taking the newest sample's verdict would flap the monitor
  // up and down once a minute as a breaching node and a healthy one take
  // turns reporting.
  const windowStart = new Date(Date.parse(checkedAt) - thresholds.windowSeconds * 1000).toISOString()
  const recent = await CheckResult.where('monitor_id', monitor.id)
    .where('region', 'agent')
    .where('checked_at', '>=', windowStart)
    .orderBy('checked_at', 'desc')
    .orderBy('id', 'desc')
    .get()

  const fleet = aggregateHostStatus(readingsFromRows(recent), Date.parse(checkedAt), thresholds.windowSeconds)
  const status = fleet.status

  const prev = monitor.status
  const consecutiveFailures = status === 'up' ? 0 : monitor.consecutive_failures + 1

  // `last_checked_at` is the ACTIVE PROBE's scheduling clock, not a generic
  // "we heard something" timestamp: DispatchDueChecks computes
  // `dueAt = last_checked_at + interval`, so advancing it here pushes the
  // next probe further out. An agent pushing faster than the monitor's
  // interval keeps dueAt permanently in the future and the probe stops
  // running entirely — production monitor 49 went unprobed from
  // 2026-08-21T08:44 (agent every ~30s, 60s interval), which in turn starved
  // CheckPerformanceTrends of response times and stranded two degradation
  // incidents with no data to recover on. Monitor 48 escaped only because
  // its agent pushed slightly slower than its own interval.
  //
  // So only a monitor nothing else probes may have its clock set from here;
  // for the rest the probe owns it. Agent freshness is tracked separately
  // off the last region='agent' CheckResult (see CheckStaleMetrics, which
  // learned the same lesson from the other direction).
  const clock = isActivelyPolled(monitor.type) ? {} : { last_checked_at: checkedAt }
  await monitor.update({ status, ...clock, consecutive_failures: consecutiveFailures })
  void broadcastMonitorUpdate(monitor.id)

  // This push is proof the agent is alive, so it clears any open missed-push
  // incident CheckStaleMetrics raised — unconditionally, not on a status
  // transition. That job deliberately does not write `status` for a
  // consensus-typed monitor (EvaluateMonitorConsensus owns that verdict), so
  // there is no down->up edge to hang the recovery off; keying on one would
  // leave the incident open forever once the agent came back.
  const staleIncidents = await Incident.where('monitor_id', monitor.id)
    .where('status', '!=', 'resolved')
    .get()
  for (const incident of staleIncidents) {
    let isMissedPush = false
    try {
      const impacted = JSON.parse((incident as any).impacted_checks || '[]')
      isMissedPush = Array.isArray(impacted) && impacted.some((entry: any) => entry?.reason === 'missed_push')
    }
    catch {
      isMissedPush = false
    }
    if (!isMissedPush)
      continue
    await (incident as any).update({ status: 'resolved', resolved_at: checkedAt })
    await IncidentUpdate.create({
      incident_id: (incident as any).id,
      message: 'Agent metrics are being received again.',
      status: 'resolved',
      posted_at: checkedAt,
    })
  }

  // Open on the down-transition, resolve on recovery — same shape as the
  // other monitor jobs so a metrics alert shows up in incident history and
  // notifications exactly like an uptime outage.
  if (prev !== 'degraded' && status === 'degraded') {
    await openIncident({
      monitor_id: monitor.id,
      started_at: checkedAt,
      // Named per host: "CPU 96% ≥ 90%" across a fleet does not say which
      // machine to open a shell on, which is the first thing the person
      // being woken up needs.
      cause: `Host resource threshold breached: ${describeBreaches(fleet.breaching)}`,
      status: 'investigating',
      impacted_checks: JSON.stringify([{
        type: 'server_metrics',
        hosts: fleet.breaching.map(reading => ({ host: reading.host, breaches: reading.breaches })),
      }]),
    })
  }
  // 'down' is included so a monitor left red by the pre-degraded ingest
  // still resolves its incident on recovery instead of staying open.
  else if ((prev === 'degraded' || prev === 'down') && status === 'up') {
    const existingIncident = await Incident.where('monitor_id', monitor.id)
      .where('status', '!=', 'resolved')
      .orderByDesc('created_at')
      .first()
    if (existingIncident) {
      await existingIncident.update({ status: 'resolved', resolved_at: checkedAt })
      await IncidentUpdate.create({
        incident_id: existingIncident.id,
        message: 'Host resource usage back within thresholds.',
        status: 'resolved',
        postedAt: checkedAt,
      })
    }
  }

  // `status` is the fleet's verdict and `sampleStatus` is this host's own,
  // which differ whenever another node is breaching. An agent that only saw
  // the fleet verdict could not tell whether it was the problem.
  return { success: true, status, host, sampleStatus, breaches, hosts: fleet.hosts.length }
}
