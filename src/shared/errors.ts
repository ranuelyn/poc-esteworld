export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = "ValidationAppError";
  }
}
