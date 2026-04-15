import { createHash } from 'node:crypto';

export type PersonaState = 'LOCKED' | 'UNLOCKED' | 'REVOKED';

export const PERSONA_REASON_MIN_LENGTH = 8;

export function computePersonaHash(input: {
  sourcePlatform: string;
  sourceAgentId?: string | null;
  sourceUsername?: string | null;
  personaSnapshot: string;
}): string {
  const normalized = JSON.stringify({
    sourcePlatform: input.sourcePlatform,
    sourceAgentId: input.sourceAgentId || null,
    sourceUsername: input.sourceUsername || null,
    personaSnapshot: input.personaSnapshot,
  });

  return createHash('sha256').update(normalized).digest('hex');
}

export function canTransitionPersonaState(from: PersonaState, to: PersonaState): boolean {
  if (from === to) return false;
  if (from === 'LOCKED' && to === 'UNLOCKED') return true;
  if (from === 'UNLOCKED' && to === 'LOCKED') return true;
  if ((from === 'LOCKED' || from === 'UNLOCKED') && to === 'REVOKED') return true;
  if (from === 'REVOKED' && to === 'LOCKED') return true; // rebind path
  return false;
}

export function hasValidLifecycleReason(reason: string | null | undefined): boolean {
  return Boolean(reason && reason.trim().length >= PERSONA_REASON_MIN_LENGTH);
}

export function canRebindPersona(status: string, state: PersonaState): boolean {
  return status === 'REVOKED' && state === 'REVOKED';
}
