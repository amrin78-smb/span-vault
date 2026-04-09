'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { subHours, format } from 'date-fns';
import { formatDistanceToNow } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { C, Card, CardTitle, StatusBadge, SevPill, Btn, ChartTip } from '@/components/shared/ui';
import { api, IcmpMetric } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const RANGES = [
  { label: '1h',  hours: 1  },
  { label: '3h',  hours: 3  },
  { label: '6h',  hours: 6  },
  { label: '24h', hours: 24 },
];

interface DeviceDetail {
  device: any;
  target: { id: number; ip_address: string; label: string; priority: string } | null;
  icmp: {
    avg_latency_ms: string; min_latency_ms: string; max_latency_ms: string;
    avg_packet_loss: string; checks_up: string; checks_down: string; total_checks: string;
  } | null;
  alerts: any[];
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 160, fontSize: 12, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text }}>{value || '—'}</div>
    </div>
  );
}

export default function DeviceDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params?.id as string;
  const [range, setRange] = useState(3);

  const from = () => subHours(new Date(), range).toISOString();
  const to   = () => new Date().toISOString();

  const { data: detail, isLoading } = useSWR<DeviceDetail>(
    id ? `device-detail-${id}` : null,
    () => fetch(`${API}/api/metrics/device/${id}`).then(r => r.json()),
    { refreshInterval: 30000 }
  );

  const { data: icmpData } = useSWR<IcmpMetric[]>(
    detail?.target ? [`icmp-chart-${id}`, range] : null,
    () => api.getIcmpMetrics(detail!.target!.id, from(), to()),
    { refreshInterval: 30000 }
  );

  const chartData = (icmpData || []).map(d => ({
    time:    format(new Date(d.time), range <= 3 ? 'HH:mm' : 'HH:mm'),
    latency: d.latency_ms != null ? +Number(d.latency_ms).toFixed(2) : null,
    loss:    +Number(d.packet_loss).toFixed(1),
  })).filter(d => d.latency != null);

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontSize: 15 }}>Loading device…</div>;
  }

  if (!detail?.device) {
    return <div style={{ padding: 60, textAlign: 'center', color: C.crit }}>Device not found</div>;
  }

  const d    = detail.device;
  const icmp = detail.icmp;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <button
              onClick={() => router.push('/devices')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              ← Devices
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.5px', margin: 0 }}>{d.hostname}</h1>
            <StatusBadge status={d.status || 'unknown'} />
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontFamily: C.mono }}>{d.ip_address}</div>
        </div>

        {/* Time range selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {RANGES.map(r => (
            <button key={r.hours} onClick={() => setRange(r.hours)}
              style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: range === r.hours ? C.info : '#fff',
                color: range === r.hours ? '#fff' : C.muted,
                border: `1px solid ${range === r.hours ? C.info : C.border}`,
                borderRadius: 0,
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
        {[
          { label: 'Avg Latency',  value: icmp?.avg_latency_ms ? `${icmp.avg_latency_ms} ms` : '—', color: C.info },
          { label: 'Min Latency',  value: icmp?.min_latency_ms ? `${icmp.min_latency_ms} ms` : '—', color: C.up },
          { label: 'Max Latency',  value: icmp?.max_latency_ms ? `${icmp.max_latency_ms} ms` : '—', color: C.warn },
          { label: 'Packet Loss',  value: icmp?.avg_packet_loss ? `${icmp.avg_packet_loss}%` : '—', color: Number(icmp?.avg_packet_loss) > 5 ? C.crit : C.up },
          { label: 'Availability', value: icmp ? `${(Number(icmp.checks_up) / Math.max(Number(icmp.total_checks), 1) * 100).toFixed(1)}%` : '—', color: C.up },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: `1px solid ${C.border}`, padding: '16px 20px', borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color, letterSpacing: '-1px' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Last 1 hour</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

        {/* Latency chart */}
        <Card>
          <CardTitle>ICMP Latency — Last {range}h</CardTitle>
          {!chartData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.info} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={C.info} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false} />
                <XAxis dataKey="time" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit=" ms" />
                <Tooltip content={<ChartTip unit=" ms" />} />
                <Area type="monotone" dataKey="latency" name="Latency" stroke={C.info} fill="url(#latGrad)" strokeWidth={2} dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Packet loss chart */}
        <Card>
          <CardTitle>Packet Loss — Last {range}h</CardTitle>
          {!chartData.length ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.crit} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={C.crit} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false} />
                <XAxis dataKey="time" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<ChartTip unit="%" />} />
                <Area type="monotone" dataKey="loss" name="Packet Loss" stroke={C.crit} fill="url(#lossGrad)" strokeWidth={2} dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Bottom row - device info + alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

        {/* Device info */}
        <Card>
          <CardTitle>Device Information</CardTitle>
          <InfoRow label="Hostname"    value={d.hostname} />
          <InfoRow label="IP Address"  value={<span style={{ fontFamily: C.mono, color: C.info }}>{d.ip_address}</span>} />
          <InfoRow label="Site"        value={d.site_name} />
          <InfoRow label="Vendor"      value={d.vendor} />
          <InfoRow label="Model"       value={d.model} />
          <InfoRow label="Type"        value={<span style={{ textTransform: 'capitalize' }}>{d.device_type}</span>} />
          <InfoRow label="Priority"    value={<span style={{ textTransform: 'capitalize' }}>{d.priority}</span>} />
          <InfoRow label="ICMP Target" value={detail.target?.ip_address} />
          <InfoRow label="Last Seen"   value={d.last_seen ? formatDistanceToNow(new Date(d.last_seen), { addSuffix: true }) : 'Never'} />
        </Card>

        {/* Recent alerts */}
        <Card style={{ padding: 0 }}>
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
            <CardTitle style={{ marginBottom: 0 }}>Recent Alerts</CardTitle>
          </div>
          {!detail.alerts.length ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, color: C.muted }}>No alerts for this device</div>
            </div>
          ) : (
            <div>
              {detail.alerts.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 24px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', alignItems: 'flex-start' }}>
                  <div style={{ width: 3, height: 36, background: a.severity === 'critical' ? C.crit : C.warn, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <SevPill s={a.severity} />
                      <span style={{ fontSize: 11, color: C.muted }}>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {a.resolved ? '✓ Resolved' : a.acknowledged ? 'Acknowledged' : 'Pending'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
