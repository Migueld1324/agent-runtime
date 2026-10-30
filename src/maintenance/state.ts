import {type State, type MaintenanceResult, fail} from './contracts.ts';

export const TRANSITIONS: Readonly<Record<State, readonly State[]>> = Object.freeze({
  CLOSED: Object.freeze(['NORMAL'] as State[]),
  NORMAL: Object.freeze(['CLOSING'] as State[]),
  CLOSING: Object.freeze(['QUIESCENT', 'QUARANTINED'] as State[]),
  QUIESCENT: Object.freeze(['PREPARED', 'QUARANTINED'] as State[]),
  PREPARED: Object.freeze(['PUBLISHING', 'QUARANTINED'] as State[]),
  PUBLISHING: Object.freeze(['VERIFIED', 'QUARANTINED'] as State[]),
  VERIFIED: Object.freeze(['CLOSED', 'QUARANTINED'] as State[]),
  QUARANTINED: Object.freeze(['CLOSED'] as State[]),
});
export type Check = 'confirmed' | 'denied' | 'unknown';
export type Checks = Partial<Record<
  'authorized' | 'generation' | 'intentDurable' | 'admissionClosed' | 'accessRevoked' |
  'quiescence' | 'runtimeLock' | 'planValid' | 'backupDurable' | 'preparedDurable' |
  'resultDurable' | 'destinationVerified' | 'publisherRetired' | 'handlesClosed' |
  'lockReleased' | 'closureDurable' | 'compatibleExecutors' | 'recoveryVerified' | 'inventoryValid', Check>>;
const required: Record<State, readonly (keyof Checks)[]> = {
  NORMAL: ['authorized', 'generation', 'inventoryValid', 'publisherRetired', 'handlesClosed', 'lockReleased', 'closureDurable', 'compatibleExecutors'],
  CLOSING: ['authorized', 'generation', 'intentDurable', 'admissionClosed'],
  QUIESCENT: ['admissionClosed', 'accessRevoked', 'quiescence', 'runtimeLock'],
  PREPARED: ['admissionClosed', 'planValid', 'backupDurable', 'preparedDurable'],
  PUBLISHING: ['authorized', 'generation', 'admissionClosed', 'planValid', 'preparedDurable'],
  VERIFIED: ['admissionClosed', 'destinationVerified', 'resultDurable'],
  CLOSED: ['publisherRetired', 'handlesClosed', 'lockReleased', 'closureDurable'],
  QUARANTINED: [],
};
/** Pure decision model only. Checks are supplied by trusted adapters in M2–M4;
 * accepting this transition is NOT evidence of OS isolation or an actuator. */
export function transition(state: State, next: State, checks: Checks): State {
  if (!Object.hasOwn(TRANSITIONS, state) || !TRANSITIONS[state].includes(next)) fail('maintenance_evidence_insufficient');
  const needs = state === 'QUARANTINED' ? [...required[next], 'authorized', 'generation', 'recoveryVerified'] : required[next];
  if (needs.some(key => checks[key as keyof Checks] !== 'confirmed')) fail('maintenance_evidence_insufficient');
  return next;
}
export function bootState(_historicalState: unknown): State { return 'CLOSED'; }
export function interrupted(state: State, _cause: 'cancel' | 'authority_lost' | 'storage_failed' | 'unknown'): State {
  return state === 'CLOSED' ? 'CLOSED' : 'QUARANTINED';
}

export interface RecoveryFacts {
  previousPublisherRetired: Check;
  exclusiveAccess: Check;
  identityAndGeneration: Check;
  inventoryValid: Check;
  intentDurable: Check;
  backupValid: Check;
  stagingCoherent: Check;
  preparedDurable: Check;
  destinationSynced: Check;
  terminalRuns: Check;
  active: 'source' | 'destination' | 'unexpected' | 'unknown';
  recorded: 'none' | 'applied' | 'not_applied' | 'unknown';
}
export interface RecoveryDecision {
  outcome: MaintenanceResult['outcome'];
  state: 'QUARANTINED' | 'CLOSED';
  needsDurableRecord: boolean;
  publish: false;
  reopen: false;
}
/** A recommendation to persist evidence, not a recovered result or permission. */
export function reconcile(f: RecoveryFacts): RecoveryDecision {
  const decision = (outcome: MaintenanceResult['outcome'], needsDurableRecord = false): RecoveryDecision =>
    ({outcome, state: 'QUARANTINED', needsDurableRecord, publish: false, reopen: false});
  if ([f.previousPublisherRetired, f.exclusiveAccess, f.identityAndGeneration, f.inventoryValid,
       f.intentDurable, f.backupValid].some(v => v !== 'confirmed')) return decision('indeterminate');
  if (f.terminalRuns !== 'confirmed') return decision('rejected');
  if (f.active === 'source' && (f.recorded === 'none' || f.recorded === 'not_applied') && f.stagingCoherent === 'confirmed') return decision('not_applied', true);
  if (f.active === 'destination' && f.preparedDurable === 'confirmed' && f.destinationSynced === 'confirmed') {
    if (f.recorded === 'applied') return decision('already_applied');
    if (f.recorded === 'none') return decision('applied', true);
  }
  return decision('indeterminate');
}
