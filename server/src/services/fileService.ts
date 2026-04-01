import { pool } from "../db.js";
import { sanitizeProjectPath } from "./paths.js";

export interface ProjectRow {
  id: number;
  owner_id: number;
  name: string;
  language: "python" | "node";
  entry_file: string;
}

export interface FileRow {
  id: number;
  project_id: number;
  path: string;
  content: string;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { rows } = await pool.query(
    "SELECT id, owner_id, name, language, entry_file FROM projects ORDER BY id",
  );
  return rows;
}

export async function getProject(id: number): Promise<ProjectRow | null> {
  const { rows } = await pool.query(
    "SELECT id, owner_id, name, language, entry_file FROM projects WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createProject(
  ownerId: number,
  name: string,
  language: "python" | "node",
): Promise<ProjectRow> {
  const entry = language === "python" ? "main.py" : "index.js";
  const { rows } = await pool.query(
    `INSERT INTO projects (owner_id, name, language, entry_file)
     VALUES ($1, $2, $3, $4)
     RETURNING id, owner_id, name, language, entry_file`,
    [ownerId, name, language, entry],
  );
  const starter =
    language === "python"
      ? 'print("hello from the sandbox")\n'
      : 'console.log("hello from the sandbox");\n';
  await upsertFile(rows[0].id, entry, starter);
  return rows[0];
}

export async function deleteProject(id: number): Promise<void> {
  await pool.query("DELETE FROM projects WHERE id = $1", [id]);
}

export async function listFiles(projectId: number): Promise<FileRow[]> {
  const { rows } = await pool.query(
    "SELECT id, project_id, path, content FROM files WHERE project_id = $1 ORDER BY path",
    [projectId],
  );
  return rows;
}

export async function getFile(
  projectId: number,
  path: string,
): Promise<FileRow | null> {
  const clean = sanitizeProjectPath(path);
  const { rows } = await pool.query(
    "SELECT id, project_id, path, content FROM files WHERE project_id = $1 AND path = $2",
    [projectId, clean],
  );
  return rows[0] ?? null;
}

export async function upsertFile(
  projectId: number,
  path: string,
  content: string,
): Promise<FileRow> {
  const clean = sanitizeProjectPath(path);
  const { rows } = await pool.query(
    `INSERT INTO files (project_id, path, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, path)
     DO UPDATE SET content = EXCLUDED.content, updated_at = now()
     RETURNING id, project_id, path, content`,
    [projectId, clean, content],
  );
  return rows[0];
}

export async function renameFile(
  projectId: number,
  from: string,
  to: string,
): Promise<void> {
  const cleanFrom = sanitizeProjectPath(from);
  const cleanTo = sanitizeProjectPath(to);
  await pool.query(
    "UPDATE files SET path = $3, updated_at = now() WHERE project_id = $1 AND path = $2",
    [projectId, cleanFrom, cleanTo],
  );
}

export async function deleteFile(
  projectId: number,
  path: string,
): Promise<void> {
  const clean = sanitizeProjectPath(path);
  await pool.query("DELETE FROM files WHERE project_id = $1 AND path = $2", [
    projectId,
    clean,
  ]);
}
