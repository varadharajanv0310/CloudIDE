import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import * as fsvc from "../services/fileService.js";
import { runProject, type RunHandle } from "../sandbox/runner.js";
import { pool } from "../db.js";

/**
 * WS protocol (JSON messages):
 *   client → { type: "run" }            start the project's entry file
 *   client → { type: "stop" }           kill the running container
 *   server → { type: "stdout"|"stderr", data }
 *   server → { type: "exit", status, exitCode, durationMs, runId }
 */
export async function runWsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/ws/run/:id",
    { websocket: true },
    (socket: WebSocket, req) => {
      const projectId = Number((req.params as { id: string }).id);
      let handle: RunHandle | null = null;
      let running = false;

      const send = (msg: unknown) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      };

      socket.on("message", async (raw: Buffer) => {
        let msg: { type?: string };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return send({ type: "error", error: "bad message" });
        }

        if (msg.type === "run") {
          if (running) return send({ type: "error", error: "already running" });
          const project = await fsvc.getProject(projectId);
          if (!project) return send({ type: "error", error: "project not found" });
          const files = await fsvc.listFiles(projectId);
          running = true;

          const { rows } = await pool.query(
            "INSERT INTO runs (project_id) VALUES ($1) RETURNING id",
            [projectId],
          );
          const runId: number = rows[0].id;
          send({ type: "started", runId });

          try {
            handle = await runProject(
              project.language,
              project.entry_file,
              files.map((f) => ({ path: f.path, content: f.content })),
              {
                onStdout: (data) => send({ type: "stdout", data }),
                onStderr: (data) => send({ type: "stderr", data }),
                onExit: async (result) => {
                  running = false;
                  send({ type: "exit", runId, ...result });
                  await pool.query(
                    `UPDATE runs SET status = $2, exit_code = $3, duration_ms = $4, finished_at = now() WHERE id = $1`,
                    [runId, result.status, result.exitCode, result.durationMs],
                  );
                },
              },
            );
          } catch (err) {
            running = false;
            send({ type: "error", error: (err as Error).message });
          }
        } else if (msg.type === "stop") {
          await handle?.kill();
        }
      });

      socket.on("close", () => {
        void handle?.kill();
      });
    },
  );
}
