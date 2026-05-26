/**
 * Auth interface — @SkipMustChangePasswordCheck() decorator.
 *
 * Used on the change-password endpoint so it bypasses MustChangePasswordGuard
 * while still requiring JWT authentication.
 */

import { SetMetadata } from '@nestjs/common';
import { SKIP_MCP_CHECK_KEY } from './must-change-password.guard';

export const SkipMustChangePasswordCheck = () => SetMetadata(SKIP_MCP_CHECK_KEY, true);
