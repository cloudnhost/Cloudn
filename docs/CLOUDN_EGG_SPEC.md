# CloudN Egg Specification

Version: `1.0.0`
Status: Stable draft — consumed by both CloudN Panel and CloudN Agent.

This document fully defines the CloudN "Egg" format: the unit that tells the
Agent what to run inside a server's container, how to install it, and what
configuration it exposes. This spec is intentionally similar in spirit to
Pterodactyl's egg concept but is a **CloudN-native format** — the Agent does
not consume or require Pterodactyl eggs.

The Panel is responsible for storing, editing, and presenting Eggs to users.
The Agent only receives a **fully-resolved Egg definition** (as JSON) at
server-creation time and never fetches eggs on its own.

---

## 1. Egg JSON Structure

```json
{
  "id": "minecraft-paper",
  "name": "Minecraft: Paper",
  "version": "1.2.0",
  "dockerImage": "ghcr.io/cloudn-eggs/minecraft-paper:java21",
  "startupCommand": "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar nogui",
  "stopCommand": "stop",
  "installScript": {
    "image": "ghcr.io/cloudn-eggs/installers:debian",
    "entrypoint": "/bin/bash",
    "script": "#!/bin/bash\nset -e\ncurl -o server.jar $DOWNLOAD_URL\necho 'eula=true' > eula.txt\n"
  },
  "environment": {
    "SERVER_MEMORY": { "default": "1024", "required": true },
    "MINECRAFT_VERSION": { "default": "latest", "required": false },
    "DOWNLOAD_URL": { "required": true }
  },
  "configFiles": [
    {
      "path": "server.properties",
      "parser": "properties",
      "find": {
        "server-port": "{{SERVER_PORT}}",
        "server-ip": "{{SERVER_IP}}"
      }
    }
  ]
}
```

## 2. Field Reference

### 2.1 Required Fields

| Field            | Type   | Description                                                                 |
|------------------|--------|-------------------------------------------------------------------------------|
| `id`             | string | Stable unique identifier for the egg (Panel-assigned). `[a-zA-Z0-9-_]+`     |
| `name`           | string | Human-readable display name.                                                 |
| `version`        | string | Egg version (semver recommended). Bump on any behavioral change.             |
| `dockerImage`    | string | Fully-qualified image reference the server container runs.                   |
| `startupCommand` | string | Shell command executed as the container's entrypoint on start.               |
| `environment`    | object | Map of environment variable name → `{ default?, required? }`.                |

### 2.2 Optional Fields

| Field            | Type   | Description                                                                 |
|------------------|--------|-------------------------------------------------------------------------------|
| `stopCommand`    | string | Command sent to the server's console (stdin) for graceful shutdown. If omitted, the Agent uses `SIGTERM` then `SIGKILL` after a grace period. |
| `installScript`  | object | Defines a one-off install step run in a separate container before first start. |
| `configFiles`    | array  | Declarative post-install config file patching (see §5).                      |

### 2.3 `installScript` Object

| Field        | Type   | Required | Description                                                       |
|--------------|--------|----------|---------------------------------------------------------------------|
| `image`      | string | yes      | Docker image used to run the install script (may differ from `dockerImage`). |
| `entrypoint` | string | no       | Interpreter used to run `script` (default: `/bin/sh`).             |
| `script`     | string | yes      | Full script contents. Executed with the server directory mounted at `/mnt/server` and all resolved environment variables injected. |

### 2.4 `environment` Entries

Each key is the environment variable name exposed to both the install
container and the runtime container.

| Field      | Type    | Description                                                          |
|------------|---------|------------------------------------------------------------------------|
| `default`  | string  | Value used when the Panel does not supply an override.                |
| `required` | boolean | If `true` and no value is available after applying overrides, the Agent **rejects** server creation with `VALIDATION_ERROR`. |

### 2.5 `configFiles` Entries

Used for eggs whose target application reads its own config file (e.g.
`server.properties`, `.yml`) that must be kept in sync with CloudN-assigned
values such as port/IP.

| Field    | Type   | Description                                                              |
|----------|--------|----------------------------------------------------------------------------|
| `path`   | string | Path to the file, relative to the server root. Validated against path traversal exactly like the File API. |
| `parser` | string | One of: `properties`, `yaml`, `json`, `ini`, `xml`, `env`.                |
| `find`   | object | Map of config key → value template. Supports `{{SERVER_PORT}}`, `{{SERVER_IP}}`, and any declared `environment` variable name. |

