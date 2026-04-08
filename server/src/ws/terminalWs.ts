import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import * as fsvc from "../services/fileService.js";
import { createTerminalSession, type TerminalSession } from "../sandbox/terminal.js";

/**
 * WS protocol: binary frames = raw terminal I/O.
 * Text frames are JSON control messages: { type: "resize", cols, rows }.
 */
export async function terminalWsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/ws/terminal/:id",
    { websocket: true },
    async (socket: WebSocket, req) => {
      const projectId = Number((req.params as { id: string }).id);
      const project = await fsvc.getProject(projectId);
      if (!project) {
        socket.close(4004, "project not found");
        return;
      }
      const files = await fsvc.listFiles(projectId);

      let session: TerminalSession;
      try {
        session = await createTerminalSession(
          project.language,
          files.map((f) => ({ path: f.path, content: f.content })),
        );
      } catch (err) {
        socket.send(`\r\n[sandbox error] ${(err as Error).message}\r\n`);
        socket.close(4500, "sandbox failed");
        return;
      }

      session.onData((chunk) => {
        if (socket.readyState === socket.OPEN) socket.send(chunk);
      });
      session.onExit(() => {
        if (socket.readyState === socket.OPEN) socket.close(1000, "shell exited");
      });

      socket.on("message", (raw: Buffer, isBinary: boolean) => {
        if (!isBinary) {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "resize") {
              void session.resize(msg.cols, msg.rows);
              return;
            }
          } catch {
            /* fall through: treat as terminal input */
          }
        }
        session.write(raw.toString("utf8"));
      });

      socket.on("close", () => {
        void session.close();
      });
    },
  );
}
