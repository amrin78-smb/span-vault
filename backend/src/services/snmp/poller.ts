// SpanVault - SNMP Poller Service
// Polls network devices via SNMP v2c for interface metrics
// Handles counter rollover, device reboot detection, and concurrency control

process.env.SPANVAULT_SERVICE = 'snmp-poller';

import * as snmp from 'net-snmp';
import { loadConfig } from '../../config/loader';
import { query, testConnection } from '../../db';
import { logger } from '../../utils/logger';

const config = loadConfig();

// SNMP OID definitions for interface metrics
const OIDs = {
  ifDescr:       '1.3.6.1.2.1.2.2.1.2',   // Interface name
  ifSpeed:       '1.3.6.1.2.1.2.2.1.5',   // Interface speed (32-bit)
  ifOperStatus:  '1.3.6.1.2.1.2.2.1.8',   // Operational status (1=up, 2=down)
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',   // Admin status
  ifInOctets:    '1.3.6.1.2.1.2.2.1.10',  // Inbound octets (32-bit counter)
  ifOutOctets:   '1.3.6.1.2.1.2.2.1.16',  // Outbound octets (32-bit counter)
  ifInErrors:    '1.3.6.1.2.1.2.2.1.14',  // Inbound errors
  ifOutErrors:   '1.3.6.1.2.1.2.2.1.20',  // Outbound errors
  ifInDiscards:  '1.3.6.1.2.1.2.2.1.13',  // Inbound discards
  ifOutDiscards: '1.3.6.1.2.1.2.2.1.19',  // Outbound discards
  // 64-bit counters (HC = High Capacity)
  ifHCInOctets:  '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
  sysUpTime:     '1.3.6.1.2.1.1.3.0',     // System uptime (for reboot detection)
};

// Counter cache to compute deltas between polls
interface CounterCache {
  timestamp:    number;
  inOctets:     bigint;
  outOctets:    bigint;
  inErrors:     bigint;
  outErrors:    bigint;
  inDiscards:   bigint;
  outDiscards:  bigint;
  sysUpTime:    number;
}

const counterCache = new Map<number, CounterCache>();

// Max 32-bit counter value - used for rollover detection
const MAX_32BIT = BigInt(4294967295);
const MAX_64BIT = BigInt('18446744073709551615');

// Safe BigInt conversion - handles null bytes and invalid values from some devices
function safeBigInt(val: unknown): bigint {
  try {
    const s = String(val ?? 0).replace(/\x00/g, '').replace(/[^0-9]/g, '') || '0';
    return BigInt(s);
  } catch {
    return BigInt(0);
  }
}

// Calculate delta handling counter rollover
function calcDelta(current: bigint, previous: bigint, is64bit: boolean): bigint {
  const maxVal = is64bit ? MAX_64BIT : MAX_32BIT;
  if (current >= previous) {
    return current - previous;
  }
  // Counter rolled over
  return maxVal - previous + current + BigInt(1);
}

// Open SNMP session for a device
function openSession(
  ipAddress: string,
  community: string
): snmp.Session {
  return snmp.createSession(ipAddress, community, {
    version:   snmp.Version2c,
    timeout:   config.snmp.timeout,
    retries:   config.snmp.retries,
  });
}

// Retrieve sysUpTime to detect device reboots
async function getSysUpTime(session: snmp.Session): Promise<number> {
  return new Promise((resolve, reject) => {
    session.get([OIDs.sysUpTime], (error, varbinds) => {
      if (error) return reject(error);
      const val = varbinds[0]?.value;
      resolve(typeof val === 'number' ? val : 0);
    });
  });
}

