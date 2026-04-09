import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import type { editor } from "monaco-editor";
import { wsUrl } from "../api";

interface Props {
  projectId: number;
  path: string;
  language: string;
  initialContent: string;
  onPeersChange: (n: number) => void;
  onContentChange: (content: string) => void;
}

function monacoLanguage(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs"))
    return "javascript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

/**
 * Monaco bound to a shared Yjs document per (project, file) room.
 * The first client into an empty room hydrates it from the saved content.
 */
export function EditorPane({
  projectId,
  path,
  initialContent,
  onPeersChange,
  onContentChange,
}: Props) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const handleMount: OnMount = (ed: editor.IStandaloneCodeEditor) => {
    cleanupRef.current?.();

    const doc = new Y.Doc();
    const room = `${projectId}/${path}`;
    const provider = new WebsocketProvider(wsUrl("/ws/collab"), room, doc);
    const ytext = doc.getText("monaco");

    provider.on("sync", (synced: boolean) => {
      if (synced && ytext.length === 0 && initialContent.length > 0) {
        ytext.insert(0, initialContent);
      }
    });

    provider.awareness.setLocalStateField("user", {
      name: `user-${Math.floor(Math.random() * 1000)}`,
      color: "#89b4fa",
    });
    const updatePeers = () => onPeersChange(provider.awareness.getStates().size);
    provider.awareness.on("change", updatePeers);
    updatePeers();

    const model = ed.getModel()!;
    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([ed]),
      provider.awareness,
    );

    const observer = () => onContentChange(ytext.toString());
    ytext.observe(observer);

    cleanupRef.current = () => {
      ytext.unobserve(observer);
      binding.destroy();
      provider.destroy();
      doc.destroy();
    };
  };

  return (
    <Editor
      key={`${projectId}/${path}`}
      height="100%"
      theme="vs-dark"
      language={monacoLanguage(path)}
      defaultValue=""
      onMount={handleMount}
      options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }}
    />
  );
}
