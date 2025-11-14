import type { NextFunction, Request, Response } from 'express';
import type { z, ZodSchema } from 'zod';

export function validateMiddleware<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success)
      return res.status(400).json({
        success: false,
        message: 'Failed to parse request',
        data: result.error,
      });

    req.body = result.data as z.infer<T>;

    next();
  };
}
