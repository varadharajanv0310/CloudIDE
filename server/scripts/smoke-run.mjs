import WebSocket from "ws";

const projectId = process.argv[2] ?? "1";
const ws = new WebSocket(`ws://localhost:4001/ws/run/${projectId}`);
const t0 = Date.now();
ws.on("open", () => ws.send(JSON.stringify({ type: "run" })));
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "stdout") process.stdout.write(`[out +${Date.now() - t0}ms] ${msg.data}`);
  else if (msg.type === "stderr") process.stdout.write(`[err] ${msg.data}`);
  else console.log(`[${msg.type} +${Date.now() - t0}ms]`, JSON.stringify(msg));
  if (msg.type === "exit" || msg.type === "error") ws.close();
});
ws.on("close", () => { clearTimeout(_t); });
ws.on("error", (e) => { console.error("WS error:", e.message); process.exit(1); });
const _t = setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 60000);