// Walk a table OID and return index -> value map
async function walkOid(
  session: snmp.Session,
  oid: string
): Promise<Map<number, unknown>> {
  return new Promise((resolve, reject) => {
    const results = new Map<number, unknown>();
    session.subtree(oid, 20, (varbinds) => {
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        // Extract interface index from OID (last segment)
        const parts = vb.oid.split('.');
        const ifIndex = parseInt(parts[parts.length - 1], 10);
        results.set(ifIndex, vb.value);
      }
    }, (err) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Poll a single device and save metrics to database
async function pollDevice(device: {
  id: number;
  ip_address: string;
  community: string;
  hostname: string;
}): Promise<void> {
  const session = openSession(device.ip_address, device.community || config.snmp.community);

  try {
    const now = Date.now();

    // Get system uptime first (reboot detection)
    const sysUpTime = await getSysUpTime(session);

    // Walk all interface OIDs in parallel
    const [
      descrMap, speedMap, operMap, adminMap,
      inOctetsMap, outOctetsMap,
      inErrMap, outErrMap, inDiscMap, outDiscMap,
      hcInMap, hcOutMap,
    ] = await Promise.all([
      walkOid(session, OIDs.ifDescr),
      walkOid(session, OIDs.ifSpeed),
      walkOid(session, OIDs.ifOperStatus),
      walkOid(session, OIDs.ifAdminStatus),
      walkOid(session, OIDs.ifInOctets),
      walkOid(session, OIDs.ifOutOctets),
      walkOid(session, OIDs.ifInErrors),
      walkOid(session, OIDs.ifOutErrors),
      walkOid(session, OIDs.ifInDiscards),
      walkOid(session, OIDs.ifOutDiscards),
      walkOid(session, OIDs.ifHCInOctets),
      walkOid(session, OIDs.ifHCOutOctets),
    ]);

    // Update device last_seen
    await query(
      `UPDATE devices SET last_seen = NOW(), status = 'up' WHERE id = $1`,
      [device.id]
    );

    for (const [ifIndex, descr] of descrMap) {
      const speed    = Number(speedMap.get(ifIndex) ?? 0);
      const operSt   = Number(operMap.get(ifIndex) ?? 2) === 1 ? 'up' : 'down';
      const adminSt  = Number(adminMap.get(ifIndex) ?? 2) === 1 ? 'up' : 'down';

      // Prefer 64-bit counters if available
      const has64bit  = hcInMap.has(ifIndex) && hcOutMap.has(ifIndex);
      const inOctets  = safeBigInt(has64bit ? hcInMap.get(ifIndex) : inOctetsMap.get(ifIndex) ?? 0);
      const outOctets = safeBigInt(has64bit ? hcOutMap.get(ifIndex) : outOctetsMap.get(ifIndex) ?? 0);
      const inErrors  = safeBigInt(inErrMap.get(ifIndex) ?? 0);
      const outErrors = safeBigInt(outErrMap.get(ifIndex) ?? 0);
      const inDisc    = safeBigInt(inDiscMap.get(ifIndex) ?? 0);
      const outDisc   = safeBigInt(outDiscMap.get(ifIndex) ?? 0);

      // Upsert interface record
      const ifRows = await query<{ id: number }>(
        `INSERT INTO interfaces (device_id, if_index, name, speed_bps, oper_status, admin_status, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (device_id, if_index) DO UPDATE SET
           name         = EXCLUDED.name,
           speed_bps    = EXCLUDED.speed_bps,
           oper_status  = EXCLUDED.oper_status,
           admin_status = EXCLUDED.admin_status,
           last_updated = NOW()
         RETURNING id`,
        [device.id, ifIndex, String(descr ?? `Interface ${ifIndex}`), speed, operSt, adminSt]
      );

      const interfaceId = ifRows[0]?.id;
      if (!interfaceId) continue;

      const cacheKey  = interfaceId;
      const cached    = counterCache.get(cacheKey);
      const intervalS = cached ? (now - cached.timestamp) / 1000 : config.snmp.pollIntervalSeconds;

      // Detect device reboot - if sysUpTime decreased, clear counter cache
      if (cached && sysUpTime < cached.sysUpTime) {
        logger.warn('Device reboot detected - clearing counter cache', {
          device: device.hostname, ifIndex,
        });
        counterCache.delete(cacheKey);
        continue;
      }

      if (cached && intervalS > 0) {
        const inDelta    = calcDelta(inOctets, cached.inOctets, has64bit);
        const outDelta   = calcDelta(outOctets, cached.outOctets, has64bit);
        const inErrDelta = calcDelta(inErrors, cached.inErrors, false);
        const outErrDelta= calcDelta(outErrors, cached.outErrors, false);
        const inDiscDelta= calcDelta(inDisc, cached.inDiscards, false);
        const outDiscDelta=calcDelta(outDisc, cached.outDiscards, false);

        // Convert octets/s to bits/s
        const inBps  = Number(inDelta  * BigInt(8)) / intervalS;
        const outBps = Number(outDelta * BigInt(8)) / intervalS;

        // Calculate utilization percentage
        const utilIn  = speed > 0 ? Math.min((inBps  / speed) * 100, 100) : 0;
        const utilOut = speed > 0 ? Math.min((outBps / speed) * 100, 100) : 0;

        // Insert metric into hypertable
        await query(
          `INSERT INTO interface_metrics
           (time, interface_id, in_bps, out_bps, in_errors, out_errors, in_discards, out_discards, util_in_pct, util_out_pct)
           VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            interfaceId,
            Math.round(inBps), Math.round(outBps),
            Number(inErrDelta), Number(outErrDelta),
            Number(inDiscDelta), Number(outDiscDelta),
            utilIn.toFixed(2), utilOut.toFixed(2),
          ]
        );

        // Check utilization thresholds and raise alerts if needed
        const maxUtil = Math.max(utilIn, utilOut);
        if (maxUtil >= config.thresholds.utilizationCriticalPercent) {
          await raiseAlert(device.id, 'high_utilization', 'critical',
            `Interface ${descr} utilization at ${maxUtil.toFixed(1)}% on ${device.hostname}`);
        } else if (maxUtil >= config.thresholds.utilizationWarningPercent) {
          await raiseAlert(device.id, 'high_utilization', 'warning',
            `Interface ${descr} utilization at ${maxUtil.toFixed(1)}% on ${device.hostname}`);
        }
      }

      // Update counter cache
      counterCache.set(cacheKey, {
        timestamp:   now,
        inOctets, outOctets, inErrors, outErrors,
        inDiscards:  inDisc, outDiscards: outDisc,
        sysUpTime,
      });
    }

    logger.debug(`SNMP poll complete`, { device: device.hostname, interfaces: descrMap.size });
  } catch (err) {
    logger.error('SNMP poll failed', { device: device.hostname, error: (err as Error).message });
    await query(
      `UPDATE devices SET status = 'unknown' WHERE id = $1`,
      [device.id]
    );
  } finally {
    session.close();
  }
}

// Raise an alert in the database (deduplicates active alerts)
async function raiseAlert(
  deviceId: number,
  alertType: string,
  severity: string,
  message: string
): Promise<void> {
  try {
    // Only insert if no active unresolved alert of same type exists
    await query(
      `INSERT INTO alerts (device_id, alert_type, severity, message)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM alerts
         WHERE device_id = $1 AND alert_type = $2 AND resolved = FALSE
       )`,
      [deviceId, alertType, severity, message]
    );
  } catch {
    // Non-critical - alert insertion failure should not stop polling
  }
}

// Main polling loop
async function runPoller(): Promise<void> {
  await testConnection();
  logger.info('SNMP Poller service started', {
    interval: config.snmp.pollIntervalSeconds,
    maxConcurrent: config.snmp.maxConcurrent,
  });

  const poll = async () => {
    // Fetch all SNMP-enabled devices
    const devices = await query<{
      id: number; ip_address: string; community: string; hostname: string;
    }>(`SELECT id, ip_address, community, hostname FROM devices WHERE snmp_enabled = TRUE`);

    logger.info(`Polling ${devices.length} devices`);

    // Poll in batches to respect maxConcurrent limit
    const batchSize = config.snmp.maxConcurrent;
    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(pollDevice));
    }
  };

  // Run immediately then on interval
  await poll();
  setInterval(poll, config.snmp.pollIntervalSeconds * 1000);
}

runPoller().catch((err) => {
  logger.error('SNMP Poller crashed', { error: err.message });
  process.exit(1);
});
