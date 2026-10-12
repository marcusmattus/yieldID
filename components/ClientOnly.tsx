'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Data views depend on the clock and on state kept in this browser, so they
 * render after mount. Until then a neutral skeleton shows: no figure is ever
 * rendered that was not computed for this viewer.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="yf-stack" aria-busy="true" aria-label="Loading">
        <div className="yf-skeleton yf-skeleton--short" style={{ height: 36 }} />
        <div className="yf-skeleton yf-skeleton--mid" />
        <div className="yf-skeleton" style={{ height: 240 }} />
      </div>
    );
  }
  return <>{children}</>;
}
