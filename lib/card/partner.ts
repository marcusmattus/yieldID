import { IssuerNotConfigured, type CardIssuer } from './issuer';

/**
 * Placeholder for the real issuer. YieldID has not picked one yet, so this
 * refuses every call and says what is missing rather than pretending.
 *
 * To go live, implement CardIssuer against the chosen partner's API:
 *   issueVirtualCard -> create cardholder (KYC done by the partner) + virtual card
 *   setStatus / setLimit -> the partner's card controls
 *   provision -> the partner's Apple Pay in-app and Google Pay push
 *                provisioning endpoints
 *
 * Partners that issue cards spending USDC on Solana include Rain, Bridge
 * (Stripe) and Baanx; Lithic and Marqeta issue cards and leave the stablecoin
 * leg to you. Each needs a program agreement, a BIN sponsor and a KYC flow.
 */
export class PartnerIssuer implements CardIssuer {
  sandbox = false;
  constructor(public id: string) {}

  private fail(): never {
    const key = this.id.toUpperCase();
    throw new IssuerNotConfigured(
      `Card issuer "${this.id}" is not connected yet.`,
      `Implement lib/card/partner.ts for ${this.id} and set CARD_ISSUER_${key}_API_KEY (and the partner's program id). Until then set CARD_ISSUER=sandbox.`,
    );
  }
  async issueVirtualCard(): Promise<never> {
    this.fail();
  }
  async setStatus(): Promise<never> {
    this.fail();
  }
  async setLimit(): Promise<never> {
    this.fail();
  }
  async provision(): Promise<never> {
    this.fail();
  }
}
