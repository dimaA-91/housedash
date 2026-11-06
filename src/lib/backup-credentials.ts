/**
 * Collect and restore the opt-in credential section of a backup bundle.
 *
 * Every read goes through the owning module's store. A restore never writes here at all: it is planned
 * as transaction changes that the backup route commits with everything else,
 * so a failure anywhere in the restore rolls the credentials back too.
 */

import { readTransactionFile, type TransactionChange } from './data-transaction';
import { readSecrets, isValidSecretKey, type SecretKey } from './secrets';
import { readAuthState, type AuthState } from './auth';
import { isIpAllowed } from './ip-allowlist';
import { logger } from './logger';
import type { CredentialApplyResult, CredentialPayload, CredentialSection } from './backup-credentials-types';

const log = logger('backup-credentials');

/* ─── Collect ─────────────────────────────────── */

function isNonEmpty(obj: Record<string, unknown> | null | undefined): boolean {
  return !!obj && Object.keys(obj).length > 0;
}

/**
 * Read every credential store on this device. A section that holds nothing is
 * omitted entirely, so a bundle from a bare install carries no dead keys.
 */
export async function collectCredentials(): Promise<CredentialPayload> {
  const payload: CredentialPayload = {};

  const secrets = await readSecrets();
  if (isNonEmpty(secrets)) payload.secrets = secrets as Record<string, string>;

  const auth = await readAuthState();
  // An install with no password and no IP rules has nothing worth carrying.
  const authIsInteresting =
    !!auth.passwordHash || !!auth.displayToken || (auth.ipAllowlist?.length ?? 0) > 0;
  if (authIsInteresting) payload.auth = auth;

  return payload;
}

/* ─── Validation ──────────────────────────────── */

function sanitizeSecrets(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<Record<SecretKey, string>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // Unknown keys are dropped rather than rejected: a bundle from a newer
    // version that added a provider should still restore everything else.
    if (isValidSecretKey(key) && typeof value === 'string') out[key] = value;
  }
  return out as Record<string, string>;
}

/** Every field `AuthState` recognizes. Used to tell an auth state from noise. */
const AUTH_STATE_KEYS: readonly (keyof AuthState)[] = [
  'passwordHash',
  'salt',
  'cookieSecret',
  'displayToken',
  'sessionEpoch',
  'ipAllowlist',
  'ipBypassAuth',
  'ipRestrictAccess',
];

/**
 * An auth state is only usable if the password fields agree: a hash with no
 * salt can never be verified, which would lock the user out with no way in
 * short of deleting the file over SSH.
 *
 * The shape check in front matters as much as the hash/salt one. `payload.auth`
 * is untrusted JSON only *typed* as AuthState, and both `{}` and `[]` would
 * otherwise sail through — hash and salt agree at "both absent" — and get
 * written verbatim, destroying cookieSecret, displayToken, sessionEpoch and the
 * IP allowlist in a single write while reporting nothing.
 */
function authStateIsCoherent(auth: AuthState): boolean {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return false;
  if (!AUTH_STATE_KEYS.some((key) => key in auth)) return false;
  const hasHash = typeof auth.passwordHash === 'string' && auth.passwordHash.length > 0;
  const hasSalt = typeof auth.salt === 'string' && auth.salt.length > 0;
  if (hasHash !== hasSalt) return false;
  if (hasHash && !auth.cookieSecret) return false;
  return true;
}

/* ─── Restore ─────────────────────────────────── */

/**
 * Plan the restore of every section present in `payload` as transaction
 * changes; sections absent from the payload are left exactly as they are on
 * disk. Nothing is written here: the backup route commits the changes with the
 * rest of the restore, so the journal rolls the credentials back with it.
 *
 * `clientIp` is where the restore request came from. It feeds the lockout
 * guard: restoring `ipRestrictAccess` from a device that isn't on the restored
 * allowlist would make this hub unreachable, and on a headless Pi the only
 * way back is SSH.
 */
export async function planCredentialRestore(
  payload: CredentialPayload,
  clientIp: string,
): Promise<{ changes: TransactionChange[]; result: CredentialApplyResult }> {
  const changes: TransactionChange[] = [];
  const applied: CredentialSection[] = [];
  const skipped: string[] = [];
  const plan = async (file: string, value: unknown) => {
    changes.push({ path: file, before: await readTransactionFile(file), after: JSON.stringify(value, null, 2), mode: 0o600 });
  };

  if (payload.secrets !== undefined) {
    await plan('data/secrets.json', sanitizeSecrets(payload.secrets));
    applied.push('secrets');
  }

  if (payload.auth !== undefined) {
    const auth = payload.auth;
    if (!auth || typeof auth !== 'object' || !authStateIsCoherent(auth)) {
      skipped.push('auth');
      log.warn('Skipped restoring auth state: password hash and salt disagree');
    } else {
      let next: AuthState = { ...auth };
      if (next.ipRestrictAccess && !(clientIp && isIpAllowed(clientIp, next.ipAllowlist ?? []))) {
        // Keep the allowlist itself so the user can re-enable it after adding
        // this device; only the enforcement switch is held back.
        next = { ...next, ipRestrictAccess: false };
        skipped.push('auth.ipRestrictAccess');
      }
      await plan('data/auth.json', next);
      applied.push('auth');
    }
  }

  return { changes, result: { applied, skipped } };
}
