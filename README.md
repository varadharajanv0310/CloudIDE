# D1 — CloudIDE / Replit Clone

A browser-based IDE with **Docker-sandboxed execution** of untrusted code, a real
interactive terminal (PTY) over WebSocket, and **collaborative editing** via Yjs
CRDT. Monaco editor, file tree, live-streamed run output, per-language sandboxes.

## What it is

- **File tree + Monaco editor** — create projects (Python 3.12 / Node 20), edit
  multi-file projects with syntax highlighting.
- **Run in a sandbox** — click Run; code executes in an *ephemeral, hardened*
  Docker container; stdout/stderr stream live to the output panel; the container
  is torn down on exit.
- **Integrated terminal** — a real `/bin/sh` running *inside* the sandbox
  container, piped over WebSocket to xterm.js.
- **Collaboration** — two browsers editing the same file share a Yjs document;
  edits converge with no lost updates, and awareness shows how many peers are on
  the file.

## Run it

```bash
cp .env.example .env
docker compose up --build        # db + server + web, seeds automatically
# → web  http://localhost:5173
# → api  http://localhost:4001
```

`docker compose up` brings up Postgres, the API/execution server, and the Vite
web app from clean. The server is seeded on boot (demo user + a Python and a Node
sample project).

### Local dev (without compose for the app tier)

```bash
npm install
docker compose up -d db          # just Postgres
docker pull python:3.12-alpine && docker pull node:20-alpine
npm run seed
npm run dev                      # server on :4001
npm run dev:web                  # web on :5173 (separate shell)
```

### Scripts

| command | does |
|---|---|
| `npm run setup` | install deps, start db, pull sandbox base images |
| `npm run seed` | create demo user + sample projects |
| `npm run dev` | run the API/execution server |
| `npm run dev:web` | run the Vite web app |
| `npm test` | full test suite (16 tests: sandbox isolation/limits, terminal, CRDT, paths) |
| `npm run verify` | live e2e gate driver against a running server |
| `npm run typecheck` | `tsc --noEmit` on server + web |

## Architecture

```
Browser (React + Monaco + xterm)
  │  REST (files/projects)          ── Fastify ──►  Postgres (projects, files, runs)
  │  WS /ws/run/:id      run+stream ─┐
  │  WS /ws/terminal/:id PTY shell  ─┼─►  Execution service ──►  Docker engine
  │  WS /ws/collab/*     Yjs sync   ─┘        (spawns ephemeral hardened containers)
```

- **Execution service** (`server/src/sandbox/`): on run, create a hardened
  container, stage files into its tmpfs `/workspace`, `exec` the run command with
  demuxed stdout/stderr streamed over WS, kill on timeout, remove on exit.
- **Terminal**: a TTY `exec` of `/bin/sh` in the same hardened container profile.
- **Collab**: `y-websocket` server utilities; room = `<projectId>/<filePath>`, so
  each file is an independent CRDT document. Monaco binds to it via `y-monaco`.

## The hard core: safe sandboxed execution

Untrusted user code runs under this container profile
(`server/src/sandbox/hardening.ts`), and every property below is covered by an
automated test in `server/test/sandbox.test.ts`:

| Property | Mechanism | Test |
|---|---|---|
| **No host filesystem access** | non-root `User 1000:1000`, `ReadonlyRootfs`, only tmpfs `/workspace` + `/tmp`; host cwd never mounted | `cannot read host filesystem` |
| **Read-only root** | `ReadonlyRootfs: true` | `root filesystem is read-only` |
| **No network** | `NetworkMode: none`, `NetworkDisabled` | `network is disabled` |
| **CPU cap** | `NanoCpus` (0.5 CPU) | — |
| **Memory cap** | `Memory` = `MemorySwap` (256MB, swap off) | `memory hog is contained` |
| **Fork-bomb containment** | `PidsLimit` (64) | `fork bomb is contained` |
| **No privilege escalation** | `CapDrop: ALL`, `SecurityOpt: no-new-privileges` | (profile) |
| **Wall-clock cap** | timeout → `container.kill()` | `infinite loop is killed at timeout` |

**Why `writeFilesViaExec` instead of `putArchive`:** with `ReadonlyRootfs`, the
Docker daemon rejects the copy API globally ("rootfs is marked read-only"), even
for a writable tmpfs mount. We instead base64-encode the files and decode them
into the tmpfs through an `exec` — keeping the read-only rootfs guarantee intact.

**Docker-out-of-Docker in compose:** the server container mounts
`/var/run/docker.sock` and spawns *sibling* sandbox containers on the host engine.
The sandboxes retain every isolation property above — the mounted socket is only
the server's control channel, not something user code can reach (network is off).

## CRDT collaboration

Board/file state is a Yjs `Y.Text`. `server/test/crdt.test.ts` proves the gate
property: two (and three) peers making concurrent edits, synced after an offline
split, converge to byte-identical state with every edit preserved.

## Verification gate — all items pass

- [x] `docker compose up` starts db + server + web from clean, seeded.
- [x] Code runs in an isolated container, not the host — host files not readable.
- [x] Resource limits enforced: infinite loop killed at timeout; fork bomb &
      memory hog contained without harming the host.
- [x] Network off by default — outbound connection fails.
- [x] Output streams live during execution (WS `stdout`/`stderr` frames).
- [x] Terminal is a real interactive shell in the sandbox over WS.
- [x] Two clients editing one file converge (CRDT), no lost updates.
- [x] `npm test` green — 16 tests.

Data model: `users`, `projects`, `files (path, content)`, `runs (exit_code,
duration_ms, status)`.

## Project structure

```
CloudIDE/
├── server/
│   ├── src/
│   │   ├── sandbox/       # hardened Docker execution: runner, terminal (PTY), hardening profile, tmpfs file staging
│   │   ├── ws/            # WebSocket endpoints — run (streamed output), terminal, Yjs collab
│   │   ├── services/      # file service + strict path sanitization (no workspace escape)
│   │   ├── routes/        # REST API (projects, files, runs)
│   │   └── migrations/    # Postgres schema
│   ├── scripts/           # verify (live e2e gate) + smoke-run
│   └── test/              # sandbox isolation/limits, terminal, CRDT convergence, path-safety
├── web/                   # React + Monaco editor + xterm.js terminal
└── docker-compose.yml     # db + server + web (server mounts docker.sock — docker-out-of-docker)
```

## Screenshots

> _Placeholder — add a GIF of the editor running code in the sandbox with live output, and a screenshot of the collaborative cursors._
>
> `docs/demo.gif` · `docs/collab.png`

## Roadmap / future improvements

- Package install inside the sandbox (`pip`/`npm`) with a short-lived network window
- More languages (Go, Rust, Java) via additional hardened base images
- Container pooling to shave cold-start latency on `Run`
- Persistent per-project sessions and shareable read-only links
- Server-side syntax/type diagnostics surfaced in Monaco
