# containerport

containerport is a small MCP server and CLI for everyday Docker
container work. It is a clean-room rebuild of a defined core subset
of container operations — ten tools that map directly onto the
Docker CLI: list, inspect, run, start, stop and remove containers,
list and pull images, read container logs, and list volumes.

It is deliberately not Docker's MCP catalog/toolkit gateway. There
is no compose support, no image building, no network or swarm
management, no registry authentication, no exec-into-container, and
no catalog/gateway tooling — just the container operations an agent
reaches for most, executed honestly through the host's `docker`
binary.

Every call is built as an argument array and run with `execFile`
semantics — never a shell string — so image names, environment
values and ports cannot be reinterpreted as shell syntax. A
`command` passed to `run-container` runs through the container's own
`sh -c`, not a host shell. The executor is injectable, which is how
the test suite verifies the exact argument arrays with a fake.

The host needs a working `docker` CLI. When docker is absent, calls
fail honestly with the underlying spawn error (ENOENT) instead of a
fabricated result. The published container image bundles no docker
binary: it expects a host executor (for example a mounted Docker
socket workflow) and says so in its Dockerfile.

## Install

```bash
npx @reneturcios/containerport list-containers --all
docker run -i ghcr.io/cloudcorprecords/containerport
```

## CLI

```bash
containerport list-containers [--all]
containerport inspect-container <container_id>
containerport run-container <image> [--name n] [--port 8080:80] [--env KEY=val] [--command "echo hi"]
containerport start-container <container_id>
containerport stop-container <container_id>
containerport remove-container <container_id> [--force]
containerport list-images
containerport pull-image <image>
containerport get-container-logs <container_id> [--tail 100]
containerport list-volumes
containerport --version
```

Exit codes: `0` success, `1` docker error, `2` usage error.

## MCP server

```bash
npx -y @reneturcios/containerport mcp
```

```json
{
  "mcpServers": {
    "containerport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/containerport", "mcp"]
    }
  }
}
```

### Tools

| Tool | Input | What it does |
| --- | --- | --- |
| `list_containers` | `all` (boolean, optional) | `docker ps [--all] --format json`, parsed. |
| `inspect_container` | `container_id` (required) | `docker inspect`, single document. |
| `run_container` | `image` (required), `name`, `ports[]`, `env[]`, `command` | `docker run -d`, returns the new container id. |
| `start_container` | `container_id` (required) | `docker start`. |
| `stop_container` | `container_id` (required) | `docker stop`. |
| `remove_container` | `container_id` (required), `force` | `docker rm [-f]`. |
| `list_images` | — | `docker images --format json`, parsed. |
| `pull_image` | `image` (required) | `docker pull`. |
| `get_container_logs` | `container_id` (required), `tail` | `docker logs [--tail n]`. |
| `list_volumes` | — | `docker volume ls`, parsed driver/name pairs. |

Executor failures — a missing docker binary, a daemon error, a
nonexistent container — are reported as tool errors carrying the
underlying message.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Tests run entirely on a fake executor: exact argument arrays, output
parsing, and error propagation. No live Docker daemon is touched.

## License

MIT — see `LICENSE`.
