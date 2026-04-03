import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/shared/Sidebar';

export const metadata: Metadata = {
  title: 'SpanVault — WAN Monitoring',
  description: 'WAN visibility and monitoring platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f0f2f5' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
