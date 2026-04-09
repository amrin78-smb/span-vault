'use client';
import useSWR from 'swr';
import { api, Summary, Alert } from '@/lib/api';
import { subHours, format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C, KpiTile, Card, CardTitle, ChartTip, PageHeader } from '@/components/shared/ui';
import { formatDistanceToNow } from 'date-fns';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const now = () => new Date().toISOString();
const h1  = () => subHours(new Date(), 1).toISOString();
const h3  = () => subHours(new Date(), 3).toISOString();

interface IcmpMetric { time: string; latency_ms: number; packet_loss: number; status: string; }
interface IcmpTarget { id: number; device_id: number; label: string; ip_address: string; }
interface DeviceIcmp { device_id: number; avg_latency_ms: number|null; avg_packet_loss: number|null; }

export default function DashboardPage() {
  const { data: summary } = useSWR<Summary>('summary', api.getSummary, { refreshInterval: 30000 });
  const { data: alerts }  = useSWR<Alert[]>('alerts-d', () => api.getAlerts(false), { refreshInterval: 20000 });
  const { data: targets } = useSWR<IcmpTarget[]>('icmp-targets', () => fetch(`${API}/api/sites`).then(r=>r.json()).catch(()=>[]), { refreshInterval: 60000 });
  const { data: devicesIcmp } = useSWR<DeviceIcmp[]>('devices-icmp-dash', () => fetch(`${API}/api/metrics/devices-icmp`).then(r=>r.json()), { refreshInterval: 30000 });

  // Fetch ICMP trend for all targets combined
  const { data: icmpTrend } = useSWR<IcmpMetric[]>('icmp-trend', () =>
    fetch(`${API}/api/metrics/icmp?target_id=8&from=${h3()}&to=${now()}`).then(r=>r.json()).catch(()=>[]),
    { refreshInterval: 30000 }
  );

  const trendData = (icmpTrend||[]).map(d => ({
    time: format(new Date(d.time), 'HH:mm'),
    latency: d.latency_ms != null ? +Number(d.latency_ms).toFixed(1) : null,
    loss: +Number(d.packet_loss).toFixed(1),
  })).filter(d => d.latency != null);

  const up    = summary?.devices.up    ?? '—';
  const down  = summary?.devices.down  ?? 0;
  const tot   = summary?.devices.total ?? '—';
  const crit  = summary?.alerts.critical ?? 0;
  const warn  = summary?.alerts.warning  ?? 0;
  const lat   = summary?.icmp.avg_latency;
  const loss  = summary?.icmp.avg_loss ?? 0;

  // Get online devices with their ICMP stats
  const onlineDevices = (devicesIcmp||[]).filter(d => d.avg_latency_ms != null);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <PageHeader
        title="Dashboard"
        sub="WAN visibility overview"
        right={
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:C.muted }}>
            <span style={{ width:8, height:8, background:C.up, display:'inline-block', borderRadius:'50%' }}/>
            Live · refreshes every 30s
          </div>
        }
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2 }}>
        <KpiTile label="Devices Up"      value={up}                        sub={`of ${tot} total`}    color={C.up}   bg={C.upBg}/>
        <KpiTile label="Devices Down"    value={down}                      sub="unreachable"           color={Number(down)>0?C.crit:C.muted} bg={Number(down)>0?C.critBg:C.surface}/>
        <KpiTile label="Critical Alerts" value={crit}                      sub={`${warn} warnings`}   color={crit>0?C.crit:C.muted} bg={crit>0?C.critBg:C.surface}/>
        <KpiTile label="Avg Latency"     value={lat?`${lat} ms`:'—'}      sub={`Packet loss: ${loss}%`} color={Number(loss)>5?C.crit:C.info}/>
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:2 }}>

        {/* ICMP Latency trend */}
        <Card>
          <CardTitle>ICMP Latency — Last 3 Hours</CardTitle>
          {trendData.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:13 }}>
              No ICMP data yet — add devices to start monitoring
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData} margin={{ top:4, right:4, bottom:0, left:-10 }}>
                <defs>
                  <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.info} stopOpacity={0.15}/>
                    <stop offset="95%" stopColor={C.info} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false}/>
                <XAxis dataKey="time" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false} unit=" ms"/>
                <Tooltip content={<ChartTip unit=" ms"/>}/>
                <Area type="monotone" dataKey="latency" name="Latency" stroke={C.info} fill="url(#latGrad)" strokeWidth={2} dot={false} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Active Alerts */}
        <Card>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <CardTitle>Active Alerts</CardTitle>
            {!!alerts?.length && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:C.critBg, color:C.crit, fontWeight:600 }}>{alerts.length}</span>}
          </div>
          {!alerts?.length ? (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
              <div style={{ fontSize:13, color:C.muted, fontWeight:500 }}>All clear</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', maxHeight:220, overflowY:'auto' }}>
              {alerts.slice(0,8).map((a,i) => (
                <div key={a.id} style={{ display:'flex', gap:10, padding:'10px 0', borderTop: i>0?`1px solid ${C.border}`:'none' }}>
                  <div style={{ width:3, flexShrink:0, background: a.severity==='critical'?C.crit:C.warn }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{a.hostname||'Unknown'}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.message}</div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, flexShrink:0 }}>{formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Device ICMP status row */}
      <Card>
        <CardTitle>Device ICMP Status — Last 15 Minutes</CardTitle>
        {!devicesIcmp?.length ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:13 }}>No devices monitored yet</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:2 }}>
            {devicesIcmp.map(d => {
              const lat  = d.avg_latency_ms != null ? Number(d.avg_latency_ms) : null;
              const loss = Number(d.avg_packet_loss ?? 0);
              const color = lat == null ? C.muted : loss >= 100 ? C.crit : loss > 5 ? C.warn : C.up;
              const device = (devices||[]).find((dev:any) => dev.id === d.device_id);
              return (
                <div key={d.device_id} style={{ padding:'16px 20px', background: lat==null?'#fafbfc':loss>=100?C.critBg:C.upBg, borderLeft:`3px solid ${color}` }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:6 }}>{device?.hostname || `Device ${d.device_id}`}</div>
                  <div style={{ fontSize:22, fontWeight:700, color, letterSpacing:'-0.5px' }}>
                    {lat != null ? `${lat.toFixed(1)} ms` : 'Unreachable'}
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{loss.toFixed(0)}% packet loss</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent alerts table */}
      {!!alerts?.length && (
        <Card style={{ padding:0 }}>
          <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}` }}>
            <CardTitle>Recent Alert History</CardTitle>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {['Severity','Device','Message','Time'].map(h=>(
                  <th key={h} style={{ padding:'10px 20px', textAlign:'left', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'1px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0,10).map((a,i)=>(
                <tr key={a.id} style={{ background:i%2===0?'#fff':'#fafbfc', borderTop:`1px solid ${C.border}` }}>
                  <td style={{ padding:'11px 20px' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:0, background:a.severity==='critical'?C.critBg:C.warnBg, color:a.severity==='critical'?C.crit:C.warn, textTransform:'uppercase' }}>{a.severity}</span>
                  </td>
                  <td style={{ padding:'11px 20px', fontSize:13, fontWeight:600, color:C.text }}>{a.hostname||'Unknown'}</td>
                  <td style={{ padding:'11px 20px', fontSize:13, color:C.sub }}>{a.message}</td>
                  <td style={{ padding:'11px 20px', fontSize:12, color:C.muted }}>{formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
