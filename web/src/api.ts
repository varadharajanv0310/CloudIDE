export interface Project {
  id: number;
  name: string;
  language: "python" | "node";
  entry_file: string;
}

export interface ProjectFile {
  id: number;
  project_id: number;
  path: string;
  content: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  listProjects: () => fetch("/api/projects").then((r) => json<Project[]>(r)),
  createProject: (name: string, language: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, language }),
    }).then((r) => json<Project>(r)),
  listFiles: (projectId: number) =>
    fetch(`/api/projects/${projectId}/files`).then((r) => json<ProjectFile[]>(r)),
  saveFile: (projectId: number, path: string, content: string) =>
    fetch(`/api/projects/${projectId}/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, content }),
    }).then((r) => json<ProjectFile>(r)),
  deleteFile: (projectId: number, path: string) =>
    fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    }).then((r) => json<{ ok: boolean }>(r)),
};

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
