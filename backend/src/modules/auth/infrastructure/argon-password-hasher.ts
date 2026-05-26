/**
 * Auth infrastructure — ArgonPasswordHasher.
 *
 * Implements PasswordHasherPort using argon2 (already in dependencies).
 * The seeded admin password is argon2-hashed with the same library.
 */

import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasherPort } from '../domain/password-hasher.port';

@Injectable()
export class ArgonPasswordHasher implements PasswordHasherPort {
  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext);
  }

  async compare(plaintext: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      return false;
    }
  }
}
