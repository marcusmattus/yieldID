/**
 * What the MCP tools call. Two implementations: HTTP (a local MCP server
 * talking to a YieldID deployment with an API key) and in-process (the
 * remote MCP endpoint inside the app). Same tools either way.
 */
export interface Backend {
  whoami(): Promise<unknown>;
  potStatus(): Promise<unknown>;
  potRates(): Promise<unknown>;
  depositAddress(): Promise<unknown>;
  proposals(): Promise<unknown>;
  propose(input: { kind: 'deposit' | 'withdraw'; venueId: string; amountUsdc: number }): Promise<unknown>;
  cards(): Promise<unknown>;
  issueCard(input: { label?: string; spendLimitUsdc: number; limitWindow?: 'per_transaction' | 'daily' | 'monthly' }): Promise<unknown>;
  updateCard(id: string, patch: { status?: 'active' | 'frozen'; spendLimitUsdc?: number; limitWindow?: 'per_transaction' | 'daily' | 'monthly' }): Promise<unknown>;
  x402Authorize(input: { amountMicro: string; payTo: string; resource: string; network: string; asset: string }): Promise<{ ok: boolean; reservationId?: string; reason?: string; fix?: string; checks?: unknown }>;
  x402Settled(reservationId: string, txSignature: string): Promise<unknown>;
  x402Release(reservationId: string): Promise<unknown>;
  ledger(): Promise<unknown>;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public fix?: string,
    public status?: number,
  ) {
    super(message);
  }
}

export class HttpBackend implements Backend {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T = unknown>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; fix?: string };
    if (!res.ok && !okStatuses.includes(res.status)) throw new BackendError(json.reason ?? `YieldID API returned ${res.status}`, json.fix, res.status);
    return json as T;
  }

  whoami() {
    return this.call('GET', '/api/agent/me');
  }
  potStatus() {
    return this.call('GET', '/api/agent/pot');
  }
  potRates() {
    return this.call('GET', '/api/agent/pot/rates');
  }
  depositAddress() {
    return this.call('GET', '/api/agent/pot/deposit-address');
  }
  proposals() {
    return this.call('GET', '/api/agent/pot/proposals');
  }
  propose(input: Parameters<Backend['propose']>[0]) {
    return this.call('POST', '/api/agent/pot/proposals', input);
  }
  cards() {
    return this.call('GET', '/api/agent/cards');
  }
  issueCard(input: Parameters<Backend['issueCard']>[0]) {
    return this.call('POST', '/api/agent/cards', input);
  }
  updateCard(id: string, patch: Parameters<Backend['updateCard']>[1]) {
    return this.call('PATCH', `/api/agent/cards/${encodeURIComponent(id)}`, patch);
  }
  x402Authorize(input: Parameters<Backend['x402Authorize']>[0]) {
    // 403 carries the failed checks; return it rather than throw.
    return this.call<Awaited<ReturnType<Backend['x402Authorize']>>>('POST', '/api/agent/x402/authorize', input, [403]);
  }
  x402Settled(reservationId: string, txSignature: string) {
    return this.call('POST', '/api/agent/x402/settled', { reservationId, txSignature });
  }
  x402Release(reservationId: string) {
    return this.call('POST', '/api/agent/x402/release', { reservationId });
  }
  ledger() {
    return this.call('GET', '/api/agent/x402/ledger');
  }
}
