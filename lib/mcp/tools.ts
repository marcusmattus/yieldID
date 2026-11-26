import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TransactionSigner } from '@solana/kit';
import { z } from 'zod';
import { fetchWithPayment, X402Error } from '../x402/client';
import type { SolanaNetwork } from '../x402/types';
import { BackendError, type Backend } from './backend';

/**
 * The YieldID agent tools. Every tool goes through the Backend, so the key's
 * scopes, caps and the owner's kill switch apply whether the agent runs this
 * locally over stdio or connects to the remote endpoint.
 */

export interface AgentWallet {
  signer: TransactionSigner;
  rpcUrl: string;
  networks: SolanaNetwork[];
  /** Local ceiling per payment, micro-USDC, on top of the key's own caps. */
  ceilingMicro: bigint;
}

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });

function errorResult(e: unknown) {
  const err = e as Error & { fix?: string; detail?: unknown };
  const out = { ok: false, reason: err.message, fix: err.fix, detail: err instanceof X402Error ? err.detail : undefined };
  return { ...text(out), isError: true };
}

async function run(fn: () => Promise<unknown>) {
  try {
    return text(await fn());
  } catch (e) {
    if (e instanceof BackendError || e instanceof X402Error || e instanceof Error) return errorResult(e);
    return errorResult(new Error(String(e)));
  }
}

const window = z.enum(['per_transaction', 'daily', 'monthly']);

export function registerYieldIdTools(server: McpServer, backend: Backend, wallet: AgentWallet | null) {
  const ro = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    'yieldid_whoami',
    { title: 'Who am I', description: "Show this key's owner, scopes, caps, spend today and the kill switch state. Call first.", inputSchema: {}, annotations: ro },
    () => run(() => backend.whoami()),
  );

  server.registerTool(
    'pot_status',
    {
      title: 'Yield pot status',
      description: "The owner's yield pot: live wallet USDC and SOL, venue positions, totals and a projected annual yield at the best net rate. Says when rates are sample data.",
      inputSchema: {},
      annotations: ro,
    },
    () => run(() => backend.potStatus()),
  );

  server.registerTool(
    'pot_rates',
    {
      title: 'Venue rates, ranked by net',
      description: 'Stable venues ranked by net rate (gross minus annualised move cost), plus venues not ranked and why. Rates are labelled live or sample.',
      inputSchema: {},
      annotations: ro,
    },
    () => run(() => backend.potRates()),
  );

  server.registerTool(
    'pot_deposit_address',
    {
      title: 'Where to send USDC',
      description: "The owner's Solana address, network and USDC mint for funding the pot, e.g. from an exchange withdrawal. Includes the network warnings to show the user.",
      inputSchema: {},
      annotations: ro,
    },
    () => run(() => backend.depositAddress()),
  );

  server.registerTool(
    'pot_proposals',
    { title: 'Proposals by this key', description: 'Deposits and withdrawals this key proposed, with status and every check.', inputSchema: {}, annotations: ro },
    () => run(() => backend.proposals()),
  );

  server.registerTool(
    'pot_propose',
    {
      title: 'Propose a deposit or withdrawal',
      description:
        'Propose moving USDC into (deposit) or out of (withdraw) a venue from pot_rates. Runs every check and returns them. A passing proposal waits for the owner to sign in the YieldID app; agents never sign it. Use small amounts and explain why.',
      inputSchema: {
        kind: z.enum(['deposit', 'withdraw']),
        venueId: z.string().min(1).describe('venueId from pot_rates'),
        amountUsdc: z.number().positive().describe('Amount in USDC, e.g. 250.5'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) => run(() => backend.propose(a)),
  );

  server.registerTool(
    'card_list',
    { title: 'List cards', description: "The owner's stablecoin cards: last 4, status, limit and whether each is sandbox.", inputSchema: {}, annotations: ro },
    () => run(() => backend.cards()),
  );

  server.registerTool(
    'card_issue',
    {
      title: 'Issue a virtual card',
      description:
        "Issue a virtual card that spends the owner's USDC, with a spend limit. The owner adds it to Apple Pay or Google Pay from the YieldID app on their phone; agents cannot. Confirm with the user before issuing.",
      inputSchema: {
        label: z.string().max(40).optional(),
        spendLimitUsdc: z.number().nonnegative(),
        limitWindow: window.optional().describe('Defaults to monthly'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (a) => run(() => backend.issueCard(a)),
  );

  server.registerTool(
    'card_update',
    {
      title: 'Freeze, unfreeze or change a limit',
      description: 'Set a card to frozen or active, or change its spend limit. Closing a card is owner-only.',
      inputSchema: {
        cardId: z.string().min(1),
        status: z.enum(['active', 'frozen']).optional(),
        spendLimitUsdc: z.number().nonnegative().optional(),
        limitWindow: window.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ cardId, ...patch }) => run(() => backend.updateCard(cardId, patch)),
  );

  server.registerTool(
    'x402_ledger',
    { title: 'Payments by this key', description: 'x402 payments this key authorised, newest first, with settlement signatures.', inputSchema: {}, annotations: ro },
    () => run(() => backend.ledger()),
  );

  if (!wallet) return;

  server.registerTool(
    'x402_fetch',
    {
      title: 'Fetch a URL, paying with x402 if asked',
      description:
        "Fetch a URL. If it answers 402 Payment Required with an x402 offer in USDC on Solana, check the key's caps with YieldID, pay from the agent's own wallet and retry once. Never pays more than maxUsdc or the key's per-transaction cap.",
      inputSchema: {
        url: z.string().url(),
        method: z.enum(['GET', 'POST']).default('GET'),
        body: z.string().max(100_000).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        maxUsdc: z.number().positive().max(1_000).describe('Most this call may pay, in USDC'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ url, method, body, headers, maxUsdc }) =>
      run(async () => {
        const asked = BigInt(Math.round(maxUsdc * 1e6));
        const ceiling = asked < wallet.ceilingMicro ? asked : wallet.ceilingMicro;
        const { response, paid } = await fetchWithPayment(
          url,
          { method, body, headers },
          {
            signer: wallet.signer,
            rpcUrl: wallet.rpcUrl,
            networks: wallet.networks,
            maxMicro: ceiling,
            authorize: (r, amountMicro) =>
              backend.x402Authorize({ amountMicro: amountMicro.toString(), payTo: r.payTo, resource: r.resource || url, network: r.network, asset: r.asset }),
            onSettled: async (id, s) => {
              if (id && s?.transaction) await backend.x402Settled(id, s.transaction);
            },
            onFailed: async (id) => {
              if (id) await backend.x402Release(id);
            },
          },
        );
        const raw = await response.text();
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          paid: paid
            ? { amountUsdc: Number(paid.amountMicro) / 1e6, network: paid.requirement.network, payTo: paid.requirement.payTo, transaction: paid.settlement?.transaction ?? null }
            : null,
          body: raw.length > 20_000 ? `${raw.slice(0, 20_000)}\n…[truncated ${raw.length - 20_000} chars]` : raw,
        };
      }),
  );

  server.registerTool(
    'agent_wallet',
    {
      title: "The agent's own wallet",
      description: "The address this agent pays x402 from. Fund it with a small amount of USDC; it needs no SOL because the facilitator pays fees.",
      inputSchema: {},
      annotations: ro,
    },
    () => run(async () => ({ address: wallet.signer.address, networks: wallet.networks, ceilingUsdc: Number(wallet.ceilingMicro) / 1e6 })),
  );
}
