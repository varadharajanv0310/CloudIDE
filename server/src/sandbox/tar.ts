import { pack } from "tar-stream";

export interface TarEntry {
  path: string;
  content: string;
}

/** Build an in-memory tar of project files for Container.putArchive. */
export function buildTar(entries: TarEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = pack();
    const chunks: Buffer[] = [];
    p.on("data", (c: Buffer) => chunks.push(c));
    p.on("end", () => resolve(Buffer.concat(chunks)));
    p.on("error", reject);
    for (const e of entries) {
      p.entry(
        { name: e.path, mode: 0o644, uid: 1000, gid: 1000 },
        e.content,
      );
    }
    p.finalize();
  });
}
