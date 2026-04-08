import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { apiRoutes } from "./routes/api.js";
import { runWsRoutes } from "./ws/runWs.js";
import { terminalWsRoutes } from "./ws/terminalWs.js";
import { collabWsRoutes } from "./ws/collabWs.js";

export async function buildServer() {
  const app = Fastify({ logger: { level: "warn" } });
  await app.register(cors, { origin: true });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(apiRoutes);
  await app.register(runWsRoutes);
  await app.register(terminalWsRoutes);
  await app.register(collabWsRoutes);
  return app;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/index.ts");
if (isMain) {
  await migrate();
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[d1] server listening on :${config.port}`);
}
