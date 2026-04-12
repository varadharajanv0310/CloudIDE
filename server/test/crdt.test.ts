import { describe, it, expect } from "vitest";
import * as Y from "yjs";

/**
 * CRDT convergence: two clients editing the same document concurrently must
 * converge to identical state with no lost updates. This exercises the same
 * Yjs types the collab WS uses (Y.Text as Monaco binds), simulating an
 * offline split + merge — the worst case for convergence.
 */
describe("Yjs convergence (gate)", () => {
  it("two concurrent editors converge with no lost updates", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("monaco");
    const textB = docB.getText("monaco");

    // shared starting point
    textA.insert(0, "hello world");
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    expect(textB.toString()).toBe("hello world");

    // concurrent edits without seeing each other yet
    textA.insert(0, "A says: "); // prepend on A
    textB.insert(textB.length, " — B appends"); // append on B

    // exchange updates (both directions)
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);

    // convergence: identical final state, both edits preserved
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain("A says: ");
    expect(textA.toString()).toContain("hello world");
    expect(textA.toString()).toContain("B appends");
  });

  it("many concurrent inserts from 3 peers all survive", () => {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const texts = docs.map((d) => d.getText("t"));

    // each peer inserts a distinct marker concurrently
    texts[0].insert(0, "[p0]");
    texts[1].insert(0, "[p1]");
    texts[2].insert(0, "[p2]");

    // full mesh sync until stable
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (i === j) continue;
          Y.applyUpdate(
            docs[j],
            Y.encodeStateAsUpdate(docs[i], Y.encodeStateVector(docs[j])),
          );
        }
      }
    }

    const final = texts[0].toString();
    expect(texts[1].toString()).toBe(final);
    expect(texts[2].toString()).toBe(final);
    // no lost updates: every marker present exactly once
    for (const m of ["[p0]", "[p1]", "[p2]"]) {
      expect(final.split(m).length - 1).toBe(1);
    }
  });
});
