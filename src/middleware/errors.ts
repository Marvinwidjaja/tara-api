import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

/** Throw from a route to answer with `{ error: message }` and this status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req) => {
  throw new HttpError(404, `No route for ${req.method} ${req.path}`);
};

/** Turns thrown errors into `{ error }` JSON. Validation errors become one readable sentence. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    res.status(400).json({ error: issue?.message ?? 'Invalid request.' });
    return;
  }
  // Body parser errors (malformed JSON, too large).
  if (typeof err?.status === 'number' && err.status < 500 && err.type) {
    res.status(err.status).json({ error: err.type === 'entity.too.large' ? 'Request body is too large.' : 'Request body must be valid JSON.' });
    return;
  }
  // Postgres: invalid uuid in a path, or a unique constraint we didn't pre-check.
  if (err?.code === '22P02') {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  if (err?.code === '23505') {
    res.status(409).json({ error: 'That already exists.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
};
