import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import messagesRoutes from "./routes/messages.js";
import authRoutes from "./routes/auth.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({
    ok: true,
    service: "Jira Facilities Bot",
  }));

  app.register(messagesRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api/auth" });

  return app;
}
