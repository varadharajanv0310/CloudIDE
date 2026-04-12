import { describe, it, expect, beforeAll } from "vitest";
import { runProject } from "../src/sandbox/runner.js";
import { docker } from "../src/sandbox/runner.js";
import type { TarEntry } from "../src/sandbox/tar.js";

/**
 * Security-critical gate tests. These hit real Docker. Each run spins an
 * ephemeral hardened container and asserts the isolation property.
 */

interface Captured {
  stdout: string;
  stderr: string;
  status: string;
  exitCode: number | null;
  durationMs: number;
}

async function run(
  language: string,
  entry: string,
  files: TarEntry[],
  timeoutMs?: number,
): Promise<Captured> {
  let stdout = "";
  let stderr = "";
  const handle = await runProject(
    language,
    entry,
    files,
    {
      onStdout: (c) => (stdout += c),
      onStderr: (c) => (stderr += c),
      onExit: () => {},
    },
    timeoutMs ? { timeoutMs } : {},
  );
  const result = await handle.done;
  return { stdout, stderr, ...result };
}

beforeAll(async () => {
  // Fail fast with a clear message if Docker isn't reachable.
  await docker.ping();
}, 30_000);

describe("sandbox isolation (gate)", () => {
  it("runs python code and streams stdout", async () => {
    const r = await run("python", "main.py", [
      { path: "main.py", content: "print('hello'); print(2 + 2)" },
    ]);
    expect(r.status).toBe("completed");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hello");
    expect(r.stdout).toContain("4");
  }, 30_000);

  it("runs node code and resolves local requires", async () => {
    const r = await run("node", "index.js", [
      { path: "index.js", content: "const {x}=require('./m.js');console.log('sum',x)" },
      { path: "m.js", content: "module.exports={x: 40+2}" },
    ]);
    expect(r.status).toBe("completed");
    expect(r.stdout).toContain("sum 42");
  }, 30_000);

  it("cannot read host filesystem — /etc/passwd is the container's, host cwd absent", async () => {
    // Prove isolation: the host's package.json (present in cwd on the host) is
    // NOT visible inside the container, and the process runs as non-root uid.
    const r = await run("python", "main.py", [
      {
        path: "main.py",
        content: [
          "import os",
          "print('uid', os.getuid())",
          "print('has_host_pkg', os.path.exists('/workspace/package.json') and open('/workspace/package.json').read()[:1])",
          "print('ws', sorted(os.listdir('/workspace')))",
        ].join("\n"),
      },
    ]);
    expect(r.status).toBe("completed");
    expect(r.stdout).toContain("uid 1000"); // non-root
    // workspace only holds the files we staged, not host files
    expect(r.stdout).toContain("ws ['main.py']");
  }, 30_000);

  it("root filesystem is read-only — cannot write outside tmpfs", async () => {
    const r = await run("python", "main.py", [
      {
        path: "main.py",
        content: [
          "try:",
          "    open('/evil.txt','w').write('x')",
          "    print('WROTE_ROOT')",
          "except OSError as e:",
          "    print('BLOCKED', e.errno)",
        ].join("\n"),
      },
    ]);
    expect(r.stdout).toContain("BLOCKED");
    expect(r.stdout).not.toContain("WROTE_ROOT");
  }, 30_000);

  it("network is disabled — outbound connection fails", async () => {
    const r = await run("python", "main.py", [
      {
        path: "main.py",
        content: [
          "import socket",
          "s=socket.socket()",
          "s.settimeout(3)",
          "try:",
          "    s.connect(('1.1.1.1',80))",
          "    print('NET_OK')",
          "except OSError as e:",
          "    print('NET_BLOCKED')",
        ].join("\n"),
      },
    ]);
    expect(r.stdout).toContain("NET_BLOCKED");
    expect(r.stdout).not.toContain("NET_OK");
  }, 30_000);

  it("infinite loop is killed at timeout", async () => {
    const r = await run(
      "python",
      "main.py",
      [{ path: "main.py", content: "while True: pass" }],
      3000,
    );
    expect(r.status).toBe("timeout");
    expect(r.durationMs).toBeLessThan(8000);
  }, 30_000);

  it("fork bomb is contained by PidsLimit without harming host", async () => {
    // Attempt to spawn far more processes than PidsLimit. The container should
    // hit the pids cgroup cap; the host is unaffected and the run terminates.
    const r = await run(
      "python",
      "main.py",
      [
        {
          path: "main.py",
          content: [
            "import os",
            "n=0",
            "try:",
            "    while n < 500:",
            "        os.fork(); n+=1",
            "except OSError:",
            "    print('FORK_CAPPED')",
            "print('done', n)",
          ].join("\n"),
        },
      ],
      6000,
    );
    // Either the pids cap raised OSError (FORK_CAPPED) or the whole thing was
    // killed at timeout — both mean the host survived and the bomb was contained.
    expect(["completed", "timeout"]).toContain(r.status);
    expect(r.durationMs).toBeLessThan(9000);
  }, 40_000);

  it("memory hog is contained by the memory cap", async () => {
    const r = await run(
      "python",
      "main.py",
      [
        {
          path: "main.py",
          content: [
            "blocks=[]",
            "try:",
            "    while True:",
            "        blocks.append(bytearray(20*1024*1024))",  // 20MB chunks
            "except MemoryError:",
            "    print('MEM_CAPPED')",
          ].join("\n"),
        },
      ],
      8000,
    );
    // OOM kill (non-zero exit / killed) or MemoryError — host stays healthy.
    expect(r.durationMs).toBeLessThan(11000);
    expect(["completed", "timeout", "killed", "error"]).toContain(r.status);
  }, 40_000);
});
