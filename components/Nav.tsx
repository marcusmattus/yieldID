'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react';
import { shortAddress } from '@/lib/base58';
import { useAppState } from '@/lib/store';
import { Brand } from './ui';

const LINKS = [
  ['/forge', 'Forge'],
  ['/board', 'Signal'],
  ['/rules', 'Rules'],
  ['/stables', 'Stables'],
  ['/adapters', 'Adapters'],
  ['/policy', 'Policy'],
  ['/channels', 'Channels'],
  ['/tracker', 'Tracker'],
] as const;

export function WalletChip({ address, verified = true }: { address: string | null; verified?: boolean }) {
  const { handle } = useAppState();
  const domain = process.env.NEXT_PUBLIC_YID_DOMAIN;
  if (!address) {
    return (
      <span className="yf-chip yf-chip--off">
        <span className="yf-chip__mark" aria-hidden="true" />
        No wallet connected
      </span>
    );
  }
  if (!verified) {
    return (
      <span className="yf-chip yf-chip--unresolved" title={address}>
        <span className="yf-chip__mark" aria-hidden="true" />
        {shortAddress(address)} · not verified
      </span>
    );
  }
  return (
    <span className="yf-chip" title={address}>
      <span className="yf-chip__mark" aria-hidden="true" />
      {handle && domain ? `${handle}@${domain}` : shortAddress(address)}
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
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
  return (
    <button type="button" className="yf-iconbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

export function Nav({ address }: { address: string }) {
  const path = usePathname();
  const router = useRouter();
  const { logout } = usePrivy();

  async function disconnect() {
    await fetch('/api/session', { method: 'DELETE' });
    await logout().catch(() => undefined);
    router.replace('/');
  }

  return (
    <nav className="yf-nav" aria-label="Primary">
      <Link href="/forge" aria-label="YieldID home" style={{ marginRight: 'auto', textDecoration: 'none' }}>
        <Brand />
      </Link>
      <div className="yf-nav__links">
        {LINKS.map(([href, label]) => (
          <Link key={href} className="yf-nav__link" href={href} aria-current={path === href || (href === '/board' && path === '/proposal') ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </div>
      <div className="yf-nav__right">
        <ThemeToggle />
        <button type="button" className="yf-iconbtn" onClick={disconnect}>Disconnect</button>
        <WalletChip address={address} />
      </div>
    </nav>
  );
}

export function OnboardNav({ address, verified }: { address: string | null; verified?: boolean }) {
  return (
    <nav className="yf-nav" aria-label="Primary">
      <span style={{ marginRight: 'auto' }}>
        <Brand />
      </span>
      <WalletChip address={address} verified={verified} />
    </nav>
  );
}
