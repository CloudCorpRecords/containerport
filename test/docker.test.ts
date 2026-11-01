import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContainerPort, parseJsonLines } from "../src/docker.js";
import type { ExecutorFn } from "../src/types.js";

interface Call { args: string[]; stdin?: string }
function fake(responses: Record<string, string> = {}): { fn: ExecutorFn; calls: Call[] } {
  const calls: Call[] = [];
  const fn: ExecutorFn = async (args, opts) => {
    calls.push({ args, stdin: opts?.stdin });
    const key = args.join(" ");
    for (const k of Object.keys(responses)) if (key.startsWith(k)) return responses[k];
    return "";
  };
  return { fn, calls };
}
function failing(message: string): ExecutorFn {
  return async () => { throw new Error(message); };
}

describe("containerport core", () => {
  it("listContainers builds ps --format json, adding -a only when all is set", async () => {
    const { fn, calls } = fake({ ps: '{"ID":"abc","Image":"nginx"}\n{"ID":"def","Image":"redis"}\n' });
    const port = new ContainerPort(fn);
    const r = await port.listContainers(true);
    assert.deepEqual(calls[0].args, ["ps", "-a", "--format", "json"]);
    assert.equal(r.containers.length, 2);
    await port.listContainers(false);
    assert.deepEqual(calls[1].args, ["ps", "--format", "json"]);
  });
  it("parseJsonLines handles arrays, JSON-lines and empty output", () => {
    assert.deepEqual(parseJsonLines('[{"a":1}]'), [{ a: 1 }]);
    assert.deepEqual(parseJsonLines('{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
    assert.deepEqual(parseJsonLines(""), []);
  });
  it("inspectContainer runs inspect and unwraps the single document", async () => {
    const { fn, calls } = fake({ inspect: '[{"Id":"abc","State":{"Running":true}}]' });
    const port = new ContainerPort(fn);
    const doc = (await port.inspectContainer("abc")) as { Id: string };
    assert.deepEqual(calls[0].args, ["inspect", "abc"]);
    assert.equal(doc.Id, "abc");
  });
  it("runContainer builds run -d with name, port and env flags, command via container sh -c", async () => {
    const { fn, calls } = fake({ run: "newid123\n" });
    const port = new ContainerPort(fn);
    const r = await port.runContainer({
      image: "nginx:1.27",
      name: "web",
      ports: ["8080:80", "8443:443"],
      env: ["MODE=prod"],
      command: "nginx -g 'daemon off;'",
    });
    assert.deepEqual(calls[0].args, [
      "run", "-d", "--name", "web",
      "-p", "8080:80", "-p", "8443:443",
      "-e", "MODE=prod",
      "nginx:1.27", "sh", "-c", "nginx -g 'daemon off;'",
    ]);
    assert.deepEqual(r, { container_id: "newid123", image: "nginx:1.27" });
  });
  it("runContainer with only an image stays minimal and requires the image", async () => {
    const { fn, calls } = fake({ run: "id\n" });
    const port = new ContainerPort(fn);
    await port.runContainer({ image: "alpine" });
    assert.deepEqual(calls[0].args, ["run", "-d", "alpine"]);
    await assert.rejects(() => port.runContainer({ image: " " }), /image is required/);
  });
  it("start/stop/remove build exact arg arrays, force only when asked", async () => {
    const { fn, calls } = fake();
    const port = new ContainerPort(fn);
    assert.deepEqual(await port.startContainer("abc"), { container_id: "abc", started: true });
    assert.deepEqual(calls[0].args, ["start", "abc"]);
    assert.deepEqual(await port.stopContainer("abc"), { container_id: "abc", stopped: true });
    assert.deepEqual(calls[1].args, ["stop", "abc"]);
    await port.removeContainer("abc");
    assert.deepEqual(calls[2].args, ["rm", "abc"]);
    await port.removeContainer("abc", true);
    assert.deepEqual(calls[3].args, ["rm", "-f", "abc"]);
  });
  it("listImages parses images --format json lines", async () => {
    const { fn, calls } = fake({ images: '{"Repository":"nginx","Tag":"latest"}\n' });
    const port = new ContainerPort(fn);
    const r = await port.listImages();
    assert.deepEqual(calls[0].args, ["images", "--format", "json"]);
    assert.equal(r.images.length, 1);
  });
  it("pullImage pulls the named image and returns trimmed output", async () => {
    const { fn, calls } = fake({ pull: "Status: Downloaded\n" });
    const port = new ContainerPort(fn);
    const r = await port.pullImage("redis:7");
    assert.deepEqual(calls[0].args, ["pull", "redis:7"]);
    assert.equal(r.output, "Status: Downloaded");
  });
  it("getContainerLogs adds --tail only when given", async () => {
    const { fn, calls } = fake({ logs: "line1\nline2\n" });
    const port = new ContainerPort(fn);
    const r = await port.getContainerLogs("abc", 50);
    assert.deepEqual(calls[0].args, ["logs", "--tail", "50", "abc"]);
    assert.equal(r.logs, "line1\nline2");
    await port.getContainerLogs("abc");
    assert.deepEqual(calls[1].args, ["logs", "abc"]);
  });
  it("listVolumes skips the header and parses driver/name pairs", async () => {
    const { fn, calls } = fake({ volume: "DRIVER    VOLUME NAME\nlocal     data-vol\nlocal     cache\n" });
    const port = new ContainerPort(fn);
    const r = await port.listVolumes();
    assert.deepEqual(calls[0].args, ["volume", "ls"]);
    assert.deepEqual(r.volumes, [
      { driver: "local", name: "data-vol" },
      { driver: "local", name: "cache" },
    ]);
  });
  it("executor failures propagate honestly, including spawn ENOENT text", async () => {
    const port = new ContainerPort(failing("spawn docker ENOENT"));
    await assert.rejects(() => port.listContainers(), /spawn docker ENOENT/);
    await assert.rejects(() => port.stopContainer("abc"), /ENOENT/);
  });
  it("required ids are validated before any executor call", async () => {
    const { fn, calls } = fake();
    const port = new ContainerPort(fn);
    await assert.rejects(() => port.inspectContainer(""), /container_id is required/);
    assert.equal(calls.length, 0);
  });
});