---

## 3. Variable Interpolation

The following template variables are available in `startupCommand`,
`installScript.script`, and `configFiles[].find` values:

| Variable            | Resolves to                                        |
|---------------------|------------------------------------------------------|
| `{{SERVER_PORT}}`   | Primary allocation port for this server.             |
| `{{SERVER_IP}}`     | Primary allocation IP for this server.               |
| `{{SERVER_MEMORY}}` | Resolved memory limit (MB) from the server's resource configuration. |
| `{{<ENV_VAR_NAME>}}`| Any variable declared in `environment`, after resolving Panel overrides against defaults. |

Interpolation is performed by the Agent immediately before container
creation / install execution. Unresolved variables (referenced but not
declared/resolvable) cause `EGG_INVALID`.

---

## 4. Docker Images

- Images should be pinned to a specific tag (not `latest`) for
  reproducibility, though the Agent does not enforce this.
- The Agent pulls `dockerImage` (and `installScript.image`, if present)
  before first use and caches it locally per normal Docker image caching.
- Images must run as a **non-root user** capable of writing to the mounted
  server volume. The Agent does not grant elevated container privileges.

---

## 5. Installation Flow

1. Panel sends `POST /api/v1/agent/servers` with the resolved Egg (see
   integration doc) as part of server creation.
2. Agent validates the Egg against this specification.
3. Agent creates the server's isolated directory.
4. If `installScript` is present, the Agent:
   a. Pulls `installScript.image`.
   b. Runs a short-lived container with the server directory mounted at
      `/mnt/server`, all resolved environment variables injected, and
      `entrypoint` (or `/bin/sh`) executing `script`.
   c. Streams script output back to the Panel as `server.install.output`
      events.
   d. On non-zero exit, marks the server `install_failed` and reports
      `server.install.failed`.
5. Agent pulls `dockerImage`.
6. Agent applies any `configFiles` patches.
7. Server transitions to `offline`, ready to be started.

---

## 6. Validation Rules

The Agent rejects an Egg (`EGG_INVALID`, HTTP 422) if any of the following
are true:

- Required fields missing or wrong type.
- `dockerImage` / `installScript.image` is not a syntactically valid image
  reference.
- Any `environment` entry marked `required: true` has neither a `default`
  nor a Panel-supplied override at server-creation time.
- Any `configFiles[].path` fails path-traversal validation.
- `startupCommand` is empty.

The Agent does **not** attempt to sanitize or "fix" a malformed Egg — it
rejects it outright so problems surface at creation time, not at runtime.

---

## 7. Versioning & Compatibility

- Eggs are versioned independently via their own `version` field. The Panel
  should treat any change to `dockerImage`, `startupCommand`,
  `installScript`, or `environment` as a version bump.
- This specification itself is versioned (see top of document). Backward-
  incompatible changes to the Egg JSON structure will bump the major
  version and will be reflected in `CLOUDN_AGENT_INTEGRATION.md` alongside
  the API version they first apply to.
- The Agent targets `Egg Spec 1.x`. A future 2.x Agent release will
  document any breaking changes here before Panel integration is updated.

---

## 8. Security Considerations

- **No host-level execution.** Egg scripts run inside containers only —
  never directly on the host. The Agent does not expose any endpoint that
  lets an Egg (or the entity that submitted it) execute arbitrary host
  commands.
- **Untrusted content.** Treat Egg `script` contents as untrusted code that
  will run with the same isolation as the server's runtime container
  (no elevated Docker privileges, mounted only to that server's directory).
- **Environment variable injection.** Values passed as environment
  variables are not shell-evaluated by the Agent; if `startupCommand`
  embeds a variable inside a shell string, the Egg author is responsible
  for quoting/escaping appropriately for their target shell.
- **Secrets.** Do not put secrets that must remain hidden from the server
  process directly in `environment` defaults committed to a public Egg —
  the Agent injects all resolved environment variables into the
  container's process environment, which the server application (and by
  extension, anyone with console/exec access) can read.
- **Image provenance.** The Agent trusts whatever `dockerImage` value it is
  given; the Panel (or Egg author/reviewer) is responsible for vetting
  image sources before an Egg is made available to users.
