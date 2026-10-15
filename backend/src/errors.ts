// Errors that map to a specific HTTP response. Anything else thrown becomes a 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    // Extra machine-readable context for the app, e.g. { tripId } on TRIP_IN_PROGRESS.
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const unauthorized = (message: string) => new AppError(401, "UNAUTHORIZED", message);
