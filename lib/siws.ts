/**
 * Sign-in-with-Solana message. The text built here is exactly what the wallet
 * shows and exactly what the server verifies, line for line.
 */

export const SIWS_STATEMENT =
  'Sign in to YieldID. This request is a public-key read. It is not a transaction and does not grant an allowance or a delegate on any token account.';

export interface SiwsFields {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: '1';
  chainId: 'mainnet';
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

export function buildSiwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    '',
    f.statement,
    '',
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join('\n');
}

export function parseSiwsMessage(message: string): SiwsFields | null {
  const lines = message.split('\n');
  const head = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? '');
  if (!head || lines.length < 11) return null;
  const field = (label: string) => {
    const line = lines.find((l) => l.startsWith(`${label}: `));
    return line ? line.slice(label.length + 2) : null;
  };
  const uri = field('URI');
  const version = field('Version');
  const chainId = field('Chain ID');
  const nonce = field('Nonce');
  const issuedAt = field('Issued At');
  const expirationTime = field('Expiration Time');
  if (!uri || version !== '1' || chainId !== 'mainnet' || !nonce || !issuedAt || !expirationTime) {
    return null;
  }
  return {
    domain: head[1],
    address: lines[1],
    statement: lines[3],
    uri,
    version: '1',
    chainId,
    nonce,
    issuedAt,
    expirationTime,
  };
}
