/**
 * Auth interface — @Public() decorator.
 *
 * Mark a route as public (no JWT required).
 * AuthGuard checks this metadata and skips verification.
 */

import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.guard';
import { SKIP_MCP_CHECK_KEY } from './must-change-password.guard';

/** Mark a route handler as public — skips AuthGuard AND MustChangePasswordGuard. */
export const Public = () =>
  // Apply both metadata keys so both guards respect the decorator
  (target: object, key: string | symbol, descriptor: PropertyDescriptor) => {
    SetMetadata(IS_PUBLIC_KEY, true)(target, key, descriptor);
    SetMetadata(SKIP_MCP_CHECK_KEY, true)(target, key, descriptor);
    return descriptor;
  };
