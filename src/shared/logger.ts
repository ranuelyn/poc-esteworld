import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "esteworld-ai-sales-assistant-poc"
  },
  redact: {
    paths: ["req.headers.authorization", "rawPayload"],
    remove: true
  }
});
