/**
 * Auth domain — PasswordHasherPort interface.
 *
 * Abstracts password hashing so application layer has no argon2 dependency.
 */
export interface PasswordHasherPort {
  /** Hash a plaintext password. */
  hash(plaintext: string): Promise<string>;

  /** Verify a plaintext password against a stored hash. Returns true if match. */
  compare(plaintext: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER_PORT = Symbol('PasswordHasherPort');
