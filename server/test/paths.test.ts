import { describe, it, expect } from "vitest";
import { sanitizeProjectPath, PathError } from "../src/services/paths.js";

describe("sanitizeProjectPath", () => {
  it("accepts simple and nested paths", () => {
    expect(sanitizeProjectPath("main.py")).toBe("main.py");
    expect(sanitizeProjectPath("src/utils/helpers.py")).toBe(
      "src/utils/helpers.py",
    );
  });

  it("strips leading slashes", () => {
    expect(sanitizeProjectPath("/main.py")).toBe("main.py");
  });

  it("rejects parent-directory traversal", () => {
    expect(() => sanitizeProjectPath("../etc/passwd")).toThrow(PathError);
    expect(() => sanitizeProjectPath("a/../../b")).toThrow(PathError);
    expect(() => sanitizeProjectPath("..")).toThrow(PathError);
  });

  it("rejects absolute host paths and null bytes", () => {
    expect(() => sanitizeProjectPath("/etc/passwd\0")).toThrow(PathError);
    expect(() => sanitizeProjectPath("a/b\0c")).toThrow(PathError);
  });

  it("rejects illegal characters", () => {
    expect(() => sanitizeProjectPath("a;rm -rf.py")).toThrow(PathError);
    expect(() => sanitizeProjectPath("a b.py")).toThrow(PathError);
    expect(() => sanitizeProjectPath("$(whoami).py")).toThrow(PathError);
  });

  it("rejects empty and over-long paths", () => {
    expect(() => sanitizeProjectPath("")).toThrow(PathError);
    expect(() => sanitizeProjectPath("a".repeat(600))).toThrow(PathError);
  });
});
