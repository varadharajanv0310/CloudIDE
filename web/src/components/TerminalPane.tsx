import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../api";

/** xterm.js connected to a real /bin/sh inside the project's sandbox container. */
export function TerminalPane({ projectId }: { projectId: number }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: "Consolas, monospace",
      fontSize: 13,
      theme: { background: "#11111b" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    term.writeln("\x1b[90mconnecting to sandbox shell…\x1b[0m");
    const ws = new WebSocket(wsUrl(`/ws/terminal/${projectId}`));
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      term.clear();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (ev) => {
      term.write(
        typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data),
      );
    };
    ws.onclose = () => term.writeln("\r\n\x1b[90m[session ended]\x1b[0m");

    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d);
    });
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });
    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);

    return () => {
      window.removeEventListener("resize", onWinResize);
      dataSub.dispose();
      resizeSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [projectId]);

  return <div className="terminal-wrap" ref={hostRef} />;
}
