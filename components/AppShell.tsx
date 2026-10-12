'use client';

import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { shortAddress } from '@/lib/base58';
import { setStoreOwner, useAppState } from '@/lib/store';
import { Icon } from './icons';
import { WalletChip } from './Nav';
import { BrandMark } from './ui';

const RAIL: Array<{ href: string; label: string; icon: keyof typeof Icon; match?: string[] }> = [
  { href: '/forge', label: 'Home', icon: 'home' },
  { href: '/yid', label: 'YieldID maker', icon: 'id' },
  { href: '/add-crypto', label: 'Add crypto', icon: 'wallet' },
  { href: '/board', label: 'Signal board', icon: 'signal', match: ['/proposal'] },
  { href: '/rules', label: 'Rules', icon: 'rules' },
  { href: '/stables', label: 'Stables', icon: 'stables' },
  { href: '/adapters', label: 'Adapters', icon: 'adapters' },
  { href: '/policy', label: 'Spend policy', icon: 'policy' },
  { href: '/channels', label: 'Channels', icon: 'channels' },
  { href: '/tracker', label: 'Tracker', icon: 'tracker' },
];

const BUILD = ['/adapters', '/policy', '/channels', '/rules'];

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('yieldid:theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.body.dataset.theme = theme;
    try {
      localStorage.setItem('yieldid:theme', theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme] as const;
}

export function AppShell({ address, children }: { address: string; children: ReactNode }) {
  // Scope saved state to this wallet before anything below reads it.
  setStoreOwner(address);
  const path = usePathname();
  const router = useRouter();
  const { logout } = usePrivy();
  const { handle } = useAppState();
  const [theme, setTheme] = useTheme();
  const domain = process.env.NEXT_PUBLIC_YID_DOMAIN;
  const isBuild = BUILD.includes(path);
  const name = handle ?? shortAddress(address);

  async function disconnect() {
    await fetch('/api/session', { method: 'DELETE' });
    await logout().catch(() => undefined);
    router.replace('/');
  }

  return (
    <div className="yf-appbg">
      <div className="yf-shell">
        <nav className="yf-rail" aria-label="Primary">
          <Link href="/forge" className="yf-rail__brand" aria-label="YieldID home">
            <BrandMark size={34} />
          </Link>
          {RAIL.map((r) => {
            const active = path === r.href || r.match?.includes(path);
            return (
              <Link key={r.href} href={r.href} className="yf-rail__link" aria-current={active ? 'page' : undefined} aria-label={r.label}>
                {Icon[r.icon](22)}
                <span className="yf-rail__label" aria-hidden="true">{r.label}</span>
              </Link>
            );
          })}
          <span className="yf-rail__spacer" />
          <button type="button" className="yf-rail__link" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
            {Icon.sun(22)}
            <span className="yf-rail__label" aria-hidden="true">{theme === 'light' ? 'Dark theme' : 'Light theme'}</span>
          </button>
          <button type="button" className="yf-rail__link" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={disconnect} aria-label="Disconnect">
            {Icon.logout(22)}
            <span className="yf-rail__label" aria-hidden="true">Disconnect</span>
          </button>
        </nav>

        <main className="yf-main">
          <header className="yf-topbar">
            <div className="yf-seg" role="navigation" aria-label="Mode">
              <Link href="/forge" aria-current={!isBuild ? 'page' : undefined}>Earn</Link>
              <Link href="/adapters" aria-current={isBuild ? 'page' : undefined}>Build</Link>
            </div>
            <div className="yf-topbar__title" />
            <div className="yf-hello">
              <small>Hello,</small>
              <b>{handle && domain ? `${handle}@${domain}` : name}</b>
            </div>
            <span className="yf-avatar" aria-hidden="true">{(handle ?? 'Y').slice(0, 2).toUpperCase()}</span>
            <WalletChip address={address} />
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
