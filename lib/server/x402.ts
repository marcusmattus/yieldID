import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
  type RouteConfig,
} from '@x402/core/server';
import type { AssetAmount, Network, PaymentRequirements, Price, SchemeNetworkServer, SupportedKind } from '@x402/core/types';
import { bazaarResourceServerExtension } from '@x402/extensions/bazaar';
import { readX402Config, usdcByNetwork, usdToUnits, type X402Config, type X402Family } from '@/lib/x402/networks';

/**
 * x402 v2 server for YieldID's paid agent API.
 *
 * An agent calls a paid route, gets 402 with the payment requirements, signs a
 * USDC transfer to YieldID's own address, and retries with the signed payload.
 * A facilitator verifies the payload and settles it on chain; YieldID never
 * touches the payer's keys and the payment lands directly in the payTo wallet.
 *
 * The scheme server below prices in USDC only. It follows the reference
 * ExactSvmScheme / ExactEvmScheme from @x402/svm and @x402/evm (Apache-2.0),
 * trimmed to USDC so the app keeps its own @solana/kit version.
 */
export class UsdcExactScheme implements SchemeNetworkServer {
  readonly scheme = 'exact';
  readonly defaultAssetTransferMethod: string;
  readonly paymentFlows: SchemeNetworkServer['paymentFlows'];

  constructor(private readonly family: X402Family) {
    this.defaultAssetTransferMethod = family === 'svm' ? 'default' : 'eip3009';
    this.paymentFlows =
      family === 'svm'
        ? { default: { supported: ['authorization', 'upfront'], default: 'authorization' } }
        : { eip3009: { supported: ['authorization', 'upfront'], default: 'authorization' } };
  }

  getAssetDecimals(asset: string, network: Network): number | undefined {
    const usdc = usdcByNetwork(network);
    return usdc && usdc.asset.toLowerCase() === asset.toLowerCase() ? usdc.decimals : undefined;
  }

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === 'object' && price !== null && 'amount' in price) {
      if (!price.asset) throw new Error(`Asset must be set for an AssetAmount on ${network}`);
      return { amount: price.amount, asset: price.asset, extra: price.extra ?? {} };
    }
    const usdc = usdcByNetwork(network);
    if (!usdc) throw new Error(`No USDC contract known for ${network}`);
    const usd = String(price).replace(/^\$/, '').trim();
    if (!/^\d+(\.\d{1,6})?$/.test(usd)) throw new Error(`Price "${price}" is not a dollar amount`);
    return {
      amount: usdToUnits(usd),
      asset: usdc.asset,
      extra: usdc.eip712 ? { name: usdc.eip712.name, version: usdc.eip712.version } : {},
    };
  }

  async enhancePaymentRequirements(req: PaymentRequirements, kind: SupportedKind): Promise<PaymentRequirements> {
    if (this.family === 'evm') return req;
    // Solana: the facilitator pays the transaction fee, so the client must know its address.
    const extra: Record<string, unknown> = { ...req.extra, feePayer: kind.extra?.feePayer };
    if (kind.extra && 'transactionVersions' in kind.extra) extra.transactionVersions = kind.extra.transactionVersions;
    return { ...req, extra };
  }
}

export function buildResourceServer(config: X402Config, facilitatorUrl = config.facilitatorUrl) {
  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl, timeoutMs: 20_000 }));
  for (const { net } of config.accepts) server.register(net.network, new UsdcExactScheme(net.family));
  server.registerExtension(bazaarResourceServerExtension);
  return server;
}

export function routeConfig(config: X402Config, route: Omit<RouteConfig, 'accepts'>): RouteConfig {
  return {
    ...route,
    accepts: config.accepts.map(({ net, payTo }) => ({
      scheme: 'exact',
      network: net.network,
      payTo,
      price: `$${config.priceUsd}`,
      maxTimeoutSeconds: 120,
    })),
  };
}

