#!/usr/bin/env node
/**
 * YieldID MCP server over stdio. Point Claude Desktop, Claude Code, Cursor or
 * any MCP client at it:
 *
 *   YIELDID_API_URL=https://your-yieldid.app
 *   YIELDID_API_KEY=yid_sk_…            (from the Agents screen)
 *   YIELDID_AGENT_WALLET_SECRET=…       optional: base58 or JSON array of the
 *                                        agent's own 64-byte Solana secret key,
 *                                        enables x402_fetch
 *   YIELDID_X402_NETWORKS=solana        or solana-devnet (comma separated)
 *   YIELDID_X402_MAX_USDC=1             local ceiling per payment
 *   YIELDID_SOLANA_RPC=…                RPC for the blockhash
 *
 *   npx tsx mcp/stdio.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { base58ToBytes } from '../lib/base58';
import { HttpBackend } from '../lib/mcp/backend';
import { registerYieldIdTools, type AgentWallet } from '../lib/mcp/tools';
import type { SolanaNetwork } from '../lib/x402/types';

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`${name} is not set. See mcp/stdio.ts for the variables.\n`);
    process.exit(1);
  }
  return v;
}

async function loadWallet(): Promise<AgentWallet | null> {
  const secret = process.env.YIELDID_AGENT_WALLET_SECRET;
  if (!secret) return null;
  const bytes = secret.trim().startsWith('[') ? Uint8Array.from(JSON.parse(secret) as number[]) : base58ToBytes(secret.trim());
  if (bytes.length !== 64) throw new Error('YIELDID_AGENT_WALLET_SECRET must be a 64-byte Solana secret key.');
  const networks = (process.env.YIELDID_X402_NETWORKS ?? 'solana').split(',').map((s) => s.trim()) as SolanaNetwork[];
  const devnet = networks.length === 1 && networks[0] === 'solana-devnet';
  return {
    signer: await createKeyPairSignerFromBytes(bytes),
    rpcUrl: process.env.YIELDID_SOLANA_RPC ?? (devnet ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'),
    networks,
    ceilingMicro: BigInt(Math.round(Number(process.env.YIELDID_X402_MAX_USDC ?? '1') * 1e6)),
  };
}

async function main() {
  const backend = new HttpBackend(need('YIELDID_API_URL'), need('YIELDID_API_KEY'));
  const wallet = await loadWallet();
  const server = new McpServer({ name: 'yieldid', version: '0.1.0' });
  registerYieldIdTools(server, backend, wallet);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`YieldID MCP ready${wallet ? `, agent wallet ${wallet.signer.address}` : ', no agent wallet (x402_fetch off)'}\n`);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
