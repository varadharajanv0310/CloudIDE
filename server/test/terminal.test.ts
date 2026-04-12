import { describe, it, expect, beforeAll } from "vitest";
import { createTerminalSession } from "../src/sandbox/terminal.js";
import { docker } from "../src/sandbox/runner.js";

beforeAll(async () => {
  await docker.ping();
}, 30_000);

/** The integrated terminal is a real interactive shell inside the sandbox. */
describe("sandbox terminal (gate)", () => {
  it("is a real shell — commands execute and staged files are present", async () => {
    const session = await createTerminalSession("python", [
      { path: "hello.txt", content: "from the sandbox" },
    ]);
    let buf = "";
    session.onData((c) => (buf += c.toString("utf8")));

    // interactive commands
    session.write("echo TERM_ALIVE\n");
    session.write("ls\n");
    session.write("cat hello.txt\n");
    session.write("id -u\n");
    session.write("exit\n");

    await new Promise<void>((resolve) => {
      session.onExit(resolve);
      setTimeout(resolve, 5000);
    });
    await session.close();

    expect(buf).toContain("TERM_ALIVE");
    expect(buf).toContain("hello.txt");
    expect(buf).toContain("from the sandbox");
    expect(buf).toContain("1000"); // non-root uid echoed by `id -u`
  }, 30_000);
});
