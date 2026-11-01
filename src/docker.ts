/**
 * containerport core: a defined core subset of 10 container
 * operations mapped to the Docker CLI.
 *
 * The original in TARGETS is Docker's MCP catalog/toolkit gateway;
 * this build is NOT that gateway. It covers only everyday container
 * operations: list/inspect/run/start/stop/remove containers, list
 * and pull images, container logs, and list volumes. Omitted:
 * compose, build/buildx, network management, swarm, registry auth,
 * exec-into-container, and all MCP catalog/gateway tools.
 *
 * Every operation builds an argument array for the real `docker`
 * CLI and runs it through the injectable ExecutorFn (spawn/execFile
 * semantics, no shell), so image names, env values and commands can
 * never be reinterpreted as host shell syntax. A `command` for
 * run_container is passed to the container's own `sh -c`, never to
 * a host shell.
 */
import { spawn } from "node:child_process";
import type { ExecutorFn, RunContainerOptions } from "./types.js";

export const VERSION = "0.1.0";

/**
 * Default executor: spawn `docker <args...>` (no shell), feed stdin
 * when given, resolve with stdout on exit 0. On failure the error
 * carries docker's stderr when present, otherwise the underlying
 * spawn error itself (e.g. "spawn docker ENOENT" when docker is not
 * installed) so failures stay honest.
 */
export const defaultExecutor: ExecutorFn = (args, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) { resolve(stdout); return; }
      const detail = stderr.trim();
      reject(new Error(detail ? `docker ${args[0]} failed: ${detail}` : `docker ${args[0]} exited with code ${code}`));
    });
    if (opts?.stdin !== undefined) child.stdin.write(opts.stdin);
    child.stdin.end();
  });

/** Parse docker's `--format json` output: a JSON array, or one JSON object per line. */
export function parseJsonLines(out: string): unknown[] {
  const trimmed = out.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return trimmed
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function requireValue(value: string | undefined, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} is required`);
  return v;
}

export class ContainerPort {
  private readonly exec: ExecutorFn;
  constructor(exec: ExecutorFn = defaultExecutor) {
    this.exec = exec;
  }

  async listContainers(all = false): Promise<{ containers: unknown[] }> {
    const args = ["ps"];
    if (all) args.push("-a");
    args.push("--format", "json");
    const out = await this.exec(args);
    return { containers: parseJsonLines(out) };
  }

  async inspectContainer(containerId: string): Promise<unknown> {
    const id = requireValue(containerId, "container_id");
    const out = await this.exec(["inspect", id]);
    const parsed = JSON.parse(out) as unknown;
    return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  }

  async runContainer(options: RunContainerOptions): Promise<{ container_id: string; image: string }> {
    const image = requireValue(options.image, "image");
    const args = ["run", "-d"];
    if (options.name) args.push("--name", options.name);
    for (const p of options.ports ?? []) args.push("-p", p);
    for (const e of options.env ?? []) args.push("-e", e);
    args.push(image);
    if (options.command) args.push("sh", "-c", options.command);
    const out = await this.exec(args);
    return { container_id: out.trim(), image };
  }

  async startContainer(containerId: string): Promise<{ container_id: string; started: true }> {
    const id = requireValue(containerId, "container_id");
    await this.exec(["start", id]);
    return { container_id: id, started: true };
  }

  async stopContainer(containerId: string): Promise<{ container_id: string; stopped: true }> {
    const id = requireValue(containerId, "container_id");
    await this.exec(["stop", id]);
    return { container_id: id, stopped: true };
  }

  async removeContainer(
    containerId: string,
    force = false,
  ): Promise<{ container_id: string; removed: true }> {
    const id = requireValue(containerId, "container_id");
    const args = ["rm"];
    if (force) args.push("-f");
    args.push(id);
    await this.exec(args);
    return { container_id: id, removed: true };
  }

  async listImages(): Promise<{ images: unknown[] }> {
    const out = await this.exec(["images", "--format", "json"]);
    return { images: parseJsonLines(out) };
  }

  async pullImage(image: string): Promise<{ image: string; output: string }> {
    const img = requireValue(image, "image");
    const out = await this.exec(["pull", img]);
    return { image: img, output: out.trim() };
  }

  async getContainerLogs(
    containerId: string,
    tail?: number,
  ): Promise<{ container_id: string; logs: string }> {
    const id = requireValue(containerId, "container_id");
    const args = ["logs"];
    if (tail !== undefined) args.push("--tail", String(tail));
    args.push(id);
    const out = await this.exec(args);
    return { container_id: id, logs: out.replace(/\n$/, "") };
  }

  async listVolumes(): Promise<{ volumes: { driver: string; name: string }[] }> {
    const out = await this.exec(["volume", "ls"]);
    const lines = out.split("\n").filter(Boolean);
    // First line is the "DRIVER    VOLUME NAME" header.
    const volumes = lines.slice(1).map((line) => {
      const parts = line.trim().split(/\s+/);
      return { driver: parts[0] ?? "", name: parts.slice(1).join(" ") };
    });
    return { volumes };
  }
}
