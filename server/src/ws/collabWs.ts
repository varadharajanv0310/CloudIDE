import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { createRequire } from "node:module";

// y-websocket's server utilities are CJS-only.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setupWSConnection } = require("y-websocket/bin/utils") as {
  setupWSConnection: (
    conn: WebSocket,
    req: unknown,
    opts?: { docName?: string; gc?: boolean },
  ) => void;
};

/**
 * Yjs sync endpoint. Room name = "<projectId>/<filePath>" so each file is an
 * independent CRDT document. Docs are held in memory by y-websocket; the
 * source of truth for persistence stays the REST save path.
 */
export async function collabWsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { "*": string } }>(
    "/ws/collab/*",
    { websocket: true },
    (socket: WebSocket, req) => {
      const room = (req.params as Record<string, string>)["*"] || "default";
      setupWSConnection(socket, req.raw, { docName: room, gc: true });
    },
  );
}
