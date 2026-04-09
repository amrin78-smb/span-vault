'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { C, Card, PageHeader, KpiTile, StatusBadge } from '@/components/shared/ui';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Site {
  id: number; name: string; code: string; city: string; country: string;
  address: string; site_type: string; site_status: string; coordinates: string;
  contact_name: string; contact_email: string; phone: string;
  device_count: number; devices_up: number; devices_down: number;
}

interface Device {
  id: number; hostname: string; ip_address: string; vendor: string;
  model: string; device_type: string; status: string; last_seen: string;
}

function SiteDetail({ site, onClose }: { site: Site; onClose: () => void }) {
  const { data: allDevices } = useSWR<Device[]>(
    `site-devices-${site.id}`,
    () => fetch(`${API}/api/devices`).then(r => r.json()),
    { refreshInterval: 30000 }
  );

  const devices = (allDevices || []).filter(d => true); // will filter by site_id below
  const siteDevices = (allDevices || []).filter((d: any) => d.site_id === site.id);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#fff', width: 680, maxHeight: '80vh', display: 'flex',
        flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `2px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.info, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>{site.code}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.5px' }}>{site.name}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{[site.city, site.country].filter(Boolean).join(', ')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.muted, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Site info */}
          <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderBottom: `1px solid ${C.border}` }}>
            {site.address && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Address</div>
                <div style={{ fontSize: 13, color: C.sub }}>{site.address}</div>
              </div>
            )}
            {site.contact_name && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Contact</div>
                <div style={{ fontSize: 13, color: C.sub }}>{site.contact_name}</div>
                {site.contact_email && <div style={{ fontSize: 12, color: C.info }}>{site.contact_email}</div>}
                {site.phone && <div style={{ fontSize: 12, color: C.muted }}>{site.phone}</div>}
              </div>
            )}
            {site.coordinates && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Coordinates</div>
                <div style={{ fontSize: 13, color: C.sub, fontFamily: C.mono }}>{site.coordinates}</div>
              </div>
            )}
            {site.site_type && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Type</div>
                <div style={{ fontSize: 13, color: C.sub }}>{site.site_type}</div>
              </div>
            )}
          </div>

          {/* Devices at this site */}
          <div style={{ padding: '16px 24px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Monitored Devices ({siteDevices.length})
            </div>
            {siteDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>
                No SpanVault devices assigned to this site yet.
                <br/>
                <span style={{ fontSize: 12 }}>Add devices and set their site to <strong>{site.name}</strong></span>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    {['Hostname', 'IP Address', 'Type', 'Vendor / Model', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {siteDevices.map((d, i) => (
                    <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: C.text }}>{d.hostname}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: C.mono, color: C.sub }}>{d.ip_address}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{d.device_type}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: C.sub }}>{[d.vendor, d.model].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '10px 12px' }}><StatusBadge status={d.status || 'unknown'}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ up, down }: { up: number; down: number }) {
  const color = down > 0 ? C.crit : up > 0 ? C.up : C.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }}/>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>
        {down > 0 ? `${down} down` : up > 0 ? `${up} up` : 'No devices'}
      </span>
    </div>
  );
}

const TH = ({ c }: { c: string }) => (
  <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: `2px solid ${C.border}` }}>{c}</th>
);

export default function SitesPage() {
  const { data: sites, isLoading } = useSWR<Site[]>(
    'sites',
    () => fetch(`${API}/api/sites`).then(r => r.json()),
    { refreshInterval: 60000 }
  );
  const [selected, setSelected] = useState<Site | null>(null);

  const total     = sites?.length ?? 0;
  const withDev   = (sites || []).filter(s => s.device_count > 0).length;
  const hasIssues = (sites || []).filter(s => s.devices_down > 0).length;
  const totalDev  = (sites || []).reduce((a, s) => a + s.device_count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Sites"
        sub="Network sites from NetVault — click a row to view devices"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2 }}>
        <KpiTile label="Total Sites"       value={total}     color={C.info}/>
        <KpiTile label="With Devices"      value={withDev}   color={C.up}   bg={C.upBg}/>
        <KpiTile label="Sites with Issues" value={hasIssues} color={hasIssues > 0 ? C.crit : C.muted} bg={hasIssues > 0 ? C.critBg : C.surface}/>
        <KpiTile label="Total Devices"     value={totalDev}  color={C.info}/>
      </div>

      <Card style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: C.muted, fontSize: 15 }}>Loading sites…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH c="Site Name"/><TH c="Code"/><TH c="City"/><TH c="Country"/>
                  <TH c="Contact"/><TH c="Devices"/><TH c="Status"/>
                </tr>
              </thead>
              <tbody>
                {(sites || []).map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    style={{
                      background: i % 2 === 0 ? '#fff' : '#fafbfc',
                      cursor: 'pointer',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc')}
                  >
                    <td style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}` }}>{s.name}</td>
                    <td style={{ padding: '12px 20px', fontFamily: C.mono, fontSize: 12, color: C.info, fontWeight: 600, borderTop: `1px solid ${C.border}` }}>{s.code || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: C.sub, borderTop: `1px solid ${C.border}` }}>{s.city || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: C.sub, borderTop: `1px solid ${C.border}` }}>{s.country || '—'}</td>
                    <td style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}` }}>
                      {s.contact_name ? (
                        <div>
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{s.contact_name}</div>
                          {s.contact_email && <div style={{ fontSize: 11, color: C.muted }}>{s.contact_email}</div>}
                        </div>
                      ) : <span style={{ color: C.muted, fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, borderTop: `1px solid ${C.border}` }}>
                      {s.device_count > 0
                        ? <span style={{ fontWeight: 600, color: C.text }}>{s.device_count} device{s.device_count !== 1 ? 's' : ''}</span>
                        : <span style={{ color: C.muted }}>None</span>}
                    </td>
                    <td style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}` }}>
                      <StatusDot up={s.devices_up} down={s.devices_down}/>
                    </td>
                  </tr>
                ))}
                {!sites?.length && (
                  <tr><td colSpan={7} style={{ padding: 60, textAlign: 'center', color: C.muted, fontSize: 14 }}>No sites found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && <SiteDetail site={selected} onClose={() => setSelected(null)}/>}
    </div>
  );
}
