import type { Duplex } from "node:stream";
import { docker } from "./runner.js";
import { hardenedContainerConfig, LANGUAGE_IMAGES } from "./hardening.js";
import type { TarEntry } from "./tar.js";
import { writeFilesViaExec } from "./writeFiles.js";

export interface TerminalSession {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => Promise<void>;
  onData: (cb: (chunk: Buffer) => void) => void;
  onExit: (cb: () => void) => void;
}

/**
 * Interactive shell inside a hardened sandbox container: the container's TTY
 * (via exec Tty=true) is the PTY; we pipe it over the caller's WebSocket.
 * Same security profile as single-shot runs.
 */
export async function createTerminalSession(
  language: string,
  files: TarEntry[],
): Promise<TerminalSession> {
  const image = LANGUAGE_IMAGES[language] ?? LANGUAGE_IMAGES.python;
  const container = await docker.createContainer(hardenedContainerConfig(image));
  await container.start();
  await writeFilesViaExec(container, files);

  const exec = await container.exec({
    Cmd: ["/bin/sh"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: "/workspace",
    Env: ["PS1=sandbox$ ", "TERM=xterm-256color"],
  });
  const stream = (await exec.start({
    hijack: true,
    stdin: true,
    Tty: true,
  })) as Duplex;

  const dataCbs: Array<(chunk: Buffer) => void> = [];
  const exitCbs: Array<() => void> = [];
  stream.on("data", (c: Buffer) => dataCbs.forEach((cb) => cb(c)));
  const fireExit = () => exitCbs.forEach((cb) => cb());
  stream.on("end", fireExit);
  stream.on("close", fireExit);

  let closed = false;
  return {
    write: (data) => stream.write(data),
    resize: async (cols, rows) => {
      try {
        await exec.resize({ w: cols, h: rows });
      } catch {
        /* session ending */
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        stream.destroy();
      } catch {
        /* noop */
      }
      try {
        await container.remove({ force: true });
      } catch {
        /* already gone */
      }
    },
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => exitCbs.push(cb),
  };
}
