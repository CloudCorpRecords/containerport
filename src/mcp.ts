/**
 * containerport MCP server. Tools: list_containers,
 * inspect_container, run_container, start_container,
 * stop_container, remove_container, list_images, pull_image,
 * get_container_logs, list_volumes.
 *
 * Low-level Server API with explicit inputSchema literals identical
 * to the fixture (the McpServer+zod path injects $schema /
 * additionalProperties and breaks parity). Zod validates call args.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ContainerPort, VERSION } from "./docker.js";

const TOOLS = [
  {
    name: "list_containers",
    description: "List Docker containers, optionally including stopped ones.",
    inputSchema: {
      type: "object" as const,
      properties: {
        all: { type: "boolean", description: "When true, include stopped containers as well as running ones." },
      },
      required: [],
    },
  },
  {
    name: "inspect_container",
    description: "Return the full inspect document for one Docker container.",
    inputSchema: {
      type: "object" as const,
      properties: {
        container_id: { type: "string", description: "ID or name of the container to inspect." },
      },
      required: ["container_id"],
    },
  },
  {
    name: "run_container",
    description: "Run a new Docker container in detached mode from an image.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image: { type: "string", description: "Image to run the new container from, such as a name with an optional tag." },
        name: { type: "string", description: "Name to assign to the new container." },
        ports: {
          type: "array",
          items: { type: "string" },
          description: "Port mappings to publish, each in host:container form, passed to docker run -p.",
        },
        env: {
          type: "array",
          items: { type: "string" },
          description: "Environment variables to set in the container, each in KEY=VALUE form, passed to docker run -e.",
        },
        command: {
          type: "string",
          description: "Command to run inside the container, executed via the container's sh -c.",
        },
      },
      required: ["image"],
    },
  },
  {
    name: "start_container",
    description: "Start a stopped Docker container.",
    inputSchema: {
      type: "object" as const,
      properties: {
        container_id: { type: "string", description: "ID or name of the stopped container to start." },
      },
      required: ["container_id"],
    },
  },
  {
    name: "stop_container",
    description: "Stop a running Docker container.",
    inputSchema: {
      type: "object" as const,
      properties: {
        container_id: { type: "string", description: "ID or name of the running container to stop." },
      },
      required: ["container_id"],
    },
  },
  {
    name: "remove_container",
    description: "Remove a Docker container, optionally forcing removal.",
    inputSchema: {
      type: "object" as const,
      properties: {
        container_id: { type: "string", description: "ID or name of the container to remove." },
        force: { type: "boolean", description: "When true, force removal even if the container is running." },
      },
      required: ["container_id"],
    },
  },
  {
    name: "list_images",
    description: "List Docker images present on the host.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "pull_image",
    description: "Pull a Docker image from its registry.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image: { type: "string", description: "Image to pull from its registry, such as a name with an optional tag." },
      },
      required: ["image"],
    },
  },
  {
    name: "get_container_logs",
    description: "Fetch recent log output from a Docker container.",
    inputSchema: {
      type: "object" as const,
      properties: {
        container_id: { type: "string", description: "ID or name of the container to fetch logs from." },
        tail: { type: "number", description: "Number of lines to return from the end of the log output." },
      },
      required: ["container_id"],
    },
  },
  {
    name: "list_volumes",
    description: "List Docker volumes on the host.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
];

const ListContainersArgs = z.object({ all: z.boolean().optional() });
const ContainerIdArgs = z.object({ container_id: z.string() });
const RunArgs = z.object({
  image: z.string(),
  name: z.string().optional(),
  ports: z.array(z.string()).optional(),
  env: z.array(z.string()).optional(),
  command: z.string().optional(),
});
const RemoveArgs = z.object({ container_id: z.string(), force: z.boolean().optional() });
const PullArgs = z.object({ image: z.string() });
const LogsArgs = z.object({ container_id: z.string(), tail: z.number().optional() });
const NoArgs = z.object({});

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

const port = new ContainerPort();
const server = new Server({ name: "containerport", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "list_containers": {
        const p = ListContainersArgs.parse(args ?? {});
        return textResult(await port.listContainers(p.all ?? false));
      }
      case "inspect_container":
        return textResult(await port.inspectContainer(ContainerIdArgs.parse(args ?? {}).container_id));
      case "run_container":
        return textResult(await port.runContainer(RunArgs.parse(args ?? {})));
      case "start_container":
        return textResult(await port.startContainer(ContainerIdArgs.parse(args ?? {}).container_id));
      case "stop_container":
        return textResult(await port.stopContainer(ContainerIdArgs.parse(args ?? {}).container_id));
      case "remove_container": {
        const p = RemoveArgs.parse(args ?? {});
        return textResult(await port.removeContainer(p.container_id, p.force ?? false));
      }
      case "list_images":
        NoArgs.parse(args ?? {});
        return textResult(await port.listImages());
      case "pull_image":
        return textResult(await port.pullImage(PullArgs.parse(args ?? {}).image));
      case "get_container_logs": {
        const p = LogsArgs.parse(args ?? {});
        return textResult(await port.getContainerLogs(p.container_id, p.tail));
      }
      case "list_volumes":
        NoArgs.parse(args ?? {});
        return textResult(await port.listVolumes());
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
