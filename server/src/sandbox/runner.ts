import Dockerode from "dockerode";
import { PassThrough } from "node:stream";
import {
  hardenedContainerConfig,
  LANGUAGE_IMAGES,
  runCommandFor,
} from "./hardening.js";
import { buildTar, type TarEntry } from "./tar.js";
import { config } from "../config.js";

export const docker = new Dockerode(); // auto-detects npipe on Windows, socket elsewhere

export interface RunEvents {
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
  onExit: (result: RunResult) => void;
}

export interface RunResult {
  status: "completed" | "timeout" | "error" | "killed";
  exitCode: number | null;
  durationMs: number;
}

export interface RunHandle {
  kill: () => Promise<void>;
  done: Promise<RunResult>;
}

/**
 * Execute untrusted project code in an ephemeral hardened container.
 * Lifecycle: create → start (idle keep-alive) → putArchive files into the
 * tmpfs workspace → exec the run command with streamed output → remove.
 */
export async function runProject(
  language: string,
  entryFile: string,
  files: TarEntry[],
  events: RunEvents,
  opts: { timeoutMs?: number; command?: string[] } = {},
): Promise<RunHandle> {
  const image = LANGUAGE_IMAGES[language];
  if (!image) throw new Error(`unsupported language: ${language}`);
  const timeoutMs = opts.timeoutMs ?? config.sandbox.timeoutMs;

  const container = await docker.createContainer(hardenedContainerConfig(image));
  const started = Date.now();
  let settled = false;
  let timedOut = false;
  let killed = false;

  const cleanup = async () => {
    try {
      await container.remove({ force: true });
    } catch {
      /* already gone */
    }
  };

  const done = (async (): Promise<RunResult> => {
    try {
      await container.start();
      await container.putArchive(await buildTar(files), { path: "/workspace" });

      const exec = await container.exec({
        Cmd: opts.command ?? runCommandFor(language, entryFile),
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: "/workspace",
      });
      const stream = await exec.start({ hijack: true });

      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.on("data", (c: Buffer) => events.onStdout(c.toString("utf8")));
      stderr.on("data", (c: Buffer) => events.onStderr(c.toString("utf8")));
      docker.modem.demuxStream(stream, stdout, stderr);

      const timer = setTimeout(async () => {
        timedOut = true;
        try {
          await container.kill();
        } catch {
          /* raced with normal exit */
        }
      }, timeoutMs);

      await new Promise<void>((resolve) => {
        stream.on("end", resolve);
        stream.on("close", resolve);
        stream.on("error", resolve);
      });
      clearTimeout(timer);

      let exitCode: number | null = null;
      try {
        const info = await exec.inspect();
        exitCode = info.ExitCode ?? null;
      } catch {
        /* container force-removed */
      }

      const durationMs = Date.now() - started;
      const status: RunResult["status"] = timedOut
        ? "timeout"
        : killed
          ? "killed"
          : "completed";
      const result: RunResult = { status, exitCode, durationMs };
      settled = true;
      events.onExit(result);
      return result;
    } catch (err) {
      const result: RunResult = {
        status: "error",
        exitCode: null,
        durationMs: Date.now() - started,
      };
      if (!settled) {
        settled = true;
        events.onStderr(`sandbox error: ${(err as Error).message}\n`);
        events.onExit(result);
      }
      return result;
    } finally {
      await cleanup();
    }
  })();

  return {
    kill: async () => {
      killed = true;
      try {
        await container.kill();
      } catch {
        /* already stopped */
      }
    },
    done,
  };
}
