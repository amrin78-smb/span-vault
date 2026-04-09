import React from 'react';

export const C = {
  bg:       '#f0f2f5',
  surface:  '#ffffff',
  border:   '#e2e6ec',
  border2:  '#cdd2db',
  text:     '#0f1923',
  sub:      '#4a5568',
  muted:    '#8492a6',
  up:       '#00b37e',
  warn:     '#f59e0b',
  crit:     '#e63946',
  info:     '#2563eb',
  purple:   '#7c3aed',
  accent:   '#2563eb',
  mono:     "'DM Mono', monospace",
  // status bg
  upBg:     '#e6f9f3',
  warnBg:   '#fef3c7',
  critBg:   '#fde8ea',
  infoBg:   '#eff6ff',
};

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: 24, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 20, ...style }}>
      {children}
    </div>
  );
}

export function KpiTile({ label, value, sub, color, bg }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string;
}) {
  return (
    <div style={{ background: bg || C.surface, border: `1px solid ${C.border}`, borderRadius: 0, padding: '24px 28px', borderTop: `3px solid ${color || C.border2}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1, letterSpacing: '-2px', color: color || C.text, fontFamily: "'DM Sans', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    up:      [C.upBg,   C.up],
    down:    [C.critBg, C.crit],
    warning: [C.warnBg, C.warn],
    unknown: ['#f1f3f5', C.muted],
  };
  const [bg, color] = map[status] || map.unknown;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 0, fontSize: 12, fontWeight: 600, background: bg, color }}>
      {status.toUpperCase()}
    </span>
  );
}

export function SevPill({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    critical: [C.critBg, C.crit],
    warning:  [C.warnBg, C.warn],
    info:     [C.infoBg, C.info],
  };
  const [bg, color] = map[s] || map.info;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 0, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s}</span>
  );
}

export function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? C.crit : pct >= 60 ? C.warn : C.up;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 80, height: 4, background: C.border, borderRadius: 0, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, width: 36 }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export function Input({ value, onChange, onBlur, placeholder, style }: {
  value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 0, padding: '10px 14px', color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', ...style }}
      onFocus={e => e.target.style.borderColor = C.accent}
      onBlur={e => { e.target.style.borderColor = C.border2; onBlur?.(e.target.value); }}
    />
  );
}

export function Select({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  style?: React.CSSProperties;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 0, padding: '10px 14px', color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', appearance: 'none', cursor: 'pointer', ...style }}>
      <option value="">— select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Btn({ children, onClick, variant = 'ghost', disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: C.accent, color: '#fff',    border: `1px solid ${C.accent}` },
    ghost:   { background: '#fff',   color: C.sub,     border: `1px solid ${C.border2}` },
    danger:  { background: C.critBg, color: C.crit,    border: `1px solid ${C.crit}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', borderRadius: 0, fontSize: 13, fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif", cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, transition: 'opacity 0.15s', ...styles[variant],
    }}>{children}</button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      {children}
    </div>
  );
}

export function Modal({ title, children, onClose, width = 520 }: {
  title: string; children: React.ReactNode; onClose: () => void; width?: number;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,25,35,0.5)' }} onClick={onClose}>
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 0, padding: 32, width, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 24 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{title}</h1>
        {sub && <p style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>{sub}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

export function ChartTip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 0, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ color: C.muted, marginBottom: 6, fontSize: 12 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || C.text, fontWeight: 600 }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{unit}</div>
      ))}
    </div>
  );
}
