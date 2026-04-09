'use client';
import useSWR from 'swr';
import { C, Card, PageHeader, KpiTile } from '@/components/shared/ui';

interface Site {
  id: number; name: string; code: string; city: string; country: string;
  address: string; site_type: string; site_status: string; coordinates: string;
  contact_name: string; contact_email: string; phone: string;
  device_count: number; devices_up: number; devices_down: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function StatusDot({ up, down }: { up: number; down: number }) {
  const color = down > 0 ? C.crit : up > 0 ? C.up : C.muted;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block' }}/>
      <span style={{ fontSize:12, color, fontWeight:600 }}>
        {down > 0 ? `${down} down` : up > 0 ? `${up} up` : 'No devices'}
      </span>
    </div>
  );
}

export default function SitesPage() {
  const { data: sites, isLoading } = useSWR<Site[]>(
    'sites',
    () => fetch(`${API}/api/sites`).then(r => r.json()),
    { refreshInterval: 60000 }
  );

  const total     = sites?.length ?? 0;
  const withDev   = (sites||[]).filter(s => s.device_count > 0).length;
  const hasIssues = (sites||[]).filter(s => s.devices_down > 0).length;
  const totalDev  = (sites||[]).reduce((a, s) => a + s.device_count, 0);

  const TH = ({ c }: { c: string }) => (
    <th style={{ padding:'10px 20px', textAlign:'left', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'1px', borderBottom:`2px solid ${C.border}` }}>{c}</th>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <PageHeader
        title="Sites"
        sub="Network sites from NetVault — shared source of truth"
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2 }}>
        <KpiTile label="Total Sites"      value={total}    color={C.info}/>
        <KpiTile label="With Devices"     value={withDev}  color={C.up} bg={C.upBg}/>
        <KpiTile label="Sites with Issues"value={hasIssues}color={hasIssues>0?C.crit:C.muted} bg={hasIssues>0?C.critBg:C.surface}/>
        <KpiTile label="Total Devices"    value={totalDev} color={C.info}/>
      </div>

      <Card style={{ padding:0 }}>
        {isLoading ? (
          <div style={{ padding:60, textAlign:'center', color:C.muted, fontSize:15 }}>Loading sites…</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <TH c="Site Name"/><TH c="Code"/><TH c="City"/><TH c="Country"/>
                  <TH c="Type"/><TH c="Contact"/><TH c="SpanVault Devices"/><TH c="Status"/>
                </tr>
              </thead>
              <tbody>
                {(sites||[]).map((s, i) => (
                  <tr key={s.id} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                    <td style={{ padding:'12px 20px', fontSize:14, fontWeight:700, color:C.text, borderTop:`1px solid ${C.border}` }}>{s.name}</td>
                    <td style={{ padding:'12px 20px', fontFamily:C.mono, fontSize:12, color:C.info, fontWeight:600, borderTop:`1px solid ${C.border}` }}>{s.code||'—'}</td>
                    <td style={{ padding:'12px 20px', fontSize:13, color:C.sub, borderTop:`1px solid ${C.border}` }}>{s.city||'—'}</td>
                    <td style={{ padding:'12px 20px', fontSize:13, color:C.sub, borderTop:`1px solid ${C.border}` }}>{s.country||'—'}</td>
                    <td style={{ padding:'12px 20px', fontSize:13, color:C.muted, borderTop:`1px solid ${C.border}` }}>{s.site_type||'—'}</td>
                    <td style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}` }}>
                      {s.contact_name ? (
                        <div>
                          <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{s.contact_name}</div>
                          {s.contact_email && <div style={{ fontSize:11, color:C.muted }}>{s.contact_email}</div>}
                        </div>
                      ) : <span style={{ color:C.muted, fontSize:13 }}>—</span>}
                    </td>
                    <td style={{ padding:'12px 20px', fontSize:13, borderTop:`1px solid ${C.border}` }}>
                      {s.device_count > 0 ? (
                        <span style={{ fontWeight:600, color:C.text }}>{s.device_count} device{s.device_count!==1?'s':''}</span>
                      ) : <span style={{ color:C.muted }}>None</span>}
                    </td>
                    <td style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}` }}>
                      <StatusDot up={s.devices_up} down={s.devices_down}/>
                    </td>
                  </tr>
                ))}
                {!sites?.length && (
                  <tr><td colSpan={8} style={{ padding:60, textAlign:'center', color:C.muted, fontSize:14 }}>No sites found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
