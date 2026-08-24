import type { Egg, EggVariable } from "@prisma/client";
import type {
  AgentEggDefinition,
  AgentEggConfigFile,
} from "../types/agent-contract.js";

// The only place that translates the Panel's richer internal Egg model
// (labeled Docker images, per-variable admin/user-editable flags, etc.)
// into the exact wire format CLOUDN_EGG_SPEC.md defines. Anything that
// will eventually cross the wire to a real Agent — the create-server
// payload today validates against this shape even though nothing sends it
// over HTTP yet — goes through here rather than being assembled ad hoc in
// a route handler.

export class EggResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EggResolutionError";
  }
}

interface ResolveInput {
  egg: Egg & { variables: EggVariable[] };
  overrides: Record<string, string>; // Panel-supplied values, e.g. from the server creation wizard
  dockerImageLabel?: string;
}

/**
 * Builds a spec-compliant `AgentEggDefinition` and resolves the final
 * environment map for a specific server. Throws `EggResolutionError`
 * (mirrors the Agent's own `EGG_INVALID` rejection in
 * CLOUDN_EGG_SPEC.md §6) if a required variable has neither a default nor
 * a Panel-supplied override — the Panel enforces this proactively so a
 * bad configuration never even reaches the create-server call.
 */
export function resolveEgg(input: ResolveInput): {
  definition: AgentEggDefinition;
  environment: Record<string, string>;
} {
  const { egg, overrides, dockerImageLabel } = input;

  if (!egg.startupCommand || egg.startupCommand.trim().length === 0) {
    throw new EggResolutionError("Egg has no startup command");
  }

  const dockerImages = (egg.dockerImages as Record<string, string>) ?? {};
  const dockerImage =
    (dockerImageLabel && dockerImages[dockerImageLabel]) || egg.defaultDockerImage;

  if (!dockerImage) {
    throw new EggResolutionError("Egg has no resolvable Docker image");
  }

  const environment: Record<string, string> = {};
  const environmentSpec: AgentEggDefinition["environment"] = {};

  for (const v of egg.variables) {
    const resolved = overrides[v.envVariable] ?? v.defaultValue ?? undefined;

    if (v.required && (resolved === undefined || resolved === "")) {
      throw new EggResolutionError(
        `Missing required variable: ${v.displayName} (${v.envVariable})`
      );
    }

    environment[v.envVariable] = resolved ?? "";
    environmentSpec[v.envVariable] = {
      default: v.defaultValue || undefined,
      required: v.required,
    };
  }

  // Panel-supplied overrides that don't correspond to a declared egg
  // variable are passed through as-is (e.g. EULA-style flags a specific
  // server needs) rather than silently dropped.
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in environment)) environment[key] = value;
  }

  const configFiles = (egg.configFiles as AgentEggConfigFile[] | null) ?? undefined;
  if (configFiles) {
    for (const cf of configFiles) {
      // Mirrors the Agent's own INVALID_PATH rule (CLOUDN_EGG_SPEC.md §2.5,
      // §6) — reject traversal at resolution time rather than waiting for
      // the Agent to reject it later. Paths are relative to server root;
      // a leading "/" is tolerated and normalized away.
      const normalized = cf.path.replace(/^\/+/, "");
      if (normalized.split("/").includes("..") || normalized.trim() === "") {
        throw new EggResolutionError(`configFiles path is invalid: ${cf.path}`);
      }
    }
  }

  const definition: AgentEggDefinition = {
    id: egg.slug,
    name: egg.name,
    version: egg.version,
    dockerImage,
    startupCommand: egg.startupCommand,
    stopCommand: egg.stopCommand || undefined,
    environment: environmentSpec,
    installScript: egg.installScript
      ? {
          image: egg.installImage || dockerImage,
          script: egg.installScript,
        }
      : undefined,
    configFiles,
  };

  return { definition, environment };
}
