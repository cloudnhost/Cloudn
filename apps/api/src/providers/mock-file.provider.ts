import type { FileEntry, FileProvider } from "./file.provider.js";

// In-memory simulated filesystem, isolated exactly like MockProvider for
// infrastructure. Nothing outside this file should know server files are
// fake. Deleting this file (and swapping the factory to
// CloudNAgentFileProvider) is the entire migration to real file access.

interface MockFile {
  path: string;
  isDirectory: boolean;
  content: string;
  modifiedAt: string;
}

const fsState = new Map<string, Map<string, MockFile>>();

function ensureServer(serverId: string): Map<string, MockFile> {
  let fs = fsState.get(serverId);
  if (!fs) {
    fs = new Map();
    const now = new Date().toISOString();
    // Seed a believable starting layout so the file manager isn't empty.
    const seed: Array<[string, boolean, string]> = [
      ["/", true, ""],
      ["/server.properties", false, "motd=A CloudN Server\ndifficulty=normal\nmax-players=20\n"],
      ["/logs", true, ""],
      ["/logs/latest.log", false, "[INFO] Server started\n"],
      ["/config", true, ""],
      ["/config/settings.yml", false, "# Configuration\nenabled: true\n"],
      ["/world", true, ""],
    ];
    for (const [path, isDirectory, content] of seed) {
      fs.set(path, { path, isDirectory, content, modifiedAt: now });
    }
    fsState.set(serverId, fs);
  }
  return fs;
}

function normalize(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export class MockFileProvider implements FileProvider {
  readonly name = "mock";

  async list(serverId: string, path: string): Promise<FileEntry[]> {
    const fs = ensureServer(serverId);
    const dir = normalize(path || "/");
    const entries: FileEntry[] = [];
    for (const file of fs.values()) {
      if (file.path === "/" || file.path === dir) continue;
      if (parentOf(file.path) === dir) {
        entries.push({
          name: file.path.split("/").pop()!,
          path: file.path,
          isDirectory: file.isDirectory,
          sizeBytes: file.isDirectory ? 0 : Buffer.byteLength(file.content, "utf8"),
          modifiedAt: file.modifiedAt,
        });
      }
    }
    return entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }

  async read(serverId: string, path: string): Promise<string> {
    const fs = ensureServer(serverId);
    const file = fs.get(normalize(path));
    if (!file || file.isDirectory) throw new Error("File not found");
    return file.content;
  }

  async write(serverId: string, path: string, content: string): Promise<void> {
    const fs = ensureServer(serverId);
    const p = normalize(path);
    const existing = fs.get(p);
    fs.set(p, {
      path: p,
      isDirectory: false,
      content,
      modifiedAt: new Date().toISOString(),
    });
    if (!existing) this.ensureParents(fs, p);
  }

  async createFile(serverId: string, path: string): Promise<void> {
    await this.write(serverId, path, "");
  }

  async createFolder(serverId: string, path: string): Promise<void> {
    const fs = ensureServer(serverId);
    const p = normalize(path);
    fs.set(p, { path: p, isDirectory: true, content: "", modifiedAt: new Date().toISOString() });
    this.ensureParents(fs, p);
  }

  private ensureParents(fs: Map<string, MockFile>, path: string) {
    let parent = parentOf(path);
    while (parent !== "/" && !fs.has(parent)) {
      fs.set(parent, { path: parent, isDirectory: true, content: "", modifiedAt: new Date().toISOString() });
      parent = parentOf(parent);
    }
  }

  async rename(serverId: string, path: string, newPath: string): Promise<void> {
    const fs = ensureServer(serverId);
    const p = normalize(path);
    const np = normalize(newPath);
    const file = fs.get(p);
    if (!file) throw new Error("File not found");
    fs.delete(p);
    fs.set(np, { ...file, path: np, modifiedAt: new Date().toISOString() });
    // If it was a directory, move children too.
    if (file.isDirectory) {
      for (const f of [...fs.values()]) {
        if (f.path.startsWith(p + "/")) {
          const moved = np + f.path.slice(p.length);
          fs.delete(f.path);
          fs.set(moved, { ...f, path: moved });
        }
      }
    }
  }

  async remove(serverId: string, path: string): Promise<void> {
    const fs = ensureServer(serverId);
    const p = normalize(path);
    fs.delete(p);
    for (const f of [...fs.values()]) {
      if (f.path.startsWith(p + "/")) fs.delete(f.path);
    }
  }

  async search(serverId: string, query: string): Promise<FileEntry[]> {
    const fs = ensureServer(serverId);
    const q = query.toLowerCase();
    const results: FileEntry[] = [];
    for (const file of fs.values()) {
      if (file.path === "/") continue;
      if (file.path.split("/").pop()!.toLowerCase().includes(q)) {
        results.push({
          name: file.path.split("/").pop()!,
          path: file.path,
          isDirectory: file.isDirectory,
          sizeBytes: file.isDirectory ? 0 : Buffer.byteLength(file.content, "utf8"),
          modifiedAt: file.modifiedAt,
        });
      }
    }
    return results;
  }

  async deleteAll(serverId: string): Promise<void> {
    fsState.delete(serverId);
  }
}