class NextAdapter implements HTTPAdapter {
  constructor(private readonly req: NextRequest) {}
  getHeader(name: string) { return this.req.headers.get(name) ?? undefined; }
  getMethod() { return this.req.method; }
  getPath() { return this.req.nextUrl.pathname; }
  getUrl() { return this.req.url; }
  getAcceptHeader() { return this.req.headers.get('accept') ?? ''; }
  getUserAgent() { return this.req.headers.get('user-agent') ?? ''; }
  getQueryParams() {
    const out: Record<string, string | string[]> = {};
    this.req.nextUrl.searchParams.forEach((v, k) => {
      const cur = out[k];
      out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
    });
    return out;
  }
  getQueryParam(name: string) {
    const all = this.req.nextUrl.searchParams.getAll(name);
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
  }
  async getBody() {
    try { return await this.req.clone().json(); } catch { return undefined; }
  }
}

function toResponse(r: HTTPResponseInstructions): NextResponse {
  const headers = new Headers(r.headers);
  if (r.isHtml) {
    headers.set('content-type', 'text/html; charset=utf-8');
    return new NextResponse(r.body as string, { status: r.status, headers });
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new NextResponse(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}), { status: r.status, headers });
}

type Handler = (req: NextRequest) => Promise<NextResponse>;

/**
 * Wrap a route handler so it only runs once an x402 payment verifies, and the
 * payment settles only if the handler succeeds. Mirrors @x402/next's withX402
 * for Next 15. Pass `deps` in tests to point at a stub facilitator.
 */
export function withX402(handler: Handler, route: Omit<RouteConfig, 'accepts'>, deps?: { config?: X402Config; facilitatorUrl?: string }): Handler {
  let ready: { http: x402HTTPResourceServer; init: Promise<void> } | null = null;
  return async (req) => {
    const config = deps?.config ?? readX402Config(process.env);
    if (config.problem) {
      return NextResponse.json({ error: 'The paid API is not configured on this deployment.', detail: config.problem }, { status: 503 });
    }
    if (!ready) {
      const http = new x402HTTPResourceServer(buildResourceServer(config, deps?.facilitatorUrl), routeConfig(config, route));
      ready = { http, init: http.initialize() };
    }
    try {
      await ready.init;
    } catch (e) {
      ready = null;
      return NextResponse.json({ error: 'Could not reach the x402 facilitator.', detail: (e as Error).message }, { status: 502 });
    }
    const { http } = ready;
    const adapter = new NextAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.nextUrl.pathname,
      decodedPath: decodeURIComponent(req.nextUrl.pathname),
      method: req.method,
      paymentHeader: adapter.getHeader('payment-signature') ?? adapter.getHeader('x-payment'),
    };

    let result;
    try {
      result = await http.processHTTPRequest(context);
    } catch (e) {
      return NextResponse.json({ error: 'Payment verification failed.', detail: (e as Error).message }, { status: 502 });
    }
    if (result.type === 'payment-error') return toResponse(result.response);
    if (result.type === 'no-payment-required') return handler(req);

    let res: NextResponse;
    try {
      res = await handler(req);
    } catch (e) {
      await result.cancellationDispatcher.cancel({ reason: 'handler_threw', error: e });
      return NextResponse.json({ error: 'Internal error. Your payment was not settled.' }, { status: 500 });
    }
    if (res.status >= 400) {
      await result.cancellationDispatcher.cancel({ reason: 'handler_failed', responseStatus: res.status });
      return res;
    }
    const body = Buffer.from(await res.arrayBuffer());
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    let settled;
    try {
      settled = await http.processSettlement(
        result.paymentPayload,
        result.paymentRequirements,
        result.declaredExtensions,
        { request: context, responseBody: body, responseHeaders: resHeaders },
        undefined,
        result.beforeHandlerSettlement,
      );
    } catch (e) {
      // Settlement outcome unknown: withhold the paid content rather than give it away unsettled.
      return NextResponse.json({ error: 'Payment could not be settled.', detail: (e as Error).message }, { status: 502 });
    }
    if (!settled.success) return toResponse(settled.response);
    const out = new NextResponse(body, { status: res.status, headers: res.headers });
    for (const [k, v] of Object.entries(settled.headers)) out.headers.set(k, v);
    out.headers.set('cache-control', 'private, no-store');
    return out;
  };
}
