import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './styles/tokens.css';
import './styles/bundle.css';
import './styles/app.css';
import './styles/shell.css';

export const metadata: Metadata = {
  title: 'YieldID',
  description: 'Name your wallets, rank stable venues net of move cost, and sign every switch yourself.',
  icons: { icon: '/brand/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#eceae0', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="yf-root" data-theme="light">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
