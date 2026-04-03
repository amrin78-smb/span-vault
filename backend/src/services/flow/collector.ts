// SpanVault - NetFlow v9 Collector Service
// Listens on UDP for NetFlow v9 datagrams
// Aggregates flows into 1-minute buckets and writes to flow_summary

process.env.SPANVAULT_SERVICE = 'flow-collector';

import * as dgram from 'dgram';
import { loadConfig } from '../../config/loader';
import { query, testConnection } from '../../db';
import { logger } from '../../utils/logger';

const config = loadConfig();

// NetFlow v9 field type constants
const NFV9_FIELDS: Record<number, string> = {
  1:  'IN_BYTES',
  2:  'IN_PKTS',
  4:  'PROTOCOL',
  7:  'L4_SRC_PORT',
  8:  'IPV4_SRC_ADDR',
  11: 'L4_DST_PORT',
  12: 'IPV4_DST_ADDR',
  21: 'LAST_SWITCHED',
  22: 'FIRST_SWITCHED',
  27: 'IPV6_SRC_ADDR',
  28: 'IPV6_DST_ADDR',
};

interface FlowTemplate {
  fields: Array<{ type: number; length: number }>;
}

interface FlowRecord {
  srcIp:    string;
  dstIp:    string;
  srcPort:  number;
  dstPort:  number;
  protocol: number;
  bytes:    number;
  packets:  number;
  deviceIp: string;
}

// Per-router template cache (NetFlow v9 sends templates dynamically)
const templateCache = new Map<string, Map<number, FlowTemplate>>();

// In-memory 1-minute bucket aggregator
// Key: "minute_bucket|src_ip|dst_ip|src_port|dst_port|protocol"
interface BucketEntry {
  timeBucket: Date;
  srcIp:      string;
  dstIp:      string;
  srcPort:    number;
  dstPort:    number;
  protocol:   number;
  bytes:      number;
  packets:    number;
  deviceIp:   string;
}

const flowBuckets = new Map<string, BucketEntry>();

