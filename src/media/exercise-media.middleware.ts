import express, { type NextFunction, type Request, type Response } from 'express';
import { type RequestHandlerParams } from 'express-serve-static-core';

interface MiddlewareHost {
  use(path: string, ...handlers: RequestHandlerParams[]): unknown;
}

export function registerExerciseMedia(app: MiddlewareHost, assetsDirectory: string) {
  app.use(
    '/media/exercises',
    (_request: Request, response: Response, next: NextFunction) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(assetsDirectory, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );
}
