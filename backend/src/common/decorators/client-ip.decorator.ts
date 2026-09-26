import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/request-user';

/**
 * The caller's address, for the audit log. Express resolves this from
 * X-Forwarded-For because main.ts trusts exactly one proxy hop, which is what
 * this stack has.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().ip;
  },
);
