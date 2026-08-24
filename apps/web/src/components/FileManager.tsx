import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  File as FileIcon,
  ChevronRight,
  Plus,
  FolderPlus,
  Upload,
  Search,
  Trash2,
  Pencil,
  Download,
  Save,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Loading, Modal } from "./ui";

// Every action here goes through the API's FileProvider abstraction —
// nothing is faked directly in this component. Today that provider is the
// Mock Provider's in-memory filesystem; a real Agent can replace it later
// without this component changing.
export function FileManager({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [path, setPath] = useState("/");
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<any>(null);
  const [renameValue, setRenameValue] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listing = useQuery({
    queryKey: ["files", serverId, path],
    queryFn: () => api.get<any>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`),
  });

  const search = useQuery({
    queryKey: ["files-search", serverId, query],
    queryFn: () => api.get<any[]>(`/servers/${serverId}/files/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["files", serverId] });

  const openFile = useMutation({
    mutationFn: (filePath: string) => api.get<any>(`/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`),
    onSuccess: (res) => setEditingFile({ path: res.path, content: res.content }),
  });

  const save = useMutation({
    mutationFn: () => api.put(`/servers/${serverId}/files/content`, editingFile),
    onSuccess: () => {
      setEditingFile(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to save file"),
  });

  const createEntry = useMutation({
    mutationFn: () => {
      const fullPath = `${path === "/" ? "" : path}/${newName}`.replace("//", "/");
      return creatingType === "folder"
        ? api.post(`/servers/${serverId}/files/folder`, { path: fullPath })
        : api.post(`/servers/${serverId}/files/upload`, { path: fullPath, content: "" });
    },
    onSuccess: () => {
      setCreatingType(null);
      setNewName("");
      invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: () => {
      const parent = renaming.path.split("/").slice(0, -1).join("/") || "/";
      const newPath = `${parent === "/" ? "" : parent}/${renameValue}`.replace("//", "/");
      return api.post(`/servers/${serverId}/files/rename`, { path: renaming.path, newPath });
    },
    onSuccess: () => {
      setRenaming(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (filePath: string) => api.delete(`/servers/${serverId}/files?path=${encodeURIComponent(filePath)}`),
    onSuccess: invalidate,
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) =>
      new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const fullPath = `${path === "/" ? "" : path}/${file.name}`.replace("//", "/");
            await api.post(`/servers/${serverId}/files/upload`, { path: fullPath, content: String(reader.result) });
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        reader.readAsText(file);
      }),
    onSuccess: invalidate,
  });

  const crumbs = path === "/" ? [] : path.split("/").filter(Boolean);
  const entries = query ? search.data : listing.data?.entries;

  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 p-3">
        <div className="flex items-center gap-1 text-sm text-slate-400">
          <button onClick={() => setPath("/")} className="hover:text-accent-400">
            root
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} />
              <button
                onClick={() => setPath("/" + crumbs.slice(0, i + 1).join("/"))}
                className="hover:text-accent-400"
              >
                {c}
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input w-40 py-1.5 pl-8 text-xs"
              placeholder="Search files..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="btn-secondary cursor-pointer px-2.5 py-1.5 text-xs">
            <Upload size={13} /> Upload
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadFile.mutate(e.target.files[0]);
              }}
            />
          </label>
          <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setCreatingType("folder")}>
            <FolderPlus size={13} /> Folder
          </button>
          <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setCreatingType("file")}>
            <Plus size={13} /> File
          </button>
        </div>
      </div>

      {listing.isLoading && !query ? (
        <Loading />
      ) : (
        <div className="divide-y divide-white/5">
          {!query && path !== "/" && (
            <button
              onClick={() => setPath(crumbs.slice(0, -1).join("/") ? "/" + crumbs.slice(0, -1).join("/") : "/")}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5"
            >
              <ArrowLeft size={14} /> ..
            </button>
          )}
          {(entries ?? []).length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              {query ? "No files match your search." : "This folder is empty."}
            </div>
          )}
          {(entries ?? []).map((entry: any) => (
            <div key={entry.path} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/5">
              <button
                onClick={() => (entry.isDirectory ? setPath(entry.path) : openFile.mutate(entry.path))}
                className="flex flex-1 items-center gap-2.5 text-left text-slate-300"
              >
                {entry.isDirectory ? (
                  <Folder size={15} className="text-accent-400" />
                ) : (
                  <FileIcon size={15} className="text-slate-500" />
                )}
                <span>{entry.name}</span>
                {!entry.isDirectory && <span className="text-xs text-slate-600">{entry.sizeBytes}B</span>}
              </button>
              <div className="flex items-center gap-1">
                {!entry.isDirectory && (
                  <IconBtn title="Download" onClick={() => openFile.mutate(entry.path)}>
                    <Download size={13} />
                  </IconBtn>
                )}
                <IconBtn
                  title="Rename"
                  onClick={() => {
                    setRenaming(entry);
                    setRenameValue(entry.name);
                  }}
                >
                  <Pencil size={13} />
                </IconBtn>
                <IconBtn title="Delete" danger onClick={() => remove.mutate(entry.path)}>
                  <Trash2 size={13} />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editingFile} onClose={() => setEditingFile(null)} title={editingFile?.path ?? ""} wide>
        {error && <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        <textarea
          className="input min-h-[300px] resize-none font-mono text-xs"
          value={editingFile?.content ?? ""}
          onChange={(e) => setEditingFile((f) => (f ? { ...f, content: e.target.value } : f))}
        />
        <button className="btn-primary mt-3 w-full" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save size={14} /> Save File
        </button>
      </Modal>

      <Modal open={!!creatingType} onClose={() => setCreatingType(null)} title={creatingType === "folder" ? "New Folder" : "New File"}>
        <div className="space-y-3">
          <input className="input" placeholder="name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary w-full" disabled={!newName || createEntry.isPending} onClick={() => createEntry.mutate()}>
            Create
          </button>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename">
        <div className="space-y-3">
          <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          <button className="btn-primary w-full" disabled={!renameValue || rename.isPending} onClick={() => rename.mutate()}>
            Rename
          </button>
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
        danger ? "text-red-400 hover:bg-red-500/15" : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
