import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerAdminRoutes } from "./admin.js";
import { loadSession, registerAuthRoutes } from "./auth.js";
import { registerWorkflowRoutes } from "./workflows.js";
import { registerParameterRoutes } from "./parameters.js";
import { registerPortfolioRoutes } from "./portfolio.js";
import { registerPublicDataRoutes } from "./public-data.js";
import { registerTargetReturnRoutes } from "./target-return.js";
import { registerSleeveTargetRoutes } from "./sleeve-targets.js";
import { registerProposedPortfolioRoutes } from "./proposed-portfolio.js";
import { registerBacktestRoutes } from "./backtest.js";
import { registerOptimizationRoutes } from "./optimization.js";
import { registerMonitoringRoutes } from "./monitoring.js";
import { registerReportingRoutes } from "./reporting.js";
import { registerAuditRoutes } from "./audit.js";
import { registerExternalDataRoutes } from "./eodhd.js";
import { registerOperationalRoutes } from "./operations.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    requestIdHeader: "x-request-id",
  });
  await app.register(cookie);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });

  app.decorateRequest("currentUser", null);
  app.decorateRequest("sessionId", null);
  app.addHook("onRequest", loadSession);

  app.addHook("preHandler", async (request) => {
    const publicPaths = new Set([
      "/api/health",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/me",
      "/api/auth/change-password",
    ]);
    if (request.currentUser?.mustChangePassword && !publicPaths.has(request.url.split("?")[0])) {
      const error = new Error("password_change_required") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
  });

  app.get("/api/health", async () => ({ status: "ok", service: "isater-api" }));
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerParameterRoutes(app);
  await registerPortfolioRoutes(app);
  await registerPublicDataRoutes(app);
  await registerTargetReturnRoutes(app);
  await registerSleeveTargetRoutes(app);
  await registerProposedPortfolioRoutes(app);
  await registerBacktestRoutes(app);
  await registerOptimizationRoutes(app);
  await registerMonitoringRoutes(app);
  await registerReportingRoutes(app);
  await registerAuditRoutes(app);
  await registerExternalDataRoutes(app);
  await registerOperationalRoutes(app);
  await registerWorkflowRoutes(app);

  if (config.SERVE_WEB) {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (request.method === "GET" && request.headers.accept?.includes("text/html")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_request", issues: error.issues });
    }
    const knownError = error instanceof Error ? error : new Error("Unknown error");
    const statusCode = "statusCode" in knownError && typeof knownError.statusCode === "number"
      ? knownError.statusCode
      : 500;
    request.log.error(knownError);
    return reply.code(statusCode).send({ error: statusCode === 500 ? "internal_error" : knownError.message });
  });
  return app;
}
