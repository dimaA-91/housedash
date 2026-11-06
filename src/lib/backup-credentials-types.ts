/**
 * Wire types for the opt-in credential section of a backup bundle.
 *
 * Kept in their own module (with type-only imports) so the editor can import
 * `CredentialEnvelope` without pulling `auth.ts` or anything else server-side
 * into the client bundle.
 */

import type { AuthState } from './auth';

/**
 * Everything an opt-in credential backup can carry. A section absent from a bundle is
 * left untouched on restore; empty sections are omitted when exporting.
 * Older backups may carry iCloud, OAuth or plugin sections from Home Screens; those are ignored.
 */
export interface CredentialPayload {
  /** data/secrets.json: API keys. */
  secrets?: Record<string, string>;
  /** data/auth.json: login password hash, cookie secret, IP rules. */
  auth?: AuthState;
}

/** The keys of CredentialPayload, in a stable order for counting/reporting. */
export const CREDENTIAL_SECTIONS = ['secrets', 'auth'] as const satisfies readonly (keyof CredentialPayload)[];

export type CredentialSection = (typeof CREDENTIAL_SECTIONS)[number];

/** scrypt parameters, carried in the envelope so a future tuning stays readable. */
export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keylen: 32;
}

export interface PlaintextCredentialEnvelope {
  encrypted: false;
  data: CredentialPayload;
}

export interface EncryptedCredentialEnvelope {
  encrypted: true;
  kdf: 'scrypt';
  kdfParams: ScryptParams;
  /** base64, 16 bytes */
  salt: string;
  /** base64, 12 bytes */
  iv: string;
  /** base64, AES-GCM authentication tag */
  tag: string;
  /** base64, AES-256-GCM over JSON.stringify(CredentialPayload) */
  ciphertext: string;
}

export type CredentialEnvelope =
  | PlaintextCredentialEnvelope
  | EncryptedCredentialEnvelope;

/** Narrowing guard usable from both client and server. */
export function isEncryptedEnvelope(
  envelope: unknown,
): envelope is EncryptedCredentialEnvelope {
  return (
    !!envelope &&
    typeof envelope === 'object' &&
    (envelope as EncryptedCredentialEnvelope).encrypted === true
  );
}

/** Shape check for anything claiming to be an envelope, before we act on it. */
export function isCredentialEnvelope(
  envelope: unknown,
): envelope is CredentialEnvelope {
  if (!envelope || typeof envelope !== 'object') return false;
  // Not `Partial<Encrypted & Plaintext>` — the two `encrypted` literal types
  // intersect to `never`, which collapses the whole shape.
  const e = envelope as {
    encrypted?: unknown;
    kdf?: unknown;
    kdfParams?: unknown;
    salt?: unknown;
    iv?: unknown;
    tag?: unknown;
    ciphertext?: unknown;
    data?: unknown;
  };
  if (e.encrypted === true) {
    return (
      e.kdf === 'scrypt' &&
      !!e.kdfParams &&
      typeof e.salt === 'string' &&
      typeof e.iv === 'string' &&
      typeof e.tag === 'string' &&
      typeof e.ciphertext === 'string'
    );
  }
  if (e.encrypted === false) {
    return !!e.data && typeof e.data === 'object';
  }
  return false;
}

/** Shortest passphrase we accept. Enforced in the API and mirrored in the UI. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Result of applying a credential payload during a restore. */
export interface CredentialApplyResult {
  /** Sections that were present in the bundle and written to disk. */
  applied: CredentialSection[];
  /**
   * Field paths deliberately not applied for safety, e.g.
   * `auth.ipRestrictAccess` when restoring it would lock this device out.
   */
  skipped: string[];
}
