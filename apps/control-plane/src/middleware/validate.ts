import type { NextFunction, Request, Response } from 'express';
import type { z, ZodSchema } from 'zod';

export function validateMiddleware<T extends ZodSchema>(schema: T) {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.body);

    if (!result.success)
      return response.status(400).json({
        success: false,
        message: 'Failed to parse request',
        data: result.error.flatten(),
      });

    request.body = result.data as z.infer<T>;

    next();
  };
}
