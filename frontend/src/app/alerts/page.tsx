'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, Alert } from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { C, KpiTile, Card, PageHeader, SevPill, Btn } from '@/components/shared/ui';

const TYPE_LABELS:Record<string,string>={down:'Device Down',high_utilization:'High Utilization',high_latency:'High Latency',packet_loss:'Packet Loss',congestion:'Congestion'};

export default function AlertsPage() {
  const [showRes,setShowRes]=useState(false);
  const [sevF,setSevF]=useState('all');
  const [ackF,setAckF]=useState('all');
  const {data:alerts,isLoading,mutate}=useSWR<Alert[]>(['alerts',showRes],()=>api.getAlerts(showRes),{refreshInterval:15000});

  const ack=async(id:number)=>{await api.acknowledgeAlert(id);mutate();};
  const res=async(id:number)=>{await api.resolveAlert(id);mutate();};
  const all=alerts||[];
  const filtered=all.filter(a=>(sevF==='all'||a.severity===sevF)&&(ackF==='all'||(ackF==='unacked'&&!a.acknowledged)||(ackF==='acked'&&a.acknowledged)));
  const crit=all.filter(a=>a.severity==='critical').length;
  const warn=all.filter(a=>a.severity==='warning').length;
  const unacked=all.filter(a=>!a.acknowledged).length;

  const TabBtn=({v,cur,set,label}:{v:string;cur:string;set:(x:string)=>void;label:string})=>(
    <button onClick={()=>set(v)} style={{padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer',background:v===cur?C.info:'#fff',color:v===cur?'#fff':C.sub,border:`1px solid ${v===cur?C.info:C.border2}`}}>
      {label}
    </button>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <PageHeader title="Alerts" sub={showRes?'Resolved history':'Active unresolved alerts · refreshes every 15s'}
        right={
          <>
            {!showRes&&unacked>0&&<Btn onClick={()=>filtered.filter(a=>!a.acknowledged).forEach(a=>ack(a.id))}>Ack All Visible</Btn>}
            <Btn variant="primary" onClick={()=>setShowRes(v=>!v)}>{showRes?'← Active Alerts':'Resolved History →'}</Btn>
          </>
        }
      />

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:2}}>
        <KpiTile label="Critical"       value={crit}    color={crit>0?C.crit:C.muted}   bg={crit>0?C.critBg:C.surface}/>
        <KpiTile label="Warning"        value={warn}    color={warn>0?C.warn:C.muted}    bg={warn>0?C.warnBg:C.surface}/>
        <KpiTile label="Unacknowledged" value={unacked} color={unacked>0?C.warn:C.muted} bg={unacked>0?C.warnBg:C.surface}/>
      </div>

      <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>
        <TabBtn v="all"      cur={sevF} set={setSevF} label="All Severities"/>
        <TabBtn v="critical" cur={sevF} set={setSevF} label="Critical"/>
        <TabBtn v="warning"  cur={sevF} set={setSevF} label="Warning"/>
        <div style={{width:16}}/>
        {!showRes&&<>
          <TabBtn v="all"     cur={ackF} set={setAckF} label="All States"/>
          <TabBtn v="unacked" cur={ackF} set={setAckF} label="Unacknowledged"/>
          <TabBtn v="acked"   cur={ackF} set={setAckF} label="Acknowledged"/>
        </>}
        <div style={{marginLeft:'auto',fontSize:13,color:C.muted,alignSelf:'center',fontWeight:600}}>{filtered.length} alerts</div>
      </div>

      <Card style={{padding:0}}>
        {isLoading?(
          <div style={{padding:60,textAlign:'center',color:C.muted,fontSize:15}}>Loading…</div>
        ):filtered.length===0?(
          <div style={{padding:80,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:16}}>✓</div>
            <div style={{fontSize:16,fontWeight:600,color:C.sub}}>{showRes?'No resolved alerts':'No active alerts'}</div>
          </div>
        ):(
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${C.border}`}}>
                {['Severity','Device','Type','Message','Time','State',...(!showRes?['Actions']:[])].map(h=>(
                  <th key={h} style={{padding:'12px 20px',textAlign:'left',fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'1px'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a,i)=>(
                <tr key={a.id} style={{background:i%2===0?'#fff':'#fafbfc',opacity:a.acknowledged?0.6:1}}>
                  <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}><SevPill s={a.severity}/></td>
                  <td style={{padding:'14px 20px',fontSize:14,fontWeight:700,color:C.text,borderTop:`1px solid ${C.border}`}}>{a.hostname||'Unknown'}</td>
                  <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}>
                    <span style={{fontSize:12,fontWeight:600,padding:'3px 8px',background:C.border,color:C.sub}}>{TYPE_LABELS[a.alert_type]||a.alert_type}</span>
                  </td>
                  <td style={{padding:'14px 20px',fontSize:13,color:C.sub,maxWidth:280,borderTop:`1px solid ${C.border}`}}>{a.message}</td>
                  <td style={{padding:'14px 20px',fontSize:12,color:C.muted,whiteSpace:'nowrap',borderTop:`1px solid ${C.border}`}}>{formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}</td>
                  <td style={{padding:'14px 20px',fontSize:13,fontWeight:600,borderTop:`1px solid ${C.border}`}}>
                    {a.acknowledged?<span style={{color:C.up}}>✓ Acknowledged</span>:<span style={{color:C.warn}}>Pending</span>}
                  </td>
                  {!showRes&&(
                    <td style={{padding:'14px 20px',borderTop:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',gap:8}}>
                        {!a.acknowledged&&<Btn onClick={()=>ack(a.id)}>Acknowledge</Btn>}
                        <Btn variant="primary" onClick={()=>res(a.id)}>Resolve</Btn>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
