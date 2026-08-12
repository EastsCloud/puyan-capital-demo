import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8790),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("isater_session"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(30),
  APP_TIMEZONE: z.string().default("Asia/Hong_Kong"),
  FRED_API_KEY: z.string().trim().optional(),
  EODHD_API_TOKEN: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(8).max(512).optional(),
  ),
  EXTERNAL_CREDENTIAL_ENCRYPTION_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(32).optional(),
  ),
  ENABLE_DEMO_RESET: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SERVE_WEB: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

export const config = environmentSchema.parse({
  ...process.env,
  // Render supplies PORT. API_PORT remains available for local development.
  API_PORT: process.env.PORT ?? process.env.API_PORT,
});
