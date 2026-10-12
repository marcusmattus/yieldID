/** Stroke icons, 24px grid, currentColor. Decorative unless given a label. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Svg({ children, size = 24 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...P}>
      {children}
    </svg>
  );
}

export const Icon = {
  home: (s?: number) => <Svg size={s}><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Svg>,
  signal: (s?: number) => <Svg size={s}><path d="M4 18 9 12l4 3 7-9" /><path d="M15 6h5v5" /></Svg>,
  rules: (s?: number) => <Svg size={s}><path d="M5 6h14M5 12h9M5 18h5" /><circle cx="18" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></Svg>,
  stables: (s?: number) => <Svg size={s}><path d="M7 7h10M7 12h10M7 17h6" /><rect x="3" y="3" width="18" height="18" rx="5" /></Svg>,
  adapters: (s?: number) => <Svg size={s}><path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" /></Svg>,
  policy: (s?: number) => <Svg size={s}><path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></Svg>,
  channels: (s?: number) => <Svg size={s}><path d="M4 5h16v11H9l-5 4z" /></Svg>,
  tracker: (s?: number) => <Svg size={s}><path d="M4 19V5M4 19h16" /><path d="M8 15v-3M12 15V8M16 15v-5" /></Svg>,
  id: (s?: number) => <Svg size={s}><rect x="3" y="5" width="18" height="14" rx="4" /><circle cx="9" cy="12" r="2.5" /><path d="M14 10h4M14 14h3" /></Svg>,
  plus: (s?: number) => <Svg size={s}><path d="M12 5v14M5 12h14" /></Svg>,
  arrowDown: (s?: number) => <Svg size={s}><path d="M12 4v14M6 12l6 6 6-6" /></Svg>,
  route: (s?: number) => <Svg size={s}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" /></Svg>,
  wallet: (s?: number) => <Svg size={s}><path d="M4 7a2 2 0 0 1 2-2h12v4" /><rect x="4" y="7" width="16" height="13" rx="3" /><circle cx="16" cy="13.5" r="1.3" /></Svg>,
  copy: (s?: number) => <Svg size={s}><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>,
  check: (s?: number) => <Svg size={s}><path d="m5 12 4.5 4.5L19 7" /></Svg>,
  bolt: (s?: number) => <Svg size={s}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></Svg>,
  globe: (s?: number) => <Svg size={s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>,
  logout: (s?: number) => <Svg size={s}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></Svg>,
  sun: (s?: number) => <Svg size={s}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></Svg>,
  arrowRight: (s?: number) => <Svg size={s}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>,
};
