/**
 * What an agent key may do. A key carries only the scopes its owner ticked.
 * No scope lets an agent sign for the owner's wallet: pot moves come back as
 * proposals the owner signs in the app.
 */
export const SCOPES = {
  'pot:read': 'Read wallet balance, yield pot status, rates and proposals',
  'pot:propose': 'Propose deposits and withdrawals for the owner to sign',
  'x402:pay': "Pay for x402 resources from the agent's own wallet, within the key's caps",
  'card:read': 'List cards and their status',
  'card:manage': 'Issue virtual cards, freeze, unfreeze and change limits',
} as const;

export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];
/** Scopes an exchange or read-only tool should get. */
export const READ_ONLY_SCOPES: Scope[] = ['pot:read', 'card:read'];

export function isScope(s: unknown): s is Scope {
  return typeof s === 'string' && s in SCOPES;
}
