/**
 * containerport types.
 *
 * The core talks to Docker only through an injectable ExecutorFn:
 * run `docker <args...>` (an argument array, never a shell string)
 * and resolve with stdout. The default executor uses
 * child_process.execFile on the real `docker` binary; tests inject
 * a fake that records the argument arrays and returns canned output.
 * When docker is absent, the executor rejects with the underlying
 * spawn error (ENOENT) and the MCP layer surfaces it honestly.
 */

/** Runs `docker <args...>` and resolves with stdout. Throws on failure. */
export type ExecutorFn = (
  args: string[],
  opts?: { stdin?: string },
) => Promise<string>;

export interface RunContainerOptions {
  image: string;
  name?: string;
  ports?: string[];
  env?: string[];
  command?: string;
}
