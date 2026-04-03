'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api, TopTalker, FlowBucket } from '@/lib/api';
import { subHours, subDays, format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { C, KpiTile, Card, CardTitle, PageHeader, ChartTip } from '@/components/shared/ui';

type Range='1h'|'6h'|'24h';
const getR=(r:Range)=>{const now=new Date();const from=r==='1h'?subHours(now,1):r==='6h'?subHours(now,6):subDays(now,1);return{from:from.toISOString(),to:now.toISOString()};};
const fmtB=(b:number)=>b>1e9?`${(b/1e9).toFixed(2)} GB`:b>1e6?`${(b/1e6).toFixed(2)} MB`:b>1e3?`${(b/1e3).toFixed(2)} KB`:`${b} B`;
const COLORS=[C.info,'#7c3aed','#00b37e','#f59e0b','#e63946','#0891b2','#db2777','#059669'];

export default function FlowsPage() {
  const [range,setRange]=useState<Range>('1h');
  const {from,to}=getR(range);
  const {data:talkers}=useSWR<TopTalker[]>(['tk',range],()=>api.getTopTalkers(from,to,15),{refreshInterval:60000});
  const {data:timeline}=useSWR<FlowBucket[]>(['tl',range],()=>api.getFlowTimeline(from,to),{refreshInterval:60000});

  const flowData=(timeline||[]).map(f=>({time:format(new Date(f.bucket),'HH:mm'),MB:+(f.total_bytes/1024/1024).toFixed(2)}));
  const barData=(talkers||[]).slice(0,8).map(t=>({name:t.src_ip.split('.').slice(-2).join('.'),MB:+(t.total_bytes/1024/1024).toFixed(1)}));
  const totalB=(talkers||[]).reduce((s,t)=>s+t.total_bytes,0);
  const totalP=(talkers||[]).reduce((s,t)=>s+t.total_packets,0);
  const top=(talkers||[])[0];

  const RBtn=({r}:{r:Range})=>(
    <button onClick={()=>setRange(r)} style={{padding:'9px 20px',fontSize:13,fontWeight:700,cursor:'pointer',background:r===range?C.info:'#fff',color:r===range?'#fff':C.sub,border:`1px solid ${r===range?C.info:C.border2}`}}>{r}</button>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <PageHeader title="Flow Analysis" sub="NetFlow traffic breakdown" right={<><RBtn r="1h"/><RBtn r="6h"/><RBtn r="24h"/></>}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:2}}>
        <KpiTile label="Total Volume"  value={fmtB(totalB)}               sub={`Last ${range}`} color={C.info} bg={C.infoBg}/>
        <KpiTile label="Total Packets" value={totalP.toLocaleString()}     sub={`${talkers?.length??0} flows`} color={C.purple}/>
        <KpiTile label="Top Talker"    value={top?.src_ip??'—'}            sub={top?fmtB(top.total_bytes):'—'} color={C.up} bg={C.upBg}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:2}}>
        <Card>
          <CardTitle>Flow Volume — {range}</CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={flowData} margin={{top:4,right:4,bottom:0,left:-10}}>
              <defs>
                <linearGradient id="fg3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.info} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={C.info} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false}/>
              <XAxis dataKey="time" tick={{fill:C.muted,fontSize:12}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis tick={{fill:C.muted,fontSize:12}} axisLine={false} tickLine={false} unit=" MB"/>
              <Tooltip content={<ChartTip unit=" MB"/>}/>
              <Area type="monotone" dataKey="MB" name="Volume" stroke={C.info} fill="url(#fg3)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardTitle>Top 8 Talkers</CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false}/>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:12}} axisLine={false} tickLine={false} unit=" MB"/>
              <Tooltip content={<ChartTip unit=" MB"/>}/>
              <Bar dataKey="MB" name="Traffic" radius={[0,0,0,0]}>
                {barData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card style={{padding:0}}>
        <div style={{padding:'20px 24px',borderBottom:`2px solid ${C.border}`}}><CardTitle>Top Talkers — {range}</CardTitle></div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${C.border}`}}>
              {['#','Source IP','Destination IP','Bytes','Packets','Share'].map((h,i)=>(
                <th key={h} style={{padding:'12px 20px',textAlign:i>=3?'right':'left',fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'1px'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(talkers||[]).map((t,i)=>{
              const share=totalB?(t.total_bytes/totalB)*100:0;
              return (
                <tr key={i} style={{background:i%2===0?'#fff':'#fafbfc',borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:'12px 20px',fontSize:13,fontWeight:700,color:C.muted}}>{i+1}</td>
                  <td style={{padding:'12px 20px',fontFamily:C.mono,fontSize:13,fontWeight:600,color:C.text}}>{t.src_ip}</td>
                  <td style={{padding:'12px 20px',fontFamily:C.mono,fontSize:13,color:C.sub}}>{t.dst_ip}</td>
                  <td style={{padding:'12px 20px',fontSize:13,fontWeight:700,color:C.info,textAlign:'right'}}>{fmtB(t.total_bytes)}</td>
                  <td style={{padding:'12px 20px',fontSize:13,color:C.sub,textAlign:'right'}}>{Number(t.total_packets).toLocaleString()}</td>
                  <td style={{padding:'12px 20px',textAlign:'right'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10}}>
                      <div style={{width:80,height:5,background:C.border,overflow:'hidden'}}>
                        <div style={{width:`${share}%`,height:'100%',background:C.info}}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:600,color:C.sub,width:40}}>{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!talkers&&<tr><td colSpan={6} style={{padding:'60px',textAlign:'center',color:C.muted,fontSize:14}}>Loading…</td></tr>}
            {talkers?.length===0&&<tr><td colSpan={6} style={{padding:'60px',textAlign:'center',color:C.muted,fontSize:14}}>No flow data for this period.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
