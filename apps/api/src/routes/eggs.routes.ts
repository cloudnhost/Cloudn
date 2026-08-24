import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ok, fail, ErrorCodes } from "../utils/response.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";

export const eggsRouter = Router();
eggsRouter.use(requireAuth);

eggsRouter.get("/", async (req, res) => {
  const { nestId, includeHidden } = req.query as Record<string, string>;
  const isStaff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(req.user!.role);

  // Hidden eggs stay visible to admins (so they can unhide/manage them) but
  // are excluded from what a normal user sees when building a server.
  const where: any = nestId ? { nestId } : {};
  if (!isStaff || includeHidden !== "true") {
    where.isHidden = false;
  }

  const eggs = await prisma.egg.findMany({
    where,
    include: { variables: true, nest: { select: { name: true, slug: true } } },
    orderBy: { name: "asc" },
  });
  return ok(res, eggs);
});

eggsRouter.get("/:id", async (req, res) => {
  const egg = await prisma.egg.findUnique({
    where: { id: req.params.id },
    include: { variables: true, nest: true },
  });
  if (!egg) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");
  return ok(res, egg);
});

const variableSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  envVariable: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Environment variable must be UPPER_SNAKE_CASE"),
  defaultValue: z.string().default(""),
  required: z.boolean().default(false),
  userEditable: z.boolean().default(true),
  adminEditable: z.boolean().default(true),
  validationRule: z.string().optional(),
});

const eggSchema = z.object({
  nestId: z.string().uuid(),
  name: z.string().min(2).max(64),
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).optional(),
  author: z.string().optional(),
  version: z.string().default("1.0.0"),
  dockerImages: z.record(z.string()), // { "label": "image:tag" }
  defaultDockerImage: z.string().min(1),
  startupCommand: z.string().min(1),
  stopCommand: z.string().default("stop"),
  installScript: z.string().optional(),
  installContainer: z.string().optional(),
  variables: z.array(variableSchema).default([]),
});

// Structured JSON egg import — validated and rejected on malformed input.
// The panel only ever *stores* this config; the future Agent is what
// executes install scripts, so there's no server-side execution risk here.
eggsRouter.post("/import", requireRole("ADMIN"), async (req, res) => {
  const parsed = eggSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { variables, ...eggData } = parsed.data;

  const egg = await prisma.egg
    .create({
      data: { ...eggData, isBuiltIn: false },
    })
    .catch(() => null);
  if (!egg) return fail(res, 409, ErrorCodes.CONFLICT, "Egg slug already exists");

  if (variables.length) {
    await prisma.eggVariable.createMany({
      data: variables.map((v) => ({ ...v, eggId: egg.id })),
    });
  }

  await logAudit({ actorId: req.user!.id, action: "EGG_IMPORTED", target: egg.id, ip: req.ip });
  return ok(res, egg, 201);
});

eggsRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = eggSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const { variables, ...eggData } = parsed.data;

  const egg = await prisma.egg.create({ data: { ...eggData, isBuiltIn: false } }).catch(() => null);
  if (!egg) return fail(res, 409, ErrorCodes.CONFLICT, "Egg slug already exists");
  if (variables.length) {
    await prisma.eggVariable.createMany({ data: variables.map((v) => ({ ...v, eggId: egg.id })) });
  }
  await logAudit({ actorId: req.user!.id, action: "EGG_CREATED", target: egg.id, ip: req.ip });
  return ok(res, egg, 201);
});

eggsRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = eggSchema.omit({ variables: true }).partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message);
  const egg = await prisma.egg.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!egg) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");
  await logAudit({ actorId: req.user!.id, action: "EGG_UPDATED", target: egg.id, ip: req.ip });
  return ok(res, egg);
});

eggsRouter.post("/:id/hide", requireRole("ADMIN"), async (req, res) => {
  const egg = await prisma.egg.update({ where: { id: req.params.id }, data: { isHidden: true } }).catch(() => null);
  if (!egg) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");
  await logAudit({ actorId: req.user!.id, action: "EGG_HIDDEN", target: egg.id, ip: req.ip });
  return ok(res, egg);
});

eggsRouter.post("/:id/unhide", requireRole("ADMIN"), async (req, res) => {
  const egg = await prisma.egg.update({ where: { id: req.params.id }, data: { isHidden: false } }).catch(() => null);
  if (!egg) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");
  await logAudit({ actorId: req.user!.id, action: "EGG_UNHIDDEN", target: egg.id, ip: req.ip });
  return ok(res, egg);
});

eggsRouter.post("/:id/duplicate", requireRole("ADMIN"), async (req, res) => {
  const source = await prisma.egg.findUnique({ where: { id: req.params.id }, include: { variables: true } });
  if (!source) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");

  let slug = `${source.slug}-copy`;
  let n = 1;
  while (await prisma.egg.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${source.slug}-copy-${n}`;
  }

  const copy = await prisma.egg.create({
    data: {
      nestId: source.nestId,
      name: `${source.name} (Copy)`,
      slug,
      description: source.description,
      author: source.author,
      version: source.version,
      dockerImages: source.dockerImages as any,
      defaultDockerImage: source.defaultDockerImage,
      startupCommand: source.startupCommand,
      stopCommand: source.stopCommand,
      installScript: source.installScript,
      installContainer: source.installContainer,
      configFiles: source.configFiles as any,
      processConfig: source.processConfig as any,
      featureFlags: source.featureFlags as any,
      isBuiltIn: false,
    },
  });

  if (source.variables.length) {
    await prisma.eggVariable.createMany({
      data: source.variables.map((v) => ({
        eggId: copy.id,
        name: v.name,
        displayName: v.displayName,
        description: v.description,
        envVariable: v.envVariable,
        defaultValue: v.defaultValue,
        required: v.required,
        userEditable: v.userEditable,
        adminEditable: v.adminEditable,
        validationRule: v.validationRule,
      })),
    });
  }

  await logAudit({ actorId: req.user!.id, action: "EGG_DUPLICATED", target: copy.id, metadata: { sourceId: source.id }, ip: req.ip });
  return ok(res, copy, 201);
});

eggsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  // Never delete an egg that existing servers still reference — that would
  // leave those servers pointing at nothing. Admins should hide it instead.
  const inUse = await prisma.server.count({ where: { eggId: req.params.id } });
  if (inUse > 0) {
    return fail(
      res,
      409,
      ErrorCodes.CONFLICT,
      `Cannot delete: ${inUse} server(s) still use this egg. Hide it instead.`
    );
  }
  const deleted = await prisma.egg.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return fail(res, 404, ErrorCodes.NOT_FOUND, "Egg not found");
  await logAudit({ actorId: req.user!.id, action: "EGG_DELETED", target: req.params.id, ip: req.ip });
  return ok(res, { deleted: true });
});
