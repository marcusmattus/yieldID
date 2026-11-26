import 'server-only';
import * as svc from '../agent/service';
import type { AgentKey } from '../agent/store';
import type { Backend } from './backend';

export class InProcessBackend implements Backend {
  constructor(private key: AgentKey) {}
  whoami() {
    return svc.whoami(this.key);
  }
  potStatus() {
    return svc.svcPotStatus(this.key);
  }
  potRates() {
    return svc.svcPotRates(this.key);
  }
  depositAddress() {
    return svc.svcDepositAddress(this.key);
  }
  proposals() {
    return svc.svcProposals(this.key);
  }
  propose(input: Parameters<Backend['propose']>[0]) {
    return svc.svcPropose(this.key, input);
  }
  cards() {
    return svc.svcCards(this.key);
  }
  issueCard(input: Parameters<Backend['issueCard']>[0]) {
    return svc.svcIssueCard(this.key, input);
  }
  updateCard(id: string, patch: Parameters<Backend['updateCard']>[1]) {
    return svc.svcUpdateCard(this.key, id, patch);
  }
  x402Authorize(input: Parameters<Backend['x402Authorize']>[0]) {
    return svc.svcX402Authorize(this.key, input);
  }
  x402Settled(reservationId: string, txSignature: string) {
    return svc.svcX402Settled(this.key, reservationId, txSignature);
  }
  x402Release(reservationId: string) {
    return svc.svcX402Release(this.key, reservationId);
  }
  ledger() {
    return svc.svcLedger(this.key);
  }
}
