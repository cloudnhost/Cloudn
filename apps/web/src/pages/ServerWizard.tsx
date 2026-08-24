import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { PageHeader, Loading } from "../components/ui";

const USER_STEPS = ["Details", "Egg", "Node", "Resources", "Allocation", "Variables", "Review"];
const ADMIN_STEPS = ["Owner", "Details", "Egg", "Node", "Resources", "Allocation", "Variables", "Review"];

// Sensible floors so a resource slider never lands on 0 by default —
// the point is "don't silently grant the whole plan", not "make people
// type a CPU percentage from scratch every time".
const MIN_CPU = 25;
const MIN_RAM = 256;
const MIN_DISK = 1024;

export default function ServerWizard() {
  const nav = useNavigate();
  const { isAdmin, user } = useAuth();
  const steps = isAdmin ? ADMIN_STEPS : USER_STEPS;
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [ownerId, setOwnerId] = useState("");
  const [countsAgainstPlan, setCountsAgainstPlan] = useState(true);
  const [name, setName] = useState("");
  const [eggId, setEggId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [allocationId, setAllocationId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [cpuLimit, setCpuLimit] = useState(MIN_CPU);
  const [ramLimitMb, setRamLimitMb] = useState(MIN_RAM);
  const [diskLimitMb, setDiskLimitMb] = useState(MIN_DISK);
  const [resourcesTouched, setResourcesTouched] = useState(false);

  const effectiveOwnerId = isAdmin && ownerId ? ownerId : user?.id;

  const { data: nests } = useQuery({ queryKey: ["nests"], queryFn: () => api.get<any[]>("/nests") });
  const { data: eggs } = useQuery({ queryKey: ["eggs"], queryFn: () => api.get<any[]>("/eggs") });
  const { data: nodes } = useQuery({ queryKey: ["nodes-available"], queryFn: () => api.get<any[]>("/nodes/available") });
  const { data: allUsers } = useQuery({
    queryKey: ["all-users-for-wizard"],
    queryFn: () => api.get<any>("/users?pageSize=200"),
    enabled: isAdmin,
  });
  const { data: allocations } = useQuery({
    queryKey: ["allocations-available", nodeId],
    queryFn: () => api.get<any[]>(`/allocations/available?nodeId=${nodeId}`),
    enabled: !!nodeId,
  });

  // Remaining quota drives the resource sliders' max — for an admin,
  // whichever user is currently selected as the owner; for a regular
  // user, always their own.
  const { data: remaining } = useQuery({
    queryKey: ["remaining", effectiveOwnerId],
    queryFn: () =>
      isAdmin && ownerId
        ? api.get<any>(`/servers/remaining-resources/${ownerId}`)
        : api.get<any>("/servers/remaining-resources"),
    enabled: !!effectiveOwnerId,
  });

  // Once we know what's remaining, default the sliders to a reasonable
  // starting point within it — never silently jump to the full plan.
  useEffect(() => {
    if (!remaining || resourcesTouched) return;
    setCpuLimit(Math.max(MIN_CPU, Math.min(MIN_CPU, remaining.cpuPercent)));
    setRamLimitMb(Math.max(1, Math.min(MIN_RAM, remaining.ramMb)));
    setDiskLimitMb(Math.max(1, Math.min(MIN_DISK, remaining.diskMb)));
  }, [remaining, resourcesTouched]);

  const egg = eggs?.find((e) => e.id === eggId);
  const resourcesStepIndex = steps.indexOf("Resources");
  const allocationStepIndex = steps.indexOf("Allocation");
  const ownerStepIndex = steps.indexOf("Owner");
  const detailsStepIndex = steps.indexOf("Details");
  const eggStepIndex = steps.indexOf("Egg");
  const nodeStepIndex = steps.indexOf("Node");
  const variablesStepIndex = steps.indexOf("Variables");
  const reviewStepIndex = steps.indexOf("Review");

  const resourceCapsExceeded =
    countsAgainstPlan &&
    remaining &&
    (cpuLimit > remaining.cpuPercent || ramLimitMb > remaining.ramMb || diskLimitMb > remaining.diskMb);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const server = await api.post<any>("/servers", {
        name,
        eggId,
        nodeId,
        allocationId,
        variables,
        cpuLimit,
        ramLimitMb,
        diskLimitMb,
        ...(isAdmin ? { ownerId: ownerId || undefined, countsAgainstPlan } : {}),
      });
      nav(`/app/servers/${server.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create server");
    } finally {
      setSubmitting(false);
    }
  }

  const canNext =
    (step === ownerStepIndex && !!ownerId) ||
    (step === detailsStepIndex && name.length >= 2) ||
    (step === eggStepIndex && !!eggId) ||
    (step === nodeStepIndex && !!nodeId) ||
    (step === resourcesStepIndex && !resourceCapsExceeded) ||
    (step === allocationStepIndex && !!allocationId) ||
    step === variablesStepIndex ||
    step === reviewStepIndex;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <PageHeader title="Create Server" subtitle="Provision a new server in a few steps" />

      <div className="mb-8 flex items-center justify-between">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step ? "bg-accent-500 text-white" : i === step ? "border-2 border-accent-500 text-accent-400" : "border border-white/10 text-slate-600"
                }`}
              >
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className="mt-1 text-[10px] text-slate-500">{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`mx-2 h-px flex-1 ${i < step ? "bg-accent-500" : "bg-white/10"}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <div className="card p-6">
        {step === ownerStepIndex && (
          <div className="space-y-2">
            <p className="mb-2 text-xs text-slate-500">Choose which user this server is created for.</p>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Myself ({user?.username})</option>
              {allUsers?.items?.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.username} {u.plan ? `— ${u.plan}` : "— no plan"}
                </option>
              ))}
            </select>

            <label className="mt-4 flex items-start gap-2 rounded-lg bg-white/5 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={countsAgainstPlan}
                onChange={(e) => setCountsAgainstPlan(e.target.checked)}
              />
              <span>
                <span className="block text-slate-200">Count against the owner's plan</span>
                <span className="block text-xs text-slate-500">
                  When off, this server's resources and port won't reduce the owner's remaining plan quota, and
                  won't be bound by it either — use this for complimentary or one-off servers.
                </span>
              </span>
            </label>
          </div>
        )}

        {step === detailsStepIndex && (
          <div className="space-y-4">
            <div>
              <label className="label">Server Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Awesome Server" />
            </div>
            {remaining && (
              <p className="text-xs text-slate-500">
                {isAdmin && ownerId ? "That user has" : "You have"} {remaining.servers} server slot(s),{" "}
                {remaining.ramMb} MB RAM, {remaining.cpuPercent}% CPU, {remaining.diskMb} MB disk, and{" "}
                {remaining.allocations} port(s) remaining on {isAdmin && ownerId ? "their" : "your"} plan.
              </p>
            )}
          </div>
        )}

        {step === eggStepIndex && (
          <div className="space-y-4">
            {!nests ? (
              <Loading />
            ) : (
              nests.map((nest) => (
                <div key={nest.id}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{nest.name}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {eggs
                      ?.filter((e) => e.nestId === nest.id)
                      .map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setEggId(e.id)}
                          className={`rounded-lg border p-3 text-left text-sm transition ${
                            eggId === e.id ? "border-accent-500 bg-accent-500/10 text-accent-300" : "border-white/10 hover:border-white/20"
                          }`}
                        >
                          {e.name}
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {step === nodeStepIndex && (
          <div className="space-y-2">
            {!nodes ? (
              <Loading />
            ) : nodes.length === 0 ? (
              <p className="text-sm text-slate-500">No nodes are currently available for server creation.</p>
            ) : (
              nodes.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setNodeId(n.id);
                    setAllocationId("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition ${
                    nodeId === n.id ? "border-accent-500 bg-accent-500/10" : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <span className="text-slate-200">{n.name}</span>
                  <span className="text-xs text-slate-500">{n.location}</span>
                </button>
              ))
            )}
          </div>
        )}

        {step === resourcesStepIndex && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">
              Choose exactly what this server gets — nothing is granted automatically beyond what you set here.
            </p>
            <ResourceSlider
              label="CPU"
              unit="%"
              value={cpuLimit}
              min={1}
              max={countsAgainstPlan && remaining ? Math.max(1, remaining.cpuPercent) : 3200}
              onChange={(v) => {
                setCpuLimit(v);
                setResourcesTouched(true);
              }}
            />
            <ResourceSlider
              label="RAM"
              unit="MB"
              value={ramLimitMb}
              min={128}
              max={countsAgainstPlan && remaining ? Math.max(128, remaining.ramMb) : 131072}
              step={128}
              onChange={(v) => {
                setRamLimitMb(v);
                setResourcesTouched(true);
              }}
            />
            <ResourceSlider
              label="Disk"
              unit="MB"
              value={diskLimitMb}
              min={512}
              max={countsAgainstPlan && remaining ? Math.max(512, remaining.diskMb) : 1048576}
              step={512}
              onChange={(v) => {
                setDiskLimitMb(v);
                setResourcesTouched(true);
              }}
            />
            {resourceCapsExceeded && (
              <p className="text-xs text-red-400">These values exceed what's remaining on the plan.</p>
            )}
          </div>
        )}

        {step === allocationStepIndex && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Each server starts with one port. You can request additional ports later.</p>
            <div className="grid grid-cols-4 gap-2">
              {allocations?.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => setAllocationId(a.id)}
                  className={`rounded-lg border p-2 text-center font-mono text-xs transition ${
                    allocationId === a.id ? "border-accent-500 bg-accent-500/10 text-accent-300" : "border-white/10 hover:border-white/20 text-slate-400"
                  }`}
                >
                  {a.port}
                </button>
              ))}
              {(!allocations || allocations.length === 0) && (
                <p className="col-span-4 text-sm text-slate-500">No available allocations on this node.</p>
              )}
            </div>
          </div>
        )}

        {step === variablesStepIndex && (
          <div className="space-y-3">
            {egg?.variables?.length ? (
              egg.variables.map((v: any) => (
                <div key={v.id}>
                  <label className="label">
                    {v.displayName} {v.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    className="input"
                    placeholder={v.defaultValue}
                    value={variables[v.envVariable] ?? ""}
                    onChange={(e) => setVariables((prev) => ({ ...prev, [v.envVariable]: e.target.value }))}
                  />
                  {v.description && <p className="mt-1 text-xs text-slate-500">{v.description}</p>}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">This egg has no configurable variables.</p>
            )}
          </div>
        )}

        {step === reviewStepIndex && (
          <div className="space-y-2 text-sm">
            {isAdmin && <Row label="Owner" value={ownerId ? allUsers?.items?.find((u: any) => u.id === ownerId)?.username : user?.username} />}
            <Row label="Name" value={name} />
            <Row label="Egg" value={egg?.name} />
            <Row label="Node" value={nodes?.find((n: any) => n.id === nodeId)?.name} />
            <Row label="CPU" value={`${cpuLimit}%`} />
            <Row label="RAM" value={`${ramLimitMb} MB`} />
            <Row label="Disk" value={`${diskLimitMb} MB`} />
            <Row label="Port" value={allocations?.find((a: any) => a.id === allocationId)?.port} />
            {isAdmin && <Row label="Counts against plan" value={countsAgainstPlan ? "Yes" : "No"} />}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </button>
        {step < steps.length - 1 ? (
          <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue
          </button>
        ) : (
          <button className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? "Provisioning..." : "Create Server"}
          </button>
        )}
      </div>
    </div>
  );
}

function ResourceSlider({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-accent-400">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={Math.max(min, max)}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-500"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{min}</span>
        <span>{Math.max(min, max)} available</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200">{value ?? "—"}</span>
    </div>
  );
}
