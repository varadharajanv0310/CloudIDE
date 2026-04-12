import type Dockerode from "dockerode";

export interface FileEntry {
  path: string;
  content: string;
}

/**
 * Write project files into the container's tmpfs /workspace.
 *
 * We cannot use Docker's putArchive here: with ReadonlyRootfs the daemon
 * rejects the copy API globally ("rootfs is marked read-only"), even for a
 * writable tmpfs mount. So we stream the files as a base64-encoded shell
 * script through an exec, which decodes them into the tmpfs at runtime. This
 * keeps the read-only rootfs security property intact.
 */
export async function writeFilesViaExec(
  container: Dockerode.Container,
  files: FileEntry[],
): Promise<void> {
  if (files.length === 0) return;

  const parts: string[] = ["set -e"];
  for (const f of files) {
    const b64 = Buffer.from(f.content, "utf8").toString("base64");
    const dir = f.path.includes("/")
      ? f.path.slice(0, f.path.lastIndexOf("/"))
      : "";
    if (dir) parts.push(`mkdir -p '/workspace/${dir}'`);
    // printf the base64 then decode; safe because path segments are sanitized
    parts.push(`printf '%s' '${b64}' | base64 -d > '/workspace/${f.path}'`);
  }
  const script = parts.join("\n");

  const exec = await container.exec({
    Cmd: ["sh", "-c", script],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true });
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("close", resolve);
    stream.on("error", reject);
    stream.resume();
  });
  const info = await exec.inspect();
  if (info.ExitCode && info.ExitCode !== 0) {
    throw new Error(`failed to stage files (exit ${info.ExitCode})`);
  }
}
