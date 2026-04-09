import { useCallback, useEffect, useRef, useState } from "react";
import { api, wsUrl, type Project, type ProjectFile } from "./api";
import { EditorPane } from "./components/EditorPane";
import { TerminalPane } from "./components/TerminalPane";

interface OutputLine {
  kind: "stdout" | "stderr" | "meta";
  text: string;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [peers, setPeers] = useState(1);
  const [showNewProject, setShowNewProject] = useState(false);
  const runWs = useRef<WebSocket | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    api.listProjects().then((ps) => {
      setProjects(ps);
      if (ps.length > 0) selectProject(ps[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [output]);

  const selectProject = useCallback(async (p: Project) => {
    runWs.current?.close();
    setProject(p);
    setOutput([]);
    setRunning(false);
    const fl = await api.listFiles(p.id);
    setFiles(fl);
    setActivePath(fl.find((f) => f.path === p.entry_file)?.path ?? fl[0]?.path ?? null);
  }, []);

  const scheduleSave = useCallback(
    (path: string, content: string) => {
      if (!project) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void api.saveFile(project.id, path, content);
        setFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, content } : f)),
        );
      }, 600);
    },
    [project],
  );

  const run = useCallback(() => {
    if (!project || running) return;
    setOutput([{ kind: "meta", text: `$ run ${project.entry_file}\n` }]);
    const ws = new WebSocket(wsUrl(`/ws/run/${project.id}`));
    runWs.current = ws;
    ws.onopen = () => {
      setRunning(true);
      ws.send(JSON.stringify({ type: "run" }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "stdout")
        setOutput((o) => [...o, { kind: "stdout", text: msg.data }]);
      else if (msg.type === "stderr")
        setOutput((o) => [...o, { kind: "stderr", text: msg.data }]);
      else if (msg.type === "exit") {
        setOutput((o) => [
          ...o,
          {
            kind: "meta",
            text: `\n[${msg.status}] exit ${msg.exitCode ?? "—"} in ${msg.durationMs}ms\n`,
          },
        ]);
        setRunning(false);
        ws.close();
      } else if (msg.type === "error") {
        setOutput((o) => [...o, { kind: "stderr", text: `${msg.error}\n` }]);
        setRunning(false);
      }
    };
    ws.onclose = () => setRunning(false);
  }, [project, running]);

  const stop = useCallback(() => {
    runWs.current?.send(JSON.stringify({ type: "stop" }));
  }, []);

  const newFile = useCallback(async () => {
    if (!project) return;
    const path = prompt("New file path (e.g. utils.py):");
    if (!path) return;
    await api.saveFile(project.id, path, "");
    setFiles(await api.listFiles(project.id));
    setActivePath(path);
  }, [project]);

  const removeFile = useCallback(
    async (path: string) => {
      if (!project || !confirm(`Delete ${path}?`)) return;
      await api.deleteFile(project.id, path);
      const fl = await api.listFiles(project.id);
      setFiles(fl);
      if (activePath === path) setActivePath(fl[0]?.path ?? null);
    },
    [project, activePath],
  );

  const activeFile = files.find((f) => f.path === activePath) ?? null;

  return (
    <div className="ide">
      <div className="topbar">
        <span className="logo">◳ D1 IDE</span>
        <select
          value={project?.id ?? ""}
          onChange={(e) => {
            const p = projects.find((x) => x.id === Number(e.target.value));
            if (p) void selectProject(p);
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.language})
            </option>
          ))}
        </select>
        <button onClick={() => setShowNewProject(true)}>+ project</button>
        <button className="run" onClick={run} disabled={!project || running}>
          ▶ Run
        </button>
        <button className="stop" onClick={stop} disabled={!running}>
          ■ Stop
        </button>
        {peers > 1 && <span className="peers">● {peers} editing</span>}
        <span className="status">
          {project ? `sandbox: ${project.language} · no network · 256MB` : "no project"}
        </span>
      </div>

      <div className="main">
        <div className="sidebar">
          <h3>Files</h3>
          <div className="filetree">
            {files.map((f) => (
              <div
                key={f.path}
                className={`file ${f.path === activePath ? "active" : ""}`}
                onClick={() => setActivePath(f.path)}
              >
                <span>{f.path.endsWith(".py") ? "🐍" : "📄"}</span>
                <span>{f.path}</span>
                <button
                  className="del"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeFile(f.path);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="newfile" onClick={newFile}>
            + new file
          </button>
        </div>

        <div className="editor-col">
          <div className="editor-wrap">
            {project && activeFile ? (
              <EditorPane
                projectId={project.id}
                path={activeFile.path}
                language={project.language}
                initialContent={activeFile.content}
                onPeersChange={setPeers}
                onContentChange={(c) => scheduleSave(activeFile.path, c)}
              />
            ) : (
              <div style={{ padding: 24, color: "#9399b2" }}>
                No file selected.
              </div>
            )}
          </div>
          <div className="bottom">
            <div className="panel">
              <div className="panel-title">Output</div>
              <pre className="output" ref={outRef}>
                {output.map((l, i) => (
                  <span key={i} className={l.kind === "stdout" ? "" : l.kind === "stderr" ? "err" : "meta"}>
                    {l.text}
                  </span>
                ))}
              </pre>
            </div>
            <div className="panel">
              <div className="panel-title">Sandbox Terminal</div>
              {project && <TerminalPane key={project.id} projectId={project.id} />}
            </div>
          </div>
        </div>
      </div>

      {showNewProject && (
        <NewProjectDialog
          onClose={() => setShowNewProject(false)}
          onCreate={async (name, language) => {
            const p = await api.createProject(name, language);
            const ps = await api.listProjects();
            setProjects(ps);
            setShowNewProject(false);
            void selectProject(p);
          }}
        />
      )}
    </div>
  );
}

function NewProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, language: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("python");
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <strong>New project</strong>
        <input
          placeholder="project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="python">Python 3.12</option>
          <option value="node">Node 20</option>
        </select>
        <button disabled={!name.trim()} onClick={() => void onCreate(name.trim(), language)}>
          Create
        </button>
      </div>
    </div>
  );
}
