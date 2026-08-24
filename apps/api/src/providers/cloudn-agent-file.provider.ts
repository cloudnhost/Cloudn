import { prisma } from "../lib/prisma.js";
import { agentClient, AgentApiError } from "./agent-client.js";
import type { FileEntry, FileProvider } from "./file.provider.js";

// Real file access via the deployed CloudN Agent (per
// docs/CLOUDN_AGENT_INTEGRATION.md §9). Every method makes a genuine call
// through agentClient; until a real Agent exists at the node's configured
// host/port these fail honestly with a connection error rather than
// returning fake data.
async function loadServerNode(serverId: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId }, include: { node: true } });
  if (!server) throw new AgentApiError(404, "SERVER_NOT_FOUND", "Server not found in Panel database");
  return server.node;
}

export class CloudNAgentFileProvider implements FileProvider {
  readonly name = "cloudn-agent";

  async list(serverId: string, path: string): Promise<FileEntry[]> {
    const node = await loadServerNode(serverId);
    const entries = await agentClient.listFiles(node, serverId, path);
    return entries.map((e) => ({
      name: e.name,
      path: e.path,
      isDirectory: e.isDirectory,
      sizeBytes: e.size,
      modifiedAt: e.modifiedAt,
    }));
  }

  async read(serverId: string, path: string): Promise<string> {
    const node = await loadServerNode(serverId);
    const { content } = await agentClient.readFile(node, serverId, path);
    return content;
  }

  async write(serverId: string, path: string, content: string): Promise<void> {
    const node = await loadServerNode(serverId);
    await agentClient.writeFile(node, serverId, path, content);
  }

  async createFile(serverId: string, path: string): Promise<void> {
    await this.write(serverId, path, "");
  }

  async createFolder(serverId: string, path: string): Promise<void> {
    const node = await loadServerNode(serverId);
    await agentClient.createDirectory(node, serverId, path);
  }

  async rename(serverId: string, path: string, newPath: string): Promise<void> {
    const node = await loadServerNode(serverId);
    await agentClient.renameFile(node, serverId, path, newPath);
  }

  async remove(serverId: string, path: string): Promise<void> {
    const node = await loadServerNode(serverId);
    await agentClient.deleteFile(node, serverId, path);
  }

  // The integration doc doesn't define a dedicated search endpoint, so
  // this does a best-effort recursive listing rather than claiming a
  // capability the Agent contract doesn't actually offer. Bounded depth
  // to avoid pathological recursion on a huge server directory.
  async search(serverId: string, query: string): Promise<FileEntry[]> {
    const node = await loadServerNode(serverId);
    const q = query.toLowerCase();
    const results: FileEntry[] = [];

    async function walk(path: string, depth: number) {
      if (depth > 6) return;
      const entries = await agentClient.listFiles(node, serverId, path);
      for (const e of entries) {
        if (e.name.toLowerCase().includes(q)) {
          results.push({ name: e.name, path: e.path, isDirectory: e.isDirectory, sizeBytes: e.size, modifiedAt: e.modifiedAt });
        }
        if (e.isDirectory) await walk(e.path, depth + 1);
      }
    }

    await walk("/", 0);
    return results;
  }

  // No dedicated "wipe a server's files" endpoint exists in the Agent
  // contract — deleting the server itself (DELETE /servers/:id) is what
  // removes its directory on the Agent side, per §7. This is intentionally
  // a no-op so callers don't assume a separate file-wipe request exists.
  async deleteAll(): Promise<void> {
    return;
  }
}
