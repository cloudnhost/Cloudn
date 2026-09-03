import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, EyeOff, Eye, Copy, Trash2, Pencil, FolderPlus } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeader, Loading, Modal } from "../../components/ui";

const emptyForm = {
  nestId: "",
  name: "",
  slug: "",
  description: "",
  defaultDockerImage: "",
  startupCommand: "",
};

const emptyNestForm = { name: "", slug: "", description: "" };

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminEggs() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [nestOpen, setNestOpen] = useState(false);
  const [editingEgg, setEditingEgg] = useState<any>(null);
  const [importJson, setImportJson] = useState("");
  const [form, setForm] = useState<any>(emptyForm);
  const [nestForm, setNestForm] = useState(emptyNestForm);
  const [error, setError] = useState<string | null>(null);
  const [nestError, setNestError] = useState<string | null>(null);

  const { data: nests, isLoading } = useQuery({
    queryKey: ["nests-admin"],
    queryFn: () => api.get<any[]>("/nests"),
  });
  // Admin view needs hidden eggs visible too.
  const { data: allEggs } = useQuery({
    queryKey: ["eggs-admin"],
    queryFn: () => api.get<any[]>("/eggs?includeHidden=true"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["nests-admin"] });
    qc.invalidateQueries({ queryKey: ["eggs-admin"] });
  };

  const createNest = useMutation({
    mutationFn: () => api.post("/nests", nestForm),
    onSuccess: () => {
      invalidate();
      setNestOpen(false);
      setNestForm(emptyNestForm);
      setNestError(null);
    },
    onError: (e) => setNestError(e instanceof ApiError ? e.message : "Failed to create nest"),
  });

  const deleteNest = useMutation({
    mutationFn: (id: string) => api.delete(`/nests/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(e instanceof ApiError ? e.message : "Failed to delete nest"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/eggs", { ...form, dockerImages: { default: form.defaultDockerImage }, variables: [] }),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to create egg"),
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/eggs/${editingEgg.id}`, {
        name: form.name,
        description: form.description,
        defaultDockerImage: form.defaultDockerImage,
        startupCommand: form.startupCommand,
      }),
    onSuccess: () => {
      invalidate();
      setEditingEgg(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to update egg"),
  });

  const importEgg = useMutation({
    mutationFn: () => {
      let parsed;
      try {
        parsed = JSON.parse(importJson);
      } catch {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON");
      }
      return api.post("/eggs/import", parsed);
    },
    onSuccess: () => {
      invalidate();
      setImportOpen(false);
      setImportJson("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to import egg"),
  });

  const toggleHidden = useMutation({
    mutationFn: ({ id, hide }: { id: string; hide: boolean }) => api.post(`/eggs/${id}/${hide ? "hide" : "unhide"}`),
    onSuccess: invalidate,
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post(`/eggs/${id}/duplicate`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/eggs/${id}`),
    onSuccess: invalidate,
    onError: (e) => alert(e instanceof ApiError ? e.message : "Failed to delete egg"),
  });

  function openEdit(egg: any) {
    setForm({
      nestId: egg.nestId,
      name: egg.name,
      slug: egg.slug,
      description: egg.description ?? "",
      defaultDockerImage: egg.defaultDockerImage,
      startupCommand: egg.startupCommand,
    });
    setEditingEgg(egg);
  }

  const eggsByNest = (nestId: string) => (allEggs ?? []).filter((e) => e.nestId === nestId);

  return (
    <div className="p-8">
      <PageHeader
        title="Eggs"
        subtitle="Nests and their eggs — define how servers are created and run"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setNestOpen(true)}>
              <FolderPlus size={15} /> Create Nest
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Import JSON
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setForm(emptyForm);
                setCreateOpen(true);
              }}
            >
              <Plus size={15} /> Create Egg
            </button>
          </div>
        }
      />

      {isLoading ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          {nests?.map((nest) => (
            <div key={nest.id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">{nest.name}</h2>
                {eggsByNest(nest.id).length === 0 && (
                  <button
                    className="text-xs text-slate-500 hover:text-red-400"
                    onClick={() => {
                      if (confirm(`Delete empty nest "${nest.name}"?`)) deleteNest.mutate(nest.id);
                    }}
                  >
                    Delete Nest
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {eggsByNest(nest.id).map((egg: any) => (
                  <div key={egg.id} className={`card p-4 ${egg.isHidden ? "opacity-60" : ""}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-slate-200">{egg.name}</span>
                      {egg.isBuiltIn && <span className="badge bg-accent-500/15 text-accent-400">Built-in</span>}
                    </div>
                    {egg.isHidden && <div className="mb-2 text-[10px] uppercase tracking-wide text-amber-500">Hidden</div>}
                    <div className="mb-3 truncate font-mono text-xs text-slate-500">{egg.defaultDockerImage}</div>
                    <div className="flex flex-wrap gap-1">
                      <IconBtn title="Edit" onClick={() => openEdit(egg)}>
                        <Pencil size={13} />
                      </IconBtn>
                      {egg.isHidden ? (
                        <IconBtn title="Unhide" onClick={() => toggleHidden.mutate({ id: egg.id, hide: false })}>
                          <Eye size={13} />
                        </IconBtn>
                      ) : (
                        <IconBtn title="Hide" onClick={() => toggleHidden.mutate({ id: egg.id, hide: true })}>
                          <EyeOff size={13} />
                        </IconBtn>
                      )}
                      <IconBtn title="Duplicate" onClick={() => duplicate.mutate(egg.id)}>
                        <Copy size={13} />
                      </IconBtn>
                      <IconBtn
                        title="Delete"
                        danger
                        onClick={() => {
                          if (confirm(`Delete egg "${egg.name}"?`)) remove.mutate(egg.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  </div>
                ))}
                {eggsByNest(nest.id).length === 0 && <p className="text-sm text-slate-500">No eggs in this nest yet.</p>}
              </div>
            </div>
          ))}
          {(!nests || nests.length === 0) && (
            <p className="text-sm text-slate-500">No nests yet — create one below to start adding eggs.</p>
          )}
        </div>
      )}

      <Modal open={nestOpen} onClose={() => setNestOpen(false)} title="Create Nest">
        <div className="space-y-3">
          {nestError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{nestError}</div>
          )}
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={nestForm.name}
              onChange={(e) => {
                const name = e.target.value;
                // Keep slug in sync with name unless the admin has already
                // customized the slug by hand.
                setNestForm((f) => ({
                  ...f,
                  name,
                  slug: f.slug === slugify(f.name) ? slugify(name) : f.slug,
                }));
              }}
              placeholder="Applications"
            />
          </div>
          <div>
            <label className="label">Slug</label>
            <input
              className="input"
              value={nestForm.slug}
              onChange={(e) => setNestForm({ ...nestForm, slug: e.target.value })}
              placeholder="applications"
            />
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input
              className="input"
              value={nestForm.description}
              onChange={(e) => setNestForm({ ...nestForm, description: e.target.value })}
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={createNest.isPending || !nestForm.name || !nestForm.slug}
            onClick={() => createNest.mutate()}
          >
            Create Nest
          </button>
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Egg" wide>
        <EggForm form={form} setForm={setForm} nests={nests} error={error} showSlugAndNest />
        <button className="btn-primary mt-4 w-full" disabled={create.isPending} onClick={() => create.mutate()}>
          Create Egg
        </button>
      </Modal>

      <Modal open={!!editingEgg} onClose={() => setEditingEgg(null)} title={`Edit ${editingEgg?.name ?? ""}`} wide>
        <EggForm form={form} setForm={setForm} nests={nests} error={error} />
        <button className="btn-primary mt-4 w-full" disabled={update.isPending} onClick={() => update.mutate()}>
          Save Changes
        </button>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Egg (JSON)" wide>
        <p className="mb-2 text-xs text-slate-500">
          Paste a structured egg definition. It will be validated before import — malformed JSON is rejected.
        </p>
        {error && <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
        <textarea
          className="input min-h-[220px] resize-none font-mono text-xs"
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder='{"nestId": "...", "name": "...", "slug": "...", "dockerImages": {"default": "image:tag"}, "defaultDockerImage": "image:tag", "startupCommand": "...", "variables": []}'
        />
        <button className="btn-primary mt-3 w-full" disabled={importEgg.isPending} onClick={() => importEgg.mutate()}>
          Import Egg
        </button>
      </Modal>
    </div>
  );
}

function EggForm({ form, setForm, nests, error, showSlugAndNest }: any) {
  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
      {showSlugAndNest && (
        <>
          <div>
            <label className="label">Nest</label>
            <select className="input" value={form.nestId} onChange={(e: any) => setForm({ ...form, nestId: e.target.value })}>
              <option value="">Select...</option>
              {nests?.map((n: any) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Slug</label>
            <input className="input" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="my-egg" />
          </div>
        </>
      )}
      <div>
        <label className="label">Name</label>
        <input className="input" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Description</label>
        <input className="input" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <label className="label">Docker Image</label>
        <input
          className="input font-mono text-xs"
          value={form.defaultDockerImage}
          onChange={(e: any) => setForm({ ...form, defaultDockerImage: e.target.value })}
          placeholder="ghcr.io/cloudn/image:tag"
        />
      </div>
      <div>
        <label className="label">Startup Command</label>
        <input
          className="input font-mono text-xs"
          value={form.startupCommand}
          onChange={(e: any) => setForm({ ...form, startupCommand: e.target.value })}
        />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
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
