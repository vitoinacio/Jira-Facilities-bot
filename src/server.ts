import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import fastifyRawBody from "fastify-raw-body";

import messagesRoutes from "./routes/messages.js";
import authRoutes from "./routes/auth.js";
import teamsOutgoingRoutes from "./routes/teamsOutgoing.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "Jira Facilities Bot",
  }));

  app.register(messagesRoutes, { prefix: "/api" });
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(teamsOutgoingRoutes, { prefix: "/api" });

  return app;
}
