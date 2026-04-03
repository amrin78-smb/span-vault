'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, Device, Site } from '@/lib/api';
import { format } from 'date-fns';
import { C, KpiTile, Card, PageHeader, StatusBadge, UtilBar, Input, Select, Field, Btn, Modal } from '@/components/shared/ui';

const TYPES=['router','switch','firewall','server','ap','cloud'];
const PRIS=['critical','high','normal','low'];
interface F { hostname:string;ip_address:string;site_id:string;vendor:string;model:string;device_type:string;priority:string;community:string; }
const BLANK:F={hostname:'',ip_address:'',site_id:'',vendor:'',model:'',device_type:'router',priority:'normal',community:'public'};

function DevModal({device,sites,onClose,onSaved}:{device:Device|null;sites:Site[];onClose:()=>void;onSaved:()=>void}) {
  const [f,setF]=useState<F>(device?{hostname:device.hostname,ip_address:device.ip_address,site_id:String(device.site_id??''),vendor:device.vendor??'',model:device.model??'',device_type:device.device_type??'router',priority:device.priority??'normal',community:'public'}:{...BLANK});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const set=(k:keyof F)=>(v:string)=>setF(p=>({...p,[k]:v}));
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
        <Field label="IP Address"><Input value={f.ip_address} onChange={set('ip_address')} placeholder="10.1.1.1"/></Field>
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
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}><Btn onClick={onCancel}>Cancel</Btn><Btn variant="danger" onClick={onConfirm}>Delete Device</Btn></div>
    </Modal>
  );
}

const TH=({c,right}:{c:string;right?:boolean})=>(
  <th style={{padding:'12px 20px',textAlign:right?'right':'left',fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'1px',borderBottom:`2px solid ${C.border}`}}>{c}</th>
);

export default function DevicesPage() {
  const {data:devices,isLoading,mutate}=useSWR<Device[]>('devices',api.getDevices,{refreshInterval:30000});
  const {data:sites}=useSWR<Site[]>('sites',api.getSites);
  const [modal,setModal]=useState<'add'|Device|null>(null);
  const [confirm,setConfirm]=useState<Device|null>(null);
  const [search,setSearch]=useState('');
  const [typeF,setTypeF]=useState('all');

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
        right={<Btn variant="primary" onClick={()=>setModal('add')}>+ Add Device</Btn>} />

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:2}}>
        <KpiTile label="Total"   value={devices?.length??'—'} color={C.info} />
        <KpiTile label="Online"  value={up}   color={C.up}   bg={C.upBg} />
        <KpiTile label="Down"    value={down} color={down>0?C.crit:C.muted} bg={down>0?C.critBg:C.surface} />
        <KpiTile label="Warning" value={(devices||[]).filter(d=>d.status==='warning').length} color={C.warn} bg={C.warnBg} />
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
              <thead><tr><TH c="Hostname"/><TH c="IP Address"/><TH c="Site"/><TH c="Vendor / Model"/><TH c="Type"/><TH c="Status"/><TH c="Utilization"/><TH c="Last Seen"/><TH c=""/></tr></thead>
              <tbody>
                {filtered.map((d,i)=>{
                  const util=d.status==='up'?Math.floor(Math.random()*60+20):0;
                  const rowBg=i%2===0?'#fff':'#fafbfc';
                  return (
                    <tr key={d.id} style={{background:rowBg}}>
                      <td style={{padding:'14px 20px',fontSize:14,fontWeight:700,color:C.text,borderTop:`1px solid ${C.border}`}}>{d.hostname}</td>
                      <td style={{padding:'14px 20px',fontFamily:C.mono,fontSize:13,color:C.sub,borderTop:`1px solid ${C.border}`}}>{d.ip_address}</td>
                      <td style={{padding:'14px 20px',fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`}}>{d.site_name||'—'}</td>
                      <td style={{padding:'14px 20px',fontSize:13,color:C.sub,borderTop:`1px solid ${C.border}`}}>{[d.vendor,d.model].filter(Boolean).join(' ')||'—'}</td>
                      <td style={{padding:'14px 20px',fontSize:13,color:C.sub,textTransform:'capitalize',borderTop:`1px solid ${C.border}`}}>{d.device_type||'—'}</td>
                      <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}><StatusBadge status={d.status||'unknown'}/></td>
                      <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}>{d.status==='up'?<UtilBar pct={util}/>:<span style={{color:C.muted}}>—</span>}</td>
                      <td style={{padding:'14px 20px',fontSize:13,color:C.muted,borderTop:`1px solid ${C.border}`}}>{d.last_seen?format(new Date(d.last_seen),'dd MMM HH:mm'):'Never'}</td>
                      <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}>
                        <div style={{display:'flex',gap:8}}>
                          <Btn onClick={()=>setModal(d)}>Edit</Btn>
                          <Btn variant="danger" onClick={()=>setConfirm(d)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length&&<tr><td colSpan={9} style={{padding:'60px',textAlign:'center',color:C.muted,fontSize:14}}>{search||typeF!=='all'?'No devices match your filter.':'No devices found.'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal&&<DevModal device={modal==='add'?null:modal} sites={sites||[]} onClose={()=>setModal(null)} onSaved={()=>mutate()}/>}
      {confirm&&<ConfDel hostname={confirm.hostname} onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
