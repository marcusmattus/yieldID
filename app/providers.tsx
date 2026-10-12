'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import type { ReactNode } from 'react';

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';
const wsUrl = rpcUrl.replace(/^http/, 'ws');

const solanaConnectors = toSolanaWalletConnectors();

export function Providers({ children }: { children: ReactNode }) {
  if (!appId) {
    return (
      <div className="yf-page yf-page--narrow">
        <div className="yf-state yf-state--error" role="alert">
          <span className="yf-badge yf-badge--danger">Not configured</span>
          <h1 className="yf-state__title">Privy app ID is missing</h1>
          <p className="yf-state__body">
            Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local to your app ID from dashboard.privy.io, then restart the dev
            server. See .env.example for every variable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        // Wallet first. Email is the secondary path; it creates an embedded Solana wallet the user can export.
        loginMethods: ['wallet', 'email'],
        appearance: {
          theme: 'dark',
          accentColor: '#f2762e',
          logo: '/brand/yieldid-logo-dark.svg',
          landingHeader: 'Connect wallet',
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
          walletList: ['phantom', 'detected_solana_wallets', 'solflare', 'backpack', 'wallet_connect_qr_solana'],
        },
        externalWallets: { solana: { connectors: solanaConnectors } },
        embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(rpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
              blockExplorerUrl: 'https://explorer.solana.com',
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
