import { createHash, randomBytes } from 'node:crypto';
import type { CardIssuer, IssueCardInput, IssuedCard, ProvisionRequest, ProvisionResponse } from './issuer';

/**
 * Sandbox issuer for development. Cards are records only: no card number
 * exists, nothing can be spent, and the wallet payloads are labelled dummies
 * that Apple Pay and Google Pay will reject. Every card it issues is marked
 * sandbox in the API.
 */
export class SandboxIssuer implements CardIssuer {
  id = 'sandbox';
  sandbox = true;

  async issueVirtualCard(input: IssueCardInput): Promise<IssuedCard> {
    const id = `sbx_${randomBytes(6).toString('hex')}`;
    // Deterministic-looking last4 from the id so screenshots are stable.
    const last4 = String(parseInt(createHash('sha256').update(id).digest('hex').slice(0, 6), 16) % 10_000).padStart(4, '0');
    return {
      issuerCardId: id,
      last4,
      network: 'visa',
      funding: { chain: 'solana', asset: 'USDC', address: input.owner, note: 'Sandbox: would spend USDC from this wallet. Nothing is debited.' },
    };
  }

  async setStatus() {}
  async setLimit() {}

  async provision(_issuerCardId: string, req: ProvisionRequest): Promise<ProvisionResponse> {
    const dummy = (s: string) => Buffer.from(`SANDBOX-NOT-A-REAL-PASS:${s}`).toString('base64');
    if (req.wallet === 'apple_pay') {
      if (!req.certificates?.length || !req.nonce || !req.nonceSignature) throw new Error('Apple Pay provisioning needs certificates, nonce and nonceSignature from the device.');
      return { wallet: 'apple_pay', activationData: dummy('activation'), encryptedPassData: dummy('pass'), ephemeralPublicKey: dummy('epk') };
    }
    if (!req.stableHardwareId || !req.activeWalletId) throw new Error('Google Pay provisioning needs stableHardwareId and activeWalletId from TapAndPay.');
    return { wallet: 'google_pay', opaquePaymentCard: dummy('opc'), network: 'visa', tokenServiceProvider: 'VISA', displayName: 'YieldID Card (sandbox)', lastDigits: '0000' };
  }
}