// Get current 1-minute bucket timestamp
function getCurrentBucket(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

function bucketKey(srcIp: string, dstIp: string, srcPort: number, dstPort: number, protocol: number, bucket: Date): string {
  return `${bucket.getTime()}|${srcIp}|${dstIp}|${srcPort}|${dstPort}|${protocol}`;
}

// Aggregate a flow record into the current bucket
function aggregateFlow(flow: FlowRecord): void {
  const bucket = getCurrentBucket();
  const key    = bucketKey(flow.srcIp, flow.dstIp, flow.srcPort, flow.dstPort, flow.protocol, bucket);

  const existing = flowBuckets.get(key);
  if (existing) {
    existing.bytes   += flow.bytes;
    existing.packets += flow.packets;
  } else {
    flowBuckets.set(key, {
      timeBucket: bucket,
      srcIp:      flow.srcIp,
      dstIp:      flow.dstIp,
      srcPort:    flow.srcPort,
      dstPort:    flow.dstPort,
      protocol:   flow.protocol,
      bytes:      flow.bytes,
      packets:    flow.packets,
      deviceIp:   flow.deviceIp,
    });
  }
}

// Flush previous minute's buckets to database
async function flushBuckets(): Promise<void> {
  const currentBucket = getCurrentBucket();
  const toFlush: BucketEntry[] = [];

  for (const [key, entry] of flowBuckets.entries()) {
    if (entry.timeBucket.getTime() < currentBucket.getTime()) {
      toFlush.push(entry);
      flowBuckets.delete(key);
    }
  }

  if (toFlush.length === 0) return;

  logger.info(`Flushing ${toFlush.length} flow buckets to database`);

  for (const entry of toFlush) {
    try {
      // Look up device by IP
      const devices = await query<{ id: number }>(
        `SELECT id FROM devices WHERE ip_address = $1 LIMIT 1`,
        [entry.deviceIp]
      );
      const deviceId = devices[0]?.id ?? null;

      await query(
        `INSERT INTO flow_summary
         (time_bucket, src_ip, dst_ip, src_port, dst_port, protocol, bytes, packets, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.timeBucket, entry.srcIp, entry.dstIp,
          entry.srcPort, entry.dstPort, entry.protocol,
          entry.bytes, entry.packets, deviceId,
        ]
      );
    } catch (err) {
      logger.error('Failed to flush flow bucket', { error: (err as Error).message });
    }
  }
}

// Parse IPv4 address from 4-byte buffer
function parseIPv4(buf: Buffer, offset: number): string {
  return `${buf[offset]}.${buf[offset+1]}.${buf[offset+2]}.${buf[offset+3]}`;
}

// Parse a NetFlow v9 packet
function parseNetFlowV9(buffer: Buffer, remoteIp: string): void {
  try {
    if (buffer.length < 20) return;

    const version = buffer.readUInt16BE(0);
    if (version !== 9) {
      logger.debug('Non-NetFlow v9 packet received, skipping', { version });
      return;
    }

    const count      = buffer.readUInt16BE(2);
    // const sysUpTime  = buffer.readUInt32BE(4);
    // const unixSecs   = buffer.readUInt32BE(8);
    // const seqNumber  = buffer.readUInt32BE(12);
    const sourceId   = buffer.readUInt32BE(16);

    if (!templateCache.has(remoteIp)) {
      templateCache.set(remoteIp, new Map());
    }
    const routerTemplates = templateCache.get(remoteIp)!;

    let offset = 20;
    let flowSetCount = 0;

    while (offset < buffer.length && flowSetCount < count) {
      if (offset + 4 > buffer.length) break;

      const flowSetId = buffer.readUInt16BE(offset);
      const length    = buffer.readUInt16BE(offset + 2);

      if (length < 4 || offset + length > buffer.length) break;

      if (flowSetId === 0) {
        // Template FlowSet - parse and cache templates
        let tOffset = offset + 4;
        while (tOffset < offset + length - 4) {
          const templateId  = buffer.readUInt16BE(tOffset);
          const fieldCount  = buffer.readUInt16BE(tOffset + 2);
          tOffset += 4;

          const fields: Array<{ type: number; length: number }> = [];
          for (let i = 0; i < fieldCount; i++) {
            if (tOffset + 4 > offset + length) break;
            fields.push({
              type:   buffer.readUInt16BE(tOffset),
              length: buffer.readUInt16BE(tOffset + 2),
            });
            tOffset += 4;
          }
          routerTemplates.set(templateId, { fields });
          logger.debug('NetFlow template cached', { sourceId, templateId, fieldCount });
        }
      } else if (flowSetId >= 256) {
        // Data FlowSet - parse using cached template
        const template = routerTemplates.get(flowSetId);
        if (!template) {
          logger.debug('No template found for flowSetId', { flowSetId });
          offset += length;
          flowSetCount++;
          continue;
        }

        const recordSize = template.fields.reduce((sum, f) => sum + f.length, 0);
        if (recordSize === 0) {
          offset += length;
          flowSetCount++;
          continue;
        }

        let dOffset = offset + 4;
        while (dOffset + recordSize <= offset + length - 4) {
          const flow: Partial<FlowRecord> & { deviceIp: string } = { deviceIp: remoteIp };

          let fOffset = dOffset;
          for (const field of template.fields) {
            const fieldName = NFV9_FIELDS[field.type];
            const val = buffer.slice(fOffset, fOffset + field.length);

            if (fieldName === 'IPV4_SRC_ADDR' && field.length === 4) {
              flow.srcIp = parseIPv4(val, 0);
            } else if (fieldName === 'IPV4_DST_ADDR' && field.length === 4) {
              flow.dstIp = parseIPv4(val, 0);
            } else if (fieldName === 'IN_BYTES') {
              flow.bytes = field.length === 4 ? val.readUInt32BE(0) : Number(val.readBigUInt64BE(0));
            } else if (fieldName === 'IN_PKTS') {
              flow.packets = field.length === 4 ? val.readUInt32BE(0) : Number(val.readBigUInt64BE(0));
            } else if (fieldName === 'PROTOCOL' && field.length === 1) {
              flow.protocol = val[0];
            } else if (fieldName === 'L4_SRC_PORT' && field.length === 2) {
              flow.srcPort = val.readUInt16BE(0);
            } else if (fieldName === 'L4_DST_PORT' && field.length === 2) {
              flow.dstPort = val.readUInt16BE(0);
            }

            fOffset += field.length;
          }

          if (flow.srcIp && flow.dstIp) {
            aggregateFlow({
              srcIp:    flow.srcIp,
              dstIp:    flow.dstIp,
              srcPort:  flow.srcPort  ?? 0,
              dstPort:  flow.dstPort  ?? 0,
              protocol: flow.protocol ?? 0,
              bytes:    flow.bytes    ?? 0,
              packets:  flow.packets  ?? 0,
              deviceIp: remoteIp,
            });
          }

          dOffset += recordSize;
        }
      }

      offset += length;
      flowSetCount++;
    }
  } catch (err) {
    logger.error('NetFlow parse error', { error: (err as Error).message });
  }
}

async function runCollector(): Promise<void> {
  await testConnection();

  const udpPort = config.flow.udpPort;
  const server  = dgram.createSocket('udp4');

  server.on('error', (err) => {
    logger.error('UDP socket error', { error: err.message });
  });

  server.on('message', (msg, rinfo) => {
    parseNetFlowV9(msg, rinfo.address);
  });

  server.on('listening', () => {
    const addr = server.address();
    logger.info('NetFlow collector listening', { port: addr.port });
  });

  server.bind(udpPort);

  // Flush completed buckets every minute
  setInterval(flushBuckets, config.flow.aggregationIntervalSeconds * 1000);

  logger.info('Flow Collector service started', { udpPort });
}

runCollector().catch((err) => {
  logger.error('Flow Collector crashed', { error: err.message });
  process.exit(1);
});
