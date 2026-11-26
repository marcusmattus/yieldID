import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateKeyPairSigner } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { BackendError, type Backend } from '../lib/mcp/backend';
import { registerYieldIdTools } from '../lib/mcp/tools';

const fake = (): Backend => ({
  whoami: async () => ({ owner: 'o' }),
  potStatus: async () => ({ totals: { totalUsdc: 10 } }),
  potRates: async () => ({ ranked: [] }),
  depositAddress: async () => ({ address: 'o' }),
  proposals: async () => [],
  propose: async (i) => ({ status: 'blocked', ...i }),
  cards: async () => {
    throw new BackendError('This key does not have card:read.', 'Create a key with card:read.', 403);
  },
  issueCard: async () => ({}),
  updateCard: async () => ({}),
  x402Authorize: async () => ({ ok: false }),
  x402Settled: async () => ({}),
  x402Release: async () => ({}),
  ledger: async () => [],
});

async function connect(withWallet: boolean) {
  const server = new McpServer({ name: 'yieldid', version: 'test' });
  const wallet = withWallet ? { signer: await generateKeyPairSigner(), rpcUrl: 'x', networks: ['solana-devnet' as const], ceilingMicro: 1_000_000n } : null;
  registerYieldIdTools(server, fake(), wallet);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(b);
  return client;
}

describe('MCP tools', () => {
  it('lists the pot, card and ledger tools, and adds x402_fetch only with an agent wallet', async () => {
    const remote = await connect(false);
    const names = (await remote.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['yieldid_whoami', 'pot_status', 'pot_rates', 'pot_deposit_address', 'pot_propose', 'card_issue', 'card_update', 'x402_ledger']));
    expect(names).not.toContain('x402_fetch');
    const local = await connect(true);
    expect((await local.listTools()).tools.map((t) => t.name)).toContain('x402_fetch');
  });

  it('passes arguments through and turns backend refusals into tool errors with a fix', async () => {
    const c = await connect(false);
    const ok = await c.callTool({ name: 'pot_propose', arguments: { kind: 'deposit', venueId: 'venue-b', amountUsdc: 5 } });
    expect(JSON.parse((ok.content as { text: string }[])[0].text)).toMatchObject({ venueId: 'venue-b', amountUsdc: 5 });
    const bad = await c.callTool({ name: 'card_list', arguments: {} });
    expect(bad.isError).toBe(true);
    expect(JSON.parse((bad.content as { text: string }[])[0].text)).toMatchObject({ ok: false, fix: 'Create a key with card:read.' });
  });
});
