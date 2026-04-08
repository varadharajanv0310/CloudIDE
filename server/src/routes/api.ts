import type { FastifyInstance } from "fastify";
import * as fs from "../services/fileService.js";
import { PathError } from "../services/paths.js";
import { pool } from "../db.js";

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PathError) {
      return reply.status(400).send({ error: err.message });
    }
    app.log.error(err);
    return reply.status(500).send({ error: "internal error" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/projects", async () => fs.listProjects());

  app.post<{ Body: { name: string; language: "python" | "node" } }>(
    "/api/projects",
    async (req, reply) => {
      const { name, language } = req.body;
      if (!name || !["python", "node"].includes(language)) {
        return reply.status(400).send({ error: "name and language (python|node) required" });
      }
      // single-user MVP: owner is the seeded default user
      const { rows } = await pool.query("SELECT id FROM users ORDER BY id LIMIT 1");
      if (rows.length === 0) return reply.status(500).send({ error: "no user seeded" });
      return fs.createProject(rows[0].id, name, language);
    },
  );

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = await fs.getProject(Number(req.params.id));
    if (!project) return reply.status(404).send({ error: "not found" });
    return project;
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req) => {
    await fs.deleteProject(Number(req.params.id));
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/files", async (req) =>
    fs.listFiles(Number(req.params.id)),
  );

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/projects/:id/file",
    async (req, reply) => {
      const file = await fs.getFile(Number(req.params.id), req.query.path);
      if (!file) return reply.status(404).send({ error: "not found" });
      return file;
    },
  );

  app.put<{
    Params: { id: string };
    Body: { path: string; content: string };
  }>("/api/projects/:id/file", async (req) =>
    fs.upsertFile(Number(req.params.id), req.body.path, req.body.content ?? ""),
  );

  app.delete<{ Params: { id: string }; Querystring: { path: string } }>(
    "/api/projects/:id/file",
    async (req) => {
      await fs.deleteFile(Number(req.params.id), req.query.path);
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>("/api/projects/:id/runs", async (req) => {
    const { rows } = await pool.query(
      "SELECT * FROM runs WHERE project_id = $1 ORDER BY id DESC LIMIT 20",
      [Number(req.params.id)],
    );
    return rows;
  });
}
