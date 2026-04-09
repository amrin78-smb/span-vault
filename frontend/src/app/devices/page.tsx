'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api, Device, Site } from '@/lib/api';
import { format } from 'date-fns';
import { C, KpiTile, Card, PageHeader, StatusBadge, Btn, Modal, Field, Input, Select } from '@/components/shared/ui';

const TYPES=['router','switch','firewall','server','ap','cloud'];
const PRIS=['critical','high','normal','low'];

interface F { hostname:string;ip_address:string;site_id:string;vendor:string;model:string;device_type:string;priority:string;community:string; }
const BLANK:F={hostname:'',ip_address:'',site_id:'',vendor:'',model:'',device_type:'router',priority:'normal',community:'public'};

interface DeviceIcmp { device_id:number; avg_latency_ms:number|null; avg_packet_loss:number|null; last_status:string|null; }

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';


interface NVDevice {
  ip_address: string; hostname: string; model: string; vendor: string;
  device_type: string; site_id: number; site_name: string; site_code: string;
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [devices, setDevices] = useState<NVDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/api/devices/netvault-import`)
      .then(r => r.json())
      .then(data => { setDevices(data); setLoading(false); })
      .catch(() => { setErr('Failed to load NetVault devices'); setLoading(false); });
  }, []);

  function toggle(ip: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(ip) ? next.delete(ip) : next.add(ip);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev => {
      const allSelected = prev.size === devices.length;
      return allSelected ? new Set() : new Set(devices.map(d => d.ip_address));
    });
  }

  async function importSelected() {
    if (!selected.size) return;
    setImporting(true);
    let count = 0;
    for (const ip of Array.from(selected)) {
      const d = devices.find(x => x.ip_address === ip);
      if (!d) continue;
      try {
        await fetch(`${API}/api/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostname: d.hostname, ip_address: d.ip_address,
            vendor: d.vendor, model: d.model,
            device_type: (d.device_type||'router').toLowerCase(),
            site_id: d.site_id, priority: 'normal', community: 'public',
          }),
        });
        count++;
      } catch {}
    }
    setDone(count);
    setImporting(false);
    onSaved();
    onClose();
  }

  const filtered = search
    ? devices.filter(d => {
        const q = search.toLowerCase();
        return (d.hostname||'').toLowerCase().includes(q) ||
               (d.ip_address||'').includes(q) ||
               (d.site_name||'').toLowerCase().includes(q) ||
               (d.vendor||'').toLowerCase().includes(q);
      })
    : devices;

  const bysite = filtered.reduce((acc, d) => {
    const k = d.site_name || 'No Site';
    if (!acc[k]) acc[k] = [];
    acc[k].push(d);
    return acc;
  }, {} as Record<string, NVDevice[]>);

  return (
    <Modal title="Import from NetVault" onClose={onClose} width={720}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>Loading NetVault devices…</div>
      ) : err ? (
        <div style={{ color: C.crit, padding: 16 }}>{err}</div>
      ) : devices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
          All NetVault devices are already in SpanVault.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search hostname, IP, site, vendor…"
              style={{ width: '100%', padding: '9px 14px', border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: C.muted }}>
              {filtered.length} of {devices.length} devices · {selected.size} selected
            </span>
            <Btn onClick={toggleAll}>{selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}</Btn>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', border: `1px solid ${C.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 1 }}>
                <tr>
                  <th style={{ width: 40, padding: '8px 12px', borderBottom: `2px solid ${C.border}` }}/>
                  {['Hostname', 'IP Address', 'Vendor / Model', 'Site'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: `2px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(bysite).map(([site, devs]) => (
                  <>
                    <tr key={`site-${site}`}>
                      <td colSpan={5} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: C.info, background: '#f0f4ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{site}</td>
                    </tr>
                    {devs.map((d, i) => (
                      <tr key={d.ip_address}
                        onClick={() => toggle(d.ip_address)}
                        style={{ cursor: 'pointer', background: selected.has(d.ip_address) ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafbfc' }}
                      >
                        <td style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
                          <input type="checkbox" checked={selected.has(d.ip_address)} onChange={() => toggle(d.ip_address)} onClick={e => e.stopPropagation()}/>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: C.text, borderTop: `1px solid ${C.border}` }}>{d.hostname || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: C.mono, color: C.sub, borderTop: `1px solid ${C.border}` }}>{d.ip_address}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.sub, borderTop: `1px solid ${C.border}` }}>{[d.vendor, d.model].filter(Boolean).join(' ') || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, borderTop: `1px solid ${C.border}` }}>{d.site_name || '—'}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {err && <p style={{ marginTop: 12, color: C.crit, fontSize: 13 }}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={importSelected} disabled={!selected.size || importing}>
              {importing ? `Importing…` : `Import ${selected.size} Device${selected.size !== 1 ? 's' : ''}`}
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function DevModal({device,sites,onClose,onSaved}:{device:Device|null;sites:Site[];onClose:()=>void;onSaved:()=>void}) {
  const [f,setF]=useState<F>(device?{hostname:device.hostname,ip_address:device.ip_address,site_id:String(device.site_id??''),vendor:device.vendor??'',model:device.model??'',device_type:device.device_type??'router',priority:device.priority??'normal',community:'public'}:{...BLANK});
  const [saving,setSaving]=useState(false);
  const [looking,setLooking]=useState(false);
  const [lookupMsg,setLookupMsg]=useState('');
  const [err,setErr]=useState('');
  const set=(k:keyof F)=>(v:string)=>setF(p=>({...p,[k]:v}));

  async function lookupIP(ip: string) {
    if (!ip || device) return; // only on add, not edit
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return;
    setLooking(true);
    setLookupMsg('');
    try {
      const res = await fetch(`${API}/api/devices/lookup/${ip}`);
      const data = await res.json();
      if (data.found) {
        setF(p => ({
          ...p,
          hostname:    data.hostname    || p.hostname,
          vendor:      data.vendor      || p.vendor,
          model:       data.model       || p.model,
          device_type: data.device_type?.toLowerCase() || p.device_type,
          site_id:     data.site_id     ? String(data.site_id) : p.site_id,
        }));
        setLookupMsg(`✓ Found in NetVault: ${data.hostname} (${data.site_name||'no site'})`);
      } else {
        setLookupMsg('Not found in NetVault — fill in details manually');
      }
    } catch { setLookupMsg('NetVault lookup unavailable'); }
    finally { setLooking(false); }
  }
  async function submit(){
    if(!f.hostname||!f.ip_address){setErr('Hostname and IP required');return;}
    setSaving(true);
    try{const p={...f,site_id:f.site_id?Number(f.site_id):undefined};device?await api.updateDevice(device.id,p):await api.createDevice(p);onSaved();onClose();}
    catch(e:any){setErr(e.message||'Failed');}finally{setSaving(false);}
  }
  return (
    <Modal title={device?`Edit — ${device.hostname}`:'Add Device'} onClose={onClose}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{gridColumn:'span 2'}}><Field label="Hostname"><Input value={f.hostname} onChange={set('hostname')} placeholder="hq-fw-01"/></Field></div>
        <Field label="IP Address"><Input value={f.ip_address} onChange={set('ip_address')} onBlur={(v:string)=>lookupIP(v)} placeholder="10.1.1.1"/></Field>
        {!device && lookupMsg && (
          <div style={{gridColumn:'span 2',fontSize:12,padding:'6px 10px',background:lookupMsg.startsWith('✓')?'#f0fdf4':'#fafafa',borderLeft:`3px solid ${lookupMsg.startsWith('✓')?'#16a34a':'#94a3b8'}`}}>
            {looking ? '🔍 Looking up in NetVault…' : lookupMsg}
          </div>
        )}
        <Field label="Site"><Select value={f.site_id} onChange={set('site_id')} options={sites.map(s=>({value:s.id,label:s.name}))}/></Field>
        <Field label="Vendor"><Input value={f.vendor} onChange={set('vendor')} placeholder="Cisco"/></Field>
        <Field label="Model"><Input value={f.model} onChange={set('model')} placeholder="ASR 1001-X"/></Field>
        <Field label="Device Type"><Select value={f.device_type} onChange={set('device_type')} options={TYPES.map(t=>({value:t,label:t}))}/></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set('priority')} options={PRIS.map(p=>({value:p,label:p}))}/></Field>
        <div style={{gridColumn:'span 2'}}><Field label="SNMP Community"><Input value={f.community} onChange={set('community')} placeholder="public"/></Field></div>
      </div>
      {err&&<p style={{marginTop:12,fontSize:13,color:C.crit,fontWeight:600}}>{err}</p>}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:24}}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} disabled={saving}>{saving?'Saving…':device?'Save Changes':'Add Device'}</Btn>
      </div>
    </Modal>
  );
}

function ConfDel({hostname,onConfirm,onCancel}:{hostname:string;onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <Modal title="Delete Device" onClose={onCancel} width={380}>
      <p style={{fontSize:15,color:C.sub,marginBottom:8}}>Remove <strong style={{color:C.text,fontFamily:C.mono}}>{hostname}</strong>?</p>
      <p style={{fontSize:13,color:C.crit,fontWeight:600,marginBottom:24}}>This cannot be undone.</p>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}><Btn onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={()=>onConfirm()}>Delete Device</Btn></div>
    </Modal>
  );
}

function IcmpCell({icmp}:{icmp:DeviceIcmp|undefined}) {
  if (!icmp) return <span style={{fontSize:12,color:C.muted}}>—</span>;
  const loss = Number(icmp.avg_packet_loss ?? 0);
  const lat  = icmp.avg_latency_ms != null ? Number(icmp.avg_latency_ms) : null;
  const color = loss >= 100 ? C.crit : loss > 10 ? C.warn : loss > 0 ? C.warn : C.up;
  if (lat == null && loss === 0) return <span style={{fontSize:12,color:C.muted}}>No data</span>;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      <div style={{fontSize:12,fontWeight:600,color}}>
        {lat != null ? `${lat.toFixed(1)} ms` : '—'}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <div style={{width:70,height:3,background:C.border,overflow:'hidden'}}>
          <div style={{width:`${Math.min(loss,100)}%`,height:'100%',background:color}}/>
        </div>
        <span style={{fontSize:10,color:C.muted}}>{loss.toFixed(0)}% loss</span>
      </div>
    </div>
  );
}

const TH=({c,right}:{c:string;right?:boolean})=>(
  <th style={{padding:'10px 16px',textAlign:right?'right':'left',fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'1px',borderBottom:`2px solid ${C.border}`}}>{c}</th>
);

export default function DevicesPage() {
  const {data:devices,isLoading,mutate}=useSWR<Device[]>('devices',api.getDevices,{refreshInterval:30000});
  const {data:sites}=useSWR<Site[]>('sites',api.getSites);
  const {data:icmpData}=useSWR<DeviceIcmp[]>('devices-icmp',()=>fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:3001'}/api/metrics/devices-icmp`).then(r=>r.json()),{refreshInterval:30000});

  const [modal,setModal]=useState<'add'|Device|null>(null);
  const [showImport,setShowImport]=useState(false);
  const [confirm,setConfirm]=useState<Device|null>(null);
  const [search,setSearch]=useState('');
  const [typeF,setTypeF]=useState('all');

  const icmpMap = new Map<number,DeviceIcmp>((icmpData||[]).map(i=>[i.device_id,i]));

  const filtered=(devices||[]).filter(d=>{
    const q=search.toLowerCase();
    return(!q||d.hostname.toLowerCase().includes(q)||d.ip_address.includes(q)||(d.vendor??'').toLowerCase().includes(q))&&(typeF==='all'||d.device_type===typeF);
  });
  const types=Array.from(new Set((devices||[]).map(d=>d.device_type).filter(Boolean)));
  const up=(devices||[]).filter(d=>d.status==='up').length;
  const down=(devices||[]).filter(d=>d.status==='down').length;
  async function del(d:Device){await api.deleteDevice(d.id);mutate();setConfirm(null);}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <PageHeader title="Devices" sub={`${devices?.length??0} monitored · ${up} up · ${down} down`}
        right={<div style={{display:'flex',gap:8}}><Btn onClick={()=>setShowImport(true)}>⬇ Import from NetVault</Btn><Btn variant="primary" onClick={()=>setModal('add')}>+ Add Device</Btn></div>} />

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:2}}>
        <KpiTile label="Total"   value={devices?.length??'—'} color={C.info}/>
        <KpiTile label="Online"  value={up}   color={C.up}   bg={C.upBg}/>
        <KpiTile label="Down"    value={down} color={down>0?C.crit:C.muted} bg={down>0?C.critBg:C.surface}/>
        <KpiTile label="Warning" value={(devices||[]).filter(d=>d.status==='warning').length} color={C.warn} bg={C.warnBg}/>
      </div>

      <div style={{display:'flex',gap:10}}>
        <div style={{maxWidth:320,flex:1}}><Input value={search} onChange={setSearch} placeholder="Search hostname, IP, vendor…"/></div>
        <Select value={typeF} onChange={setTypeF} options={[{value:'all',label:'All types'},...types.map(t=>({value:t,label:t}))]} style={{width:'auto'}}/>
      </div>

      <Card style={{padding:0}}>
        {isLoading?(
          <div style={{padding:60,textAlign:'center',color:C.muted,fontSize:15}}>Loading devices…</div>
        ):(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <TH c="Hostname"/><TH c="IP Address"/><TH c="Site"/>
                <TH c="Vendor / Model"/><TH c="Type"/><TH c="Status"/>
                <TH c="ICMP (5 min avg)"/><TH c="Last Seen"/><TH c=""/>
              </tr></thead>
              <tbody>
                {filtered.map((d,i)=>(
                  <tr key={d.id} style={{background:i%2===0?'#fff':'#fafbfc'}}>
                    <td style={{padding:'12px 16px',fontSize:14,fontWeight:700,color:C.text,borderTop:`1px solid ${C.border}`}}>{d.hostname}</td>
                    <td style={{padding:'12px 16px',fontFamily:C.mono,fontSize:13,color:C.sub,borderTop:`1px solid ${C.border}`}}>{d.ip_address}</td>
                    <td style={{padding:'12px 16px',fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`}}>{d.site_name||'—'}</td>
                    <td style={{padding:'12px 16px',fontSize:13,color:C.sub,borderTop:`1px solid ${C.border}`}}>{[d.vendor,d.model].filter(Boolean).join(' ')||'—'}</td>
                    <td style={{padding:'12px 16px',fontSize:13,color:C.sub,textTransform:'capitalize',borderTop:`1px solid ${C.border}`}}>{d.device_type||'—'}</td>
                    <td style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}><StatusBadge status={d.status||'unknown'}/></td>
                    <td style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}><IcmpCell icmp={icmpMap.get(d.id)}/></td>
                    <td style={{padding:'12px 16px',fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`}}>{d.last_seen?format(new Date(d.last_seen),'dd MMM HH:mm'):'Never'}</td>
                    <td style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',gap:8}}>
                        <Btn onClick={()=>setModal(d)}>Edit</Btn>
                        <Btn variant="danger" onClick={()=>setConfirm(d)}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length&&<tr><td colSpan={9} style={{padding:'60px',textAlign:'center',color:C.muted,fontSize:14}}>{search||typeF!=='all'?'No devices match your filter.':'No devices found.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showImport&&<ImportModal onClose={()=>setShowImport(false)} onSaved={()=>mutate()}/> }
      {modal&&<DevModal device={modal==='add'?null:modal} sites={sites||[]} onClose={()=>setModal(null)} onSaved={()=>mutate()}/>}
      {confirm&&<ConfDel hostname={confirm.hostname} onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
