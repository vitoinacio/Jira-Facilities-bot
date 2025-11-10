import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";

let app: FastifyInstance | null = null;
let isReady = false;

export default async function handler(req: any, res: any) {
  if (!app) {
    app = await buildServer();
  }
  if (!isReady) {
    await app.ready();
    isReady = true;
  }

  app.server.emit("request", req, res);
}
