/**
 * Ramp Network on-ramp: card or bank to USDC, delivered straight to the
 * user's own wallet. YieldID never holds the funds or sees card details.
 *
 * Production widget: app.ramp.network, needs a host API key from Ramp.
 * Test widget: app.dev.ramp-network.org. Ramp's test environment has no
 * Solana USDC; it offers Base Sepolia USDC, so test mode buys BASE_USDC
 * to a linked EVM address.
 */

export type RampEnv = 'production' | 'demo';
export type RampChain = 'solana' | 'base';

export const RAMP_WIDGET_URL: Record<RampEnv, string> = {
  production: 'https://app.ramp.network',
  demo: 'https://app.dev.ramp-network.org',
};

export const RAMP_API_URL: Record<RampEnv, string> = {
  production: 'https://api.ramp.network/api',
  demo: 'https://api.dev.ramp-network.org/api',
};

/** Ramp asset symbols are CHAIN_SYMBOL. */
export const RAMP_ASSET: Record<RampChain, string> = {
  solana: 'SOLANA_USDC',
  base: 'BASE_USDC',
};

/** Which chains each Ramp environment can deliver USDC on. */
export const RAMP_CHAINS: Record<RampEnv, RampChain[]> = {
  production: ['solana', 'base'],
  demo: ['base'],
};

export interface RampSetup {
  env: RampEnv;
  hostApiKey: string | null;
  /** Null when the on-ramp can be opened; otherwise the reason it cannot. */
  blocked: string | null;
}

export function rampSetup(env: Record<string, string | undefined>): RampSetup {
  const hostApiKey = env.NEXT_PUBLIC_RAMP_HOST_API_KEY?.trim() || null;
  const asked = env.NEXT_PUBLIC_RAMP_ENV?.trim();
  const mode: RampEnv = asked === 'demo' || asked === 'production' ? asked : hostApiKey ? 'production' : 'demo';
  if (mode === 'production' && !hostApiKey) {
    return { env: mode, hostApiKey, blocked: 'Ramp is set to production but NEXT_PUBLIC_RAMP_HOST_API_KEY is empty. Ask Ramp for a host API key, or set NEXT_PUBLIC_RAMP_ENV=demo to use their test environment.' };
  }
  return { env: mode, hostApiKey, blocked: null };
}

export interface RampWidgetInput {
  setup: RampSetup;
  chain: RampChain;
  userAddress: string;
  hostAppName: string;
  hostLogoUrl: string;
  webhookStatusUrl?: string;
}

/** The config passed to RampInstantSDK. Kept pure so it can be tested. */
export function rampWidgetConfig(i: RampWidgetInput) {
  if (i.setup.blocked) throw new Error(i.setup.blocked);
  if (!RAMP_CHAINS[i.setup.env].includes(i.chain)) {
    throw new Error(`Ramp's ${i.setup.env} environment does not deliver USDC on ${i.chain}.`);
  }
  return {
    url: RAMP_WIDGET_URL[i.setup.env],
    ...(i.setup.hostApiKey ? { hostApiKey: i.setup.hostApiKey } : {}),
    hostAppName: i.hostAppName,
    hostLogoUrl: i.hostLogoUrl,
    swapAsset: RAMP_ASSET[i.chain],
    defaultFlow: 'ONRAMP' as const,
    enabledFlows: ['ONRAMP' as const],
    userAddress: i.userAddress,
    variant: 'auto' as const,
    ...(i.webhookStatusUrl ? { webhookStatusUrl: i.webhookStatusUrl } : {}),
  };
}

/** Ramp purchase statuses that end the flow. */
export const RAMP_FINAL = new Set(['RELEASED', 'RETURNED', 'EXPIRED', 'CANCELLED', 'PAYMENT_FAILED']);

/** Plain-language label for a Ramp purchase status. */
export function rampStatusLabel(status: string): string {
  switch (status) {
    case 'INITIALIZED': return 'Started, waiting for payment';
    case 'PAYMENT_STARTED':
    case 'PAYMENT_IN_PROGRESS': return 'Payment in progress';
    case 'PAYMENT_EXECUTED':
    case 'FIAT_SENT':
    case 'FIAT_RECEIVED': return 'Payment received, preparing USDC';
    case 'RELEASING': return 'Sending USDC to your wallet';
    case 'RELEASED': return 'USDC sent to your wallet';
    case 'RETURNED': return 'Returned';
    case 'EXPIRED': return 'Expired';
    case 'CANCELLED': return 'Cancelled';
    case 'PAYMENT_FAILED': return 'Payment failed';
    default: return status;
  }
}
