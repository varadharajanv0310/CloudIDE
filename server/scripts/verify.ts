/**
 * End-to-end gate driver. Assumes the server is reachable at PORT (default
 * 4001) and Docker is available. Exercises the live WS run + terminal paths
 * and prints a pass/fail line per gate item. Exit 0 only if all pass.
 */
import WebSocket from "ws";
import { config } from "../src/config.js";

const BASE = `http://localhost:${config.port}`;
const WS = `ws://localhost:${config.port}`;
const results: Array<[string, boolean, string]> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function liveRun(projectId: number): Promise<{ out: string; status: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws/run/${projectId}`);
    let out = "";
    const t0 = Date.now();
    ws.on("open", () => ws.send(JSON.stringify({ type: "run" })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "stdout" || m.type === "stderr") out += m.data;
      if (m.type === "exit") {
        ws.close();
        resolve({ out, status: m.status, ms: Date.now() - t0 });
      }
      if (m.type === "error") {
        ws.close();
        reject(new Error(m.error));
      }
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("run timed out")), 30000);
  });
}

async function main() {
  // 1. server + projects reachable
  const health = (await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch(() => null)) as { ok?: boolean } | null;
  check("server reachable", health?.ok === true);

  const projects = (await fetch(`${BASE}/api/projects`).then((r) => r.json())) as Array<{
    id: number;
    language: string;
  }>;
  const py = projects.find((p) => p.language === "python");
  const node = projects.find((p) => p.language === "node");
  check("seeded projects present", !!py && !!node, `${projects.length} projects`);

  // 2. live sandboxed run streams output
  if (py) {
    const r = await liveRun(py.id);
    check("python runs in sandbox with streamed output", r.status === "completed" && r.out.includes("FizzBuzz"), `${r.ms}ms`);
  }
  if (node) {
    const r = await liveRun(node.id);
    check("node runs in sandbox with local requires", r.status === "completed" && r.out.includes("primes"), `${r.ms}ms`);
  }

  // 3. terminal WS connects and is a live shell
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`${WS}/ws/terminal/${py?.id ?? 1}`);
    let buf = "";
    ws.on("open", () => setTimeout(() => ws.send("echo VERIFY_SHELL\n"), 300));
    ws.on("message", (d) => {
      buf += d.toString();
      if (buf.includes("VERIFY_SHELL")) {
        check("terminal is a live interactive shell over WS", true);
        ws.close();
        resolve();
      }
    });
    ws.on("error", () => { check("terminal is a live interactive shell over WS", false); resolve(); });
    setTimeout(() => {
      if (!buf.includes("VERIFY_SHELL")) check("terminal is a live interactive shell over WS", false, "no echo");
      ws.close();
      resolve();
    }, 8000);
  });

  const allPass = results.every((r) => r[1]);
  console.log(`\n${results.filter((r) => r[1]).length}/${results.length} live gate checks passed`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("verify error:", e.message);
  process.exit(1);
});
