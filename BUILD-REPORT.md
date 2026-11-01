# BUILD-REPORT — containerport (original: docker)

Built 2026-10-26 for the MCP Rebuild 100 program (Tier C, core
subset). Local only; nothing pushed or published.

## Identity

- npm: `@reneturcios/containerport`, bin `containerport`, version 0.1.0
- Registry name: `io.github.CloudCorpRecords/containerport`
  (matches package.json `mcpName`, server.json `name`, and the
  Dockerfile `io.modelcontextprotocol.server.name` label)
- server.json description: 83 chars (≤100, counted)
- server.json OCI package entry: no `version` field (version only in
  the tagged identifier `ghcr.io/cloudcorprecords/containerport:0.1.0`)

## Subset scope

Defined core subset of 10 container operations mapped to the
Docker CLI. The original in TARGETS is Docker's MCP catalog/toolkit
gateway (docker/mcp-servers); the fixture labels this build as that
defined subset, NOT the gateway surface.

| Tool | Docker CLI |
| --- | --- |
| `list_containers` {all?} | `ps [-a] --format json` |
| `inspect_container` {container_id} | `inspect` |
| `run_container` {image, name?, ports[]?, env[]?, command?} | `run -d` (command via container `sh -c`) |
| `start_container` {container_id} | `start` |
| `stop_container` {container_id} | `stop` |
| `remove_container` {container_id, force?} | `rm [-f]` |
| `list_images` {} | `images --format json` |
| `pull_image` {image} | `pull` |
| `get_container_logs` {container_id, tail?} | `logs [--tail n]` |
| `list_volumes` {} | `volume ls` |

Omitted: compose, build/buildx, network management, swarm,
registry auth, exec-into-container, and all MCP catalog/gateway
tools.

## Implementation

- Every call builds an argument array (never a shell string) and
  runs it through an injectable `ExecutorFn`; the default executor
  spawns the real `docker` binary (no shell), resolving with stdout
  and preserving the underlying error on failure.
- Registered via the low-level MCP `Server` API with explicit
  inputSchema literals; zod validates call arguments.
- No env var required. The runtime container image bundles no
  docker binary (noted in the Dockerfile): a host executor is
  expected.

## Verification (all foreground, verified from disk/output)

- tsc: `npm run build` exit 0; `node dist/cli.js --version` → `0.1.0`;
  unknown command prints Usage and exits 2
- Tests: 12/12 pass (`npm test`, fake executor only — exact argv for
  every tool, `--format json` parsing for ps/images, volume header
  parsing, executor-failure propagation including ENOENT text,
  required-field validation before any executor call)
- Parity: fixture `harness/fixtures/docker-tools-original.json`
  (`_source` labels the defined core subset vs the catalog/gateway
  original) vs live stdio rebuild via `harness/parity.py` →
  `parity_pct == 100.0`, identical 10/10, output in
  `parity-out/parity.json` (verdict PASS)
- Live failure-path stdio check: `docker` is NOT installed in this
  VM (`which docker` empty). Piping initialize + `tools/call
  list_containers {all:true}` into `node dist/cli.js mcp` returned
  `isError: true` with text `spawn docker ENOENT` — the honest
  underlying spawn error, as designed.

## Honest gaps

- No live Docker daemon exists in this VM, so no successful live
  docker operation was run or claimed; behaviour against a real
  daemon is proven only through the fake-executor tests (exact argv
  + output parsing).
- `docker volume ls` has no `--format json` in the mapped operation
  set, so volumes are parsed from the plain table output (header
  skipped); unusual volume names containing spaces would parse
  imperfectly.
- Lockfile flag: `package-lock.json` is a copy of the libdocs-remote
  lockfile with identity fields edited (name, bin). **Clean lockfile
  regeneration (no node_modules present) is required before
  publish** — fleet lesson 2026-10-25.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run (belongs to
  the publish wave, per SCOREBOARD).
