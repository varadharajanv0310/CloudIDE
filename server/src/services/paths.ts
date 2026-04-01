/**
 * Path safety for user-supplied file paths. Files live logically under the
 * sandbox /workspace dir; a hostile path must never escape it (in the tar we
 * build, or in DB lookups).
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export function sanitizeProjectPath(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    throw new PathError(`invalid path: ${JSON.stringify(raw)}`);
  }
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new PathError(`path escapes workspace: ${raw}`);
    }
    if (!SEGMENT_RE.test(seg)) {
      throw new PathError(`illegal characters in path segment: ${seg}`);
    }
  }
  return segments.join("/");
}

export class PathError extends Error {}
