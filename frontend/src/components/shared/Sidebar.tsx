'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C } from './ui';

const NAV = [
  { href: '/',         label: 'Dashboard',  icon: '▦' },
  { href: '/topology', label: 'Topology',   icon: '◈' },
  { href: '/devices',  label: 'Devices',    icon: '⬡' },
  { href: '/alerts',   label: 'Alerts',     icon: '⚑' },
  { href: '/flows',    label: 'Flows',      icon: '⇄' },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside style={{ width: 220, flexShrink: 0, background: '#0f1923', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '28px 24px 24px', borderBottom: '1px solid #1e2d3d' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>SpanVault</div>
        <div style={{ fontSize: 11, color: '#4a6070', marginTop: 4, letterSpacing: '2px', textTransform: 'uppercase' }}>WAN Monitor</div>
      </div>
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {NAV.map(({ href, label, icon }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
              marginBottom: 2, textDecoration: 'none', fontSize: 14, fontWeight: active ? 600 : 400,
              color: active ? '#fff' : '#4a6070',
              background: active ? '#1e2d3d' : 'transparent',
              borderLeft: active ? '3px solid #2563eb' : '3px solid transparent',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
      <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #1e2d3d' }}>
        <div style={{ fontSize: 11, color: '#2a3a50', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>Device Status</div>
        {[['#00b37e', '6 online'], ['#f59e0b', '1 warning'], ['#e63946', '1 down']].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a6070', marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, background: c, display: 'inline-block', flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>
    </aside>
  );
}
