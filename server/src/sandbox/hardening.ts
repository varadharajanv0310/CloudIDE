import type Dockerode from "dockerode";
import { config } from "../config.js";

export const LANGUAGE_IMAGES: Record<string, string> = {
  python: "python:3.12-alpine",
  node: "node:20-alpine",
};

export function runCommandFor(language: string, entryFile: string): string[] {
  switch (language) {
    case "python":
      return ["python3", "-u", entryFile];
    case "node":
      return ["node", entryFile];
    default:
      throw new Error(`unsupported language: ${language}`);
  }
}

/**
 * Security profile for every sandbox container. Untrusted code must not be
 * able to (a) touch the host filesystem, (b) reach the network, (c) exhaust
 * host resources, or (d) escalate privileges.
 */
export function hardenedContainerConfig(
  image: string,
): Dockerode.ContainerCreateOptions {
  const memBytes = config.sandbox.memoryMb * 1024 * 1024;
  return {
    Image: image,
    // Keep-alive process; actual work happens via exec so one profile serves
    // both single-shot runs and interactive terminals.
    Cmd: ["sh", "-c", "while true; do sleep 3600; done"],
    WorkingDir: "/workspace",
    User: "1000:1000",
    NetworkDisabled: true,
    HostConfig: {
      NetworkMode: "none",
      Memory: memBytes,
      MemorySwap: memBytes, // = Memory → swap disabled
      NanoCpus: Math.round(config.sandbox.cpu * 1e9),
      PidsLimit: config.sandbox.pidsLimit,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      ReadonlyRootfs: true,
      Tmpfs: {
        "/workspace": "rw,exec,size=64m,uid=1000,gid=1000",
        "/tmp": "rw,exec,size=16m,uid=1000,gid=1000",
      },
      AutoRemove: false,
    },
  };
}
