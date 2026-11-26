import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticate } from '@/lib/agent/keys';
import { InProcessBackend } from '@/lib/mcp/inprocess';
import { registerYieldIdTools } from '@/lib/mcp/tools';

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Agents and exchange-side
 * tools connect with:  URL https://<app>/api/mcp, header Authorization: Bearer yid_sk_…
 *
 * x402_fetch is not offered here: paying needs the agent's own wallet, which
 * stays on the agent's machine. Run mcp/stdio.ts locally for that.
 */
export const runtime = 'nodejs';

async function handle(req: Request): Promise<Response> {
  const a = await authenticate(req.headers.get('authorization'));
  if (!a.ok) {
    return Response.json({ jsonrpc: '2.0', error: { code: -32001, message: `${a.reason} ${a.fix}` }, id: null }, { status: a.status, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  const server = new McpServer({ name: 'yieldid', version: '0.1.0' });
  registerYieldIdTools(server, new InProcessBackend(a.key), null);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
