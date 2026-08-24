// Same pattern as InfrastructureProvider: the rest of the app only ever
// talks to FileProvider, never to MockFileProvider directly, so swapping in
// a real CloudNAgentFileProvider later is a factory-level change only.

export interface FileEntry {
  name: string;
  path: string; // full path from server root, e.g. "/config/server.properties"
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
}

export interface FileProvider {
  readonly name: string;

  list(serverId: string, path: string): Promise<FileEntry[]>;
  read(serverId: string, path: string): Promise<string>;
  write(serverId: string, path: string, content: string): Promise<void>;
  createFile(serverId: string, path: string): Promise<void>;
  createFolder(serverId: string, path: string): Promise<void>;
  rename(serverId: string, path: string, newPath: string): Promise<void>;
  remove(serverId: string, path: string): Promise<void>;
  search(serverId: string, query: string): Promise<FileEntry[]>;
  deleteAll(serverId: string): Promise<void>;
}
