import { BadRequestException, Body, Param, Query, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request body against a schema from @smto/mc-contracts, so the shape
 * the API accepts and the shape the frontend validates against are the same
 * definition rather than two that drift apart.
 */
class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        error: 'validation_failed',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** `@ZodBody(loginSchema) body: LoginInput` */
export const ZodBody = (schema: ZodType) => Body(new ZodValidationPipe(schema));

/**
 * The same for the query string. Everything in there arrives as a string, so
 * the schema is expected to coerce whatever should not be one.
 */
export const ZodQuery = (schema: ZodType) => Query(new ZodValidationPipe(schema));

/**
 * The same for the route's path parameters, as one object. Validating them
 * together rather than one `@Param('x')` at a time means the error names the
 * parameter (`uuid`, `key`) and a path is normalised in one place.
 */
export const ZodParams = (schema: ZodType) => Param(new ZodValidationPipe(schema));
