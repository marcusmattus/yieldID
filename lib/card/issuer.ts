/**
 * A card issuer: the regulated partner that issues a Visa or Mastercard
 * funded by the owner's stablecoins, and that can push it into Apple Pay or
 * Google Pay.
 *
 * YieldID never sees a full card number. Push provisioning is a hand-off:
 * the owner's phone asks Apple or Google for certificates and a nonce, our
 * server passes them to the issuer, and the issuer returns an encrypted
 * payload only the wallet can open.
 */

export type CardNetwork = 'visa' | 'mastercard';
export type LimitWindow = 'per_transaction' | 'daily' | 'monthly';

export interface IssueCardInput {
  /** Solana address of the owner. Also the funding wallet for the card. */
  owner: string;
  label: string;
  spendLimitMicro: bigint;
  limitWindow: LimitWindow;
}

export interface IssuedCard {
  issuerCardId: string;
  last4: string;
  network: CardNetwork;
  /**
   * Where USDC must sit for the card to spend it, when the issuer uses a
   * collateral or funding account rather than spending from the wallet.
   */
  funding: { chain: 'solana'; asset: 'USDC'; address: string; note: string };
}

/** From PKAddPaymentPassViewControllerDelegate on iOS. All base64. */
export interface ApplePayProvisionRequest {
  wallet: 'apple_pay';
  certificates: string[];
  nonce: string;
  nonceSignature: string;
}

/** For PKAddPaymentPassRequest. All base64. */
export interface ApplePayProvisionResponse {
  wallet: 'apple_pay';
  activationData: string;
  encryptedPassData: string;
  ephemeralPublicKey: string;
}

/** Inputs for TapAndPay pushTokenize on Android. */
export interface GooglePayProvisionRequest {
  wallet: 'google_pay';
  /** From TapAndPay getStableHardwareId. */
  stableHardwareId: string;
  /** From TapAndPay getActiveWalletId. */
  activeWalletId: string;
}

export interface GooglePayProvisionResponse {
  wallet: 'google_pay';
  /** Opaque Payment Card, base64, passed straight to pushTokenize. */
  opaquePaymentCard: string;
  network: CardNetwork;
  tokenServiceProvider: 'VISA' | 'MASTERCARD';
  displayName: string;
  lastDigits: string;
}

export type ProvisionRequest = ApplePayProvisionRequest | GooglePayProvisionRequest;
export type ProvisionResponse = ApplePayProvisionResponse | GooglePayProvisionResponse;

export interface CardIssuer {
  /** Short id stored on each card, e.g. "sandbox", "rain", "bridge". */
  id: string;
  sandbox: boolean;
  issueVirtualCard(input: IssueCardInput): Promise<IssuedCard>;
  setStatus(issuerCardId: string, status: 'active' | 'frozen' | 'closed'): Promise<void>;
  setLimit(issuerCardId: string, spendLimitMicro: bigint, window: LimitWindow): Promise<void>;
  provision(issuerCardId: string, req: ProvisionRequest): Promise<ProvisionResponse>;
}

export class IssuerNotConfigured extends Error {
  constructor(
    message: string,
    public fix: string,
  ) {
    super(message);
  }
}
