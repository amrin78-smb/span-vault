'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { api, Topology, TopologyNode, TopologyLink } from '@/lib/api';
import { C, PageHeader } from '@/components/shared/ui';

const statusColor = (s: string) => s==='up'?'#00b37e':s==='down'?'#e63946':'#8492a6';
const utilColor   = (u: number) => u>=80?'#e63946':u>=60?'#f59e0b':u>0?'#00b37e':'#cdd2db';
const fmtBps      = (b: number) => !b?'—':b>=1e9?`${(b/1e9).toFixed(0)}G`:b>=1e6?`${(b/1e6).toFixed(0)}M`:`${(b/1e3).toFixed(0)}K`;

interface Pos { x: number; y: number; }

function SvgTopology({ topo, onSelectNode, onSelectLink }: {
  topo: Topology;
  onSelectNode: (n: TopologyNode|null) => void;
  onSelectLink: (l: TopologyLink|null) => void;
}) {
  const [positions, setPositions] = useState<Record<number, Pos>>(() => {
    const p: Record<number, Pos> = {};
    topo.nodes.forEach((n, i) => {
      p[n.id] = { x: n.x && n.x !== 0 ? n.x : 150 + (i % 4) * 200, y: n.y && n.y !== 0 ? n.y : 100 + Math.floor(i / 4) * 160 };
    });
    return p;
  });

  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selId, setSelId] = useState<string|null>(null);
  const dragging = useRef<{ nodeId: number; ox: number; oy: number; mx: number; my: number }|null>(null);
  const panning  = useRef<{ ox: number; oy: number; mx: number; my: number }|null>(null);
  const svgRef   = useRef<SVGSVGElement>(null);

  const startNodeDrag = useCallback((e: React.MouseEvent, nodeId: number) => {
    e.stopPropagation();
    const pos = positions[nodeId];
    dragging.current = { nodeId, ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY };
  }, [positions]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging.current) {
      const { nodeId, ox, oy, mx, my } = dragging.current;
      const dx = (e.clientX - mx) / zoom;
      const dy = (e.clientY - my) / zoom;
      setPositions(p => ({ ...p, [nodeId]: { x: ox + dx, y: oy + dy } }));
    } else if (panning.current) {
      const { ox, oy, mx, my } = panning.current;
      setPan({ x: ox + e.clientX - mx, y: oy + e.clientY - my });
    }
  }, [zoom]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragging.current) {
      const { nodeId } = dragging.current;
      const pos = positions[nodeId];
      api.saveNodePos(nodeId, Math.round(pos.x), Math.round(pos.y)).catch(() => {});
      dragging.current = null;
    }
    panning.current = null;
  }, [positions]);

  const onSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      panning.current = { ox: pan.x, oy: pan.y, mx: e.clientX, my: e.clientY };
      setSelId(null); onSelectNode(null); onSelectLink(null);
    }
  }, [pan, onSelectNode, onSelectLink]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const nodeW = 80, nodeH = 36;

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', cursor: 'grab', background: '#fff' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseDown={onSvgMouseDown}
      onWheel={onWheel}
    >
      {/* Grid */}
      <defs>
        <pattern id="grid" width={40*zoom} height={40*zoom} patternUnits="userSpaceOnUse"
          patternTransform={`translate(${pan.x % (40*zoom)},${pan.y % (40*zoom)})`}>
          <path d={`M ${40*zoom} 0 L 0 0 0 ${40*zoom}`} fill="none" stroke="#f0f2f5" strokeWidth={1}/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>

      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {/* Links */}
        {topo.links.map(l => {
          const sp = positions[l.source_node_id];
          const tp = positions[l.target_node_id];
          if (!sp || !tp) return null;
          const mx = (sp.x + tp.x) / 2;
          const my = (sp.y + tp.y) / 2;
          const u  = Number(l.util_pct) || 0;
          const col = utilColor(u);
          const isSelected = selId === `l${l.id}`;
          return (
            <g key={l.id} onClick={() => { setSelId(`l${l.id}`); onSelectLink(l); onSelectNode(null); }} style={{ cursor: 'pointer' }}>
              <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke="transparent" strokeWidth={12}/>
              <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                stroke={isSelected ? '#2563eb' : col}
                strokeWidth={isSelected ? 3 : Math.max(1.5, Math.min(4, 1 + u/25))}
              />
              {u > 0 && (
                <text x={mx} y={my-6} textAnchor="middle" fontSize={10} fill="#4a5568" fontFamily="monospace">{u.toFixed(0)}%</text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {topo.nodes.map(n => {
          const pos = positions[n.id] || { x: 200, y: 200 };
          const col = statusColor(n.status || 'unknown');
          const isSelected = selId === `n${n.id}`;
          return (
            <g key={n.id}
              transform={`translate(${pos.x - nodeW/2},${pos.y - nodeH/2})`}
              style={{ cursor: 'grab' }}
              onMouseDown={e => startNodeDrag(e, n.id)}
              onClick={() => { setSelId(`n${n.id}`); onSelectNode(n); onSelectLink(null); }}
            >
              <rect
                width={nodeW} height={nodeH} fill={col}
                stroke={isSelected ? '#2563eb' : 'transparent'}
                strokeWidth={isSelected ? 3 : 0}
              />
              <text
                x={nodeW/2} y={nodeH/2 + 5}
                textAnchor="middle" fontSize={12} fontWeight={700}
                fill="#ffffff" fontFamily="sans-serif"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {n.label.length > 10 ? n.label.slice(0, 10) + '…' : n.label}
              </text>
              {/* Status dot */}
              <circle cx={nodeW - 8} cy={8} r={4} fill={col === '#8492a6' ? '#ffffff' : '#ffffff'} opacity={0.6}/>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function TopologyPage() {
  const { data: topo, mutate } = useSWR<Topology>('topology', api.getTopology, { refreshInterval: 30000 });
  const [selNode, setSelNode] = useState<TopologyNode|null>(null);
  const [selLink, setSelLink] = useState<TopologyLink|null>(null);

  const nodeLinks = selNode
    ? (topo?.links.filter(l => l.source_node_id===selNode.id || l.target_node_id===selNode.id) ?? [])
    : [];

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${C.border}`, fontSize:14 }}>
      <span style={{ color:C.muted, fontWeight:500 }}>{k}</span>
      <span style={{ color:C.text, fontWeight:600, textAlign:'right' }}>{v||'—'}</span>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 96px)', gap:20 }}>
      <PageHeader
        title="Network Topology"
        sub={`${topo?.nodes.length??0} nodes · ${topo?.links.length??0} links · drag nodes to reposition · scroll to zoom`}
        right={
          <>
            {([['≥80%','#e63946'],['≥60%','#f59e0b'],['<60%','#00b37e']] as [string,string][]).map(([l,c])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:C.sub }}>
                <div style={{ width:20, height:3, background:c }}/>{l}
              </div>
            ))}
            <button onClick={()=>mutate()} style={{ fontSize:13, fontWeight:600, padding:'8px 16px', background:'#fff', border:`1px solid ${C.border2}`, cursor:'pointer', color:C.sub }}>
              ↻ Refresh
            </button>
          </>
        }
      />

      <div style={{ display:'flex', gap:2, flex:1, minHeight:0 }}>
        <div style={{ flex:1, border:`1px solid ${C.border}`, overflow:'hidden', position:'relative', minHeight:400 }}>
          {!topo ? (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontSize:14 }}>Loading topology…</div>
          ) : topo.nodes.length===0 ? (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:C.muted, gap:12 }}>
              <div style={{ fontSize:48 }}>◈</div>
              <div style={{ fontWeight:600, fontSize:15 }}>No topology nodes found</div>
              <div style={{ fontSize:13 }}>Configure topology nodes via the API</div>
            </div>
          ) : (
            <SvgTopology topo={topo} onSelectNode={setSelNode} onSelectLink={setSelLink}/>
          )}
        </div>

        <div style={{ width:260, flexShrink:0, display:'flex', flexDirection:'column', gap:2, overflowY:'auto' }}>
          {selNode ? (
            <div style={{ background:'#fff', border:`1px solid ${C.border}`, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{selNode.label}</div>
                <button onClick={()=>setSelNode(null)} style={{ fontSize:20, color:C.muted, background:'none', border:'none', cursor:'pointer' }}>×</button>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, padding:'10px 14px', background:selNode.status==='up'?C.upBg:selNode.status==='down'?C.critBg:'#f1f3f5' }}>
                <span style={{ width:10, height:10, background:statusColor(selNode.status), display:'inline-block' }}/>
                <span style={{ fontSize:13, fontWeight:700, color:statusColor(selNode.status), textTransform:'uppercase' }}>{selNode.status}</span>
              </div>
              <Row k="Hostname" v={selNode.hostname}/>
              <Row k="IP" v={<span style={{ fontFamily:C.mono }}>{selNode.ip_address}</span>}/>
              <Row k="Site" v={selNode.site_name}/>
              <Row k="Type" v={selNode.node_type}/>
              {nodeLinks.length>0 && (
                <div style={{ marginTop:20 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:12 }}>Connected Links</div>
                  {nodeLinks.map(l=>{
                    const u=Number(l.util_pct)||0;
                    const peer=l.source_node_id===selNode.id?l.target_node_id:l.source_node_id;
                    const pn=topo?.nodes.find(n=>n.id===peer);
                    return (
                      <div key={l.id} style={{ marginBottom:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                          <span style={{ fontSize:13, color:C.sub, fontWeight:500 }}>{pn?.label??`Node ${peer}`}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:utilColor(u) }}>{u.toFixed(0)}%</span>
                        </div>
                        <div style={{ height:4, background:C.border, overflow:'hidden' }}>
                          <div style={{ width:`${u}%`, height:'100%', background:utilColor(u) }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : selLink ? (
            <div style={{ background:'#fff', border:`1px solid ${C.border}`, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>Link Detail</div>
                <button onClick={()=>setSelLink(null)} style={{ fontSize:20, color:C.muted, background:'none', border:'none', cursor:'pointer' }}>×</button>
              </div>
              <Row k="Label" v={selLink.label||'—'}/>
              <Row k="Speed" v={fmtBps(selLink.link_speed_bps)}/>
              <Row k="Util"  v={`${Number(selLink.util_pct??0).toFixed(1)}%`}/>
              <div style={{ marginTop:16, height:6, background:C.border, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(Number(selLink.util_pct)||0,100)}%`, height:'100%', background:utilColor(Number(selLink.util_pct)||0) }}/>
              </div>
            </div>
          ) : (
            <div style={{ background:'#fff', border:`1px solid ${C.border}`, padding:32, textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>◈</div>
              <div style={{ fontSize:14, color:C.muted, lineHeight:1.8 }}>Click a node or link<br/>to view details</div>
            </div>
          )}

          <div style={{ background:'#fff', border:`1px solid ${C.border}`, padding:24 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:16 }}>Link Utilization</div>
            {([['≥ 80%','#e63946'],['≥ 60%','#f59e0b'],['< 60%','#00b37e'],['No data','#cdd2db']] as [string,string][]).map(([l,c])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:24, height:4, background:c }}/>
                <span style={{ fontSize:13, color:C.sub }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
