'use client';
import useSWR from 'swr';
import { api, Summary, Alert, TopTalker, FlowBucket } from '@/lib/api';
import { subHours, format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { C, KpiTile, Card, CardTitle, ChartTip, PageHeader } from '@/components/shared/ui';
import { formatDistanceToNow } from 'date-fns';

const now = () => new Date().toISOString();
const h1  = () => subHours(new Date(), 1).toISOString();
const fmtBytes = (b: number) => b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : b > 1e3 ? `${(b/1e3).toFixed(1)} KB` : `${b} B`;

export default function DashboardPage() {
  const { data: summary } = useSWR<Summary>('summary',    api.getSummary,                         { refreshInterval: 30000 });
  const { data: alerts }  = useSWR<Alert[]>('alerts-d',  () => api.getAlerts(false),              { refreshInterval: 20000 });
  const { data: talkers } = useSWR<TopTalker[]>('talk',  () => api.getTopTalkers(h1(), now(), 8), { refreshInterval: 60000 });
  const { data: flow }    = useSWR<FlowBucket[]>('flow', () => api.getFlowTimeline(h1(), now()),  { refreshInterval: 60000 });

  const flowData   = (flow||[]).map(f => ({ time: format(new Date(f.bucket), 'HH:mm'), MB: +(f.total_bytes/1024/1024).toFixed(1) }));
  const talkerData = (talkers||[]).slice(0,6).map(t => ({ name: t.src_ip.split('.').slice(-2).join('.'), MB: +(t.total_bytes/1024/1024).toFixed(1) }));

  const up   = summary?.devices.up    ?? '—';
  const down = summary?.devices.down  ?? 0;
  const tot  = summary?.devices.total ?? '—';
  const crit = summary?.alerts.critical ?? 0;
  const warn = summary?.alerts.warning  ?? 0;
  const lat  = summary?.icmp.avg_latency;
  const loss = summary?.icmp.avg_loss ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Dashboard"
        sub="WAN visibility overview"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.muted }}>
            <span style={{ width: 8, height: 8, background: C.up, display: 'inline-block' }} />
            Live · auto-refreshes every 30s
          </div>
        }
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
        <KpiTile label="Devices Up"      value={up}                      sub={`of ${tot} total`}   color={C.up}   bg={C.upBg} />
        <KpiTile label="Devices Down"    value={down}                    sub="unreachable"          color={Number(down) > 0 ? C.crit : C.muted} bg={Number(down) > 0 ? C.critBg : C.surface} />
        <KpiTile label="Critical Alerts" value={crit}                    sub={`${warn} warnings`}  color={crit > 0 ? C.crit : C.muted} bg={crit > 0 ? C.critBg : C.surface} />
        <KpiTile label="Avg Latency"     value={lat ? `${lat} ms` : '—'} sub={`Packet loss: ${loss}%`} color={Number(loss) > 5 ? C.crit : C.info} bg={C.surface} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 2 }}>
        <Card>
          <CardTitle>Flow Volume — Last Hour</CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={flowData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.info} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={C.info} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false} />
              <XAxis dataKey="time" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} unit=" MB" />
              <Tooltip content={<ChartTip unit=" MB" />} />
              <Area type="monotone" dataKey="MB" name="Volume" stroke={C.info} fill="url(#fg)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle>Active Alerts</CardTitle>
          {!alerts?.length ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>All clear</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 220, overflowY: 'auto' }}>
              {alerts.slice(0, 8).map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: 4, flexShrink: 0, background: a.severity === 'critical' ? C.crit : C.warn }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{a.hostname || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Card>
          <CardTitle>Top Talkers — Last Hour</CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={talkerData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} unit=" MB" />
              <Tooltip content={<ChartTip unit=" MB" />} />
              <Bar dataKey="MB" name="Traffic" radius={[0,0,0,0]}>
                {talkerData.map((_, i) => <Cell key={i} fill={[C.info,'#7c3aed','#00b37e','#f59e0b','#e63946','#0891b2'][i % 6]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: 0 }}>
          <div style={{ padding: '20px 24px 0' }}><CardTitle>Top Talkers Detail</CardTitle></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {['#', 'Source', 'Destination', 'Volume'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Volume' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(talkers||[]).map((t, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: C.muted, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: '12px 20px', fontFamily: C.mono, fontSize: 13, fontWeight: 500, color: C.text }}>{t.src_ip}</td>
                  <td style={{ padding: '12px 20px', fontFamily: C.mono, fontSize: 13, color: C.sub }}>{t.dst_ip}</td>
                  <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: C.info, textAlign: 'right' }}>{fmtBytes(t.total_bytes)}</td>
                </tr>
              ))}
              {!talkers && <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: C.muted, fontSize: 14 }}>Loading…</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
