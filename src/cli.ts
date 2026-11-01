#!/usr/bin/env node
/**
 * containerport CLI. One subcommand per MCP tool, plus `mcp`.
 *   containerport list-containers [--all]
 *   containerport inspect-container <container_id>
 *   containerport run-container <image> [--name n] [--port p]... [--env e]... [--command c]
 *   containerport start-container <container_id>
 *   containerport stop-container <container_id>
 *   containerport remove-container <container_id> [--force]
 *   containerport list-images
 *   containerport pull-image <image>
 *   containerport get-container-logs <container_id> [--tail n]
 *   containerport list-volumes
 *   containerport mcp
 * Exit codes: 0 success, 1 error, 2 usage.
 */
import { ContainerPort, VERSION } from "./docker.js";

function usage(): never {
  console.error(`Usage:
  containerport list-containers [--all]
  containerport inspect-container <container_id>
  containerport run-container <image> [--name n] [--port p] [--env e] [--command c]
  containerport start-container <container_id>
  containerport stop-container <container_id>
  containerport remove-container <container_id> [--force]
  containerport list-images
  containerport pull-image <image>
  containerport get-container-logs <container_id> [--tail n]
  containerport list-volumes
  containerport mcp
  containerport --version`);
  process.exit(2);
}
function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx < 0 || idx + 1 >= args.length ? undefined : args[idx + 1];
}
function flagValues(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === name && i + 1 < args.length) out.push(args[++i]);
  return out;
}
function positionals(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (!args[i].startsWith("--")) out.push(args[i]);
  }
  return out;
}
function print(value: unknown): void {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd) usage();
  const port = new ContainerPort();
  try {
    switch (cmd) {
      case "list-containers":
        print(await port.listContainers(rest.includes("--all")));
        break;
      case "inspect-container": {
        const [id] = rest; if (!id) usage();
        print(await port.inspectContainer(id));
        break;
      }
      case "run-container": {
        const [image] = positionals(rest, ["--name", "--port", "--env", "--command"]);
        if (!image) usage();
        print(await port.runContainer({
          image,
          name: flagValue(rest, "--name"),
          ports: flagValues(rest, "--port"),
          env: flagValues(rest, "--env"),
          command: flagValue(rest, "--command"),
        }));
        break;
      }
      case "start-container": {
        const [id] = rest; if (!id) usage();
        print(await port.startContainer(id));
        break;
      }
      case "stop-container": {
        const [id] = rest; if (!id) usage();
        print(await port.stopContainer(id));
        break;
      }
      case "remove-container": {
        const [id] = positionals(rest, []);
        if (!id) usage();
        print(await port.removeContainer(id, rest.includes("--force")));
        break;
      }
      case "list-images":
        print(await port.listImages());
        break;
      case "pull-image": {
        const [image] = rest; if (!image) usage();
        print(await port.pullImage(image));
        break;
      }
      case "get-container-logs": {
        const [id] = positionals(rest, ["--tail"]);
        if (!id) usage();
        const tailRaw = flagValue(rest, "--tail");
        const tail = tailRaw !== undefined ? Number(tailRaw) : undefined;
        print(await port.getContainerLogs(id, tail !== undefined && Number.isFinite(tail) ? tail : undefined));
        break;
      }
      case "list-volumes":
        print(await port.listVolumes());
        break;
      default:
        usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
