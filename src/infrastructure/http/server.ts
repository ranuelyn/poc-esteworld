import express, { type ErrorRequestHandler } from "express";
import { pinoHttp } from "pino-http";
import type { EnqueueWazzupMessage } from "../../application/use-cases/EnqueueWazzupMessage.js";
import { AppError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { createRoutes } from "./routes.js";

export function createServer(enqueueWazzupMessage: EnqueueWazzupMessage) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: { url?: string }) => req.url === "/health"
      }
    })
  );

  app.use(createRoutes(enqueueWazzupMessage));
  app.use(errorHandler);

  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  logger.error({ err: error }, "Unhandled HTTP error");
  res.status(500).json({
    error: "Internal server error"
  });
};
