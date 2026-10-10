// Errors that map to a specific HTTP response. Anything else thrown becomes a 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message: string) => new AppError(401, "UNAUTHORIZED", message);
