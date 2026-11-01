# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- MCP server (`containerport mcp`, stdio) and CLI with ten tools:
  `list_containers`, `inspect_container`, `run_container`,
  `start_container`, `stop_container`, `remove_container`,
  `list_images`, `pull_image`, `get_container_logs`, `list_volumes`.
- Defined core subset of Docker container operations mapped to the
  Docker CLI. This is not the Docker MCP catalog/toolkit gateway:
  compose, build/buildx, networks, swarm, registry auth,
  exec-into-container and catalog/gateway tools are omitted.
- All Docker access goes through an injectable executor running
  argument arrays via `execFile` (never shell strings); a missing
  docker binary surfaces as an honest spawn ENOENT tool error.
- Tests run on a fake executor only — no live Docker daemon.
