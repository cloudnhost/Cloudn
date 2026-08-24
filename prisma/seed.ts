import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import crypto from "node:crypto";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding CloudN demo data...");

  // ── Locations ────────────────────────────────────────────────────────
  const germany = await prisma.location.upsert({
    where: { code: "DE" },
    update: {},
    create: { name: "Germany", code: "DE", description: "Frankfurt datacenter" },
  });
  const us = await prisma.location.upsert({
    where: { code: "US" },
    update: {},
    create: { name: "United States", code: "US", description: "New York datacenter" },
  });

  // ── Nodes (marked isDemo, will use the Mock Provider) ──────────────────
  async function makeNode(name: string, locationId: string, ip: string, memoryMb: number, diskMb: number, cpuCores: number) {
    const node = await prisma.node.upsert({
      where: { id: `seed-${name}` } as any,
      update: {},
      create: {
        name,
        locationId,
        hostname: `${name.toLowerCase()}.cloudn.internal`,
        ipAddress: ip,
        port: 8080,
        sftpPort: 2022,
        memoryMb,
        diskMb,
        cpuCores,
        status: "ONLINE",
        isDemo: true,
      },
    }).catch(async () =>
      prisma.node.findFirst({ where: { name } })
    );
    if (!node) throw new Error("node create failed");

    const existingCred = await prisma.nodeCredential.findUnique({ where: { nodeId: node.id } });
    if (!existingCred) {
      const secret = crypto.randomBytes(32).toString("base64url");
      const secretHash = await argon2.hash(secret, { type: argon2.argon2id });
      await prisma.nodeCredential.create({
        data: { nodeId: node.id, secretHash, secretPreview: secret.slice(-4) },
      });
    }
    return node;
  }

  const node1 = await makeNode("Datalix-01", germany.id, "10.10.0.1", 65536, 1024000, 16);
  const node2 = await makeNode("Datalix-02", germany.id, "10.10.0.2", 32768, 512000, 8);
  const node3 = await makeNode("Frankfurt-01", us.id, "10.20.0.1", 131072, 2048000, 32);

  // ── Allocations ──────────────────────────────────────────────────────
  for (const node of [node1, node2, node3]) {
    const ports = Array.from({ length: 20 }, (_, i) => 25565 + i);
    await prisma.allocation.createMany({
      data: ports.map((port) => ({ nodeId: node.id, ip: node.ipAddress, port })),
      skipDuplicates: true,
    });
  }

  // ── Nests + Eggs ─────────────────────────────────────────────────────
  const gamesNest = await prisma.nest.upsert({
    where: { slug: "games" },
    update: {},
    create: { name: "Games", slug: "games", description: "Game servers" },
  });
  const appsNest = await prisma.nest.upsert({
    where: { slug: "applications" },
    update: {},
    create: { name: "Applications", slug: "applications", description: "Application runtimes" },
  });

  async function makeEgg(params: {
    nestId: string;
    name: string;
    slug: string;
    dockerImage: string;
    startup: string;
    variables: Array<{ name: string; envVariable: string; defaultValue: string; required?: boolean }>;
  }) {
    const egg = await prisma.egg.upsert({
      where: { slug: params.slug },
      update: {},
      create: {
        nestId: params.nestId,
        name: params.name,
        slug: params.slug,
        description: `Default ${params.name} template — built-in, replaceable by admins.`,
        author: "CloudN",
        dockerImages: { default: params.dockerImage },
        defaultDockerImage: params.dockerImage,
        startupCommand: params.startup,
        isBuiltIn: true,
      },
    });
    for (const v of params.variables) {
      await prisma.eggVariable.upsert({
        where: { eggId_envVariable: { eggId: egg.id, envVariable: v.envVariable } },
        update: {},
        create: {
          eggId: egg.id,
          name: v.name,
          displayName: v.name,
          envVariable: v.envVariable,
          defaultValue: v.defaultValue,
          required: v.required ?? false,
        },
      });
    }
    return egg;
  }

  const mcJava = await makeEgg({
    nestId: gamesNest.id,
    name: "Minecraft Java",
    slug: "minecraft-java",
    dockerImage: "ghcr.io/cloudn/minecraft:java21",
    startup: "java -Xms{{SERVER_MEMORY}}M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JAR}} nogui",
    variables: [
      { name: "Server Jar File", envVariable: "SERVER_JAR", defaultValue: "server.jar", required: true },
      { name: "Minecraft Version", envVariable: "VERSION", defaultValue: "latest", required: true },
    ],
  });
  await makeEgg({
    nestId: gamesNest.id,
    name: "Minecraft Bedrock",
    slug: "minecraft-bedrock",
    dockerImage: "ghcr.io/cloudn/minecraft:bedrock",
    startup: "./bedrock_server",
    variables: [{ name: "Server Version", envVariable: "VERSION", defaultValue: "latest" }],
  });
  const nodeEgg = await makeEgg({
    nestId: appsNest.id,
    name: "Node.js",
    slug: "nodejs",
    dockerImage: "ghcr.io/cloudn/nodejs:20",
    startup: "node {{ENTRYPOINT}}",
    variables: [{ name: "Entrypoint", envVariable: "ENTRYPOINT", defaultValue: "index.js", required: true }],
  });
  await makeEgg({
    nestId: appsNest.id,
    name: "Python",
    slug: "python",
    dockerImage: "ghcr.io/cloudn/python:3.12",
    startup: "python3 {{ENTRYPOINT}}",
    variables: [{ name: "Entrypoint", envVariable: "ENTRYPOINT", defaultValue: "main.py", required: true }],
  });
  await makeEgg({
    nestId: appsNest.id,
    name: "Generic Docker",
    slug: "generic-docker",
    dockerImage: "ghcr.io/cloudn/generic:latest",
    startup: "{{STARTUP_COMMAND}}",
    variables: [{ name: "Startup Command", envVariable: "STARTUP_COMMAND", defaultValue: "./start.sh" }],
  });

  // ── Plans ────────────────────────────────────────────────────────────
  const starter = await prisma.plan.upsert({
    where: { id: "seed-starter" } as any,
    update: {},
    create: {
      name: "Starter",
      description: "Entry-level plan for small projects",
      price: 4.99,
      cpuPercent: 200,
      ramMb: 4096,
      diskMb: 25000,
      maxServers: 2,
      maxDatabases: 1,
      maxBackups: 3,
      maxAllocations: 2,
    },
  }).catch(() => prisma.plan.findFirst({ where: { name: "Starter" } }));

  const pro = await prisma.plan.upsert({
    where: { id: "seed-pro" } as any,
    update: {},
    create: {
      name: "Pro",
      description: "For growing communities",
      price: 12.99,
      cpuPercent: 400,
      ramMb: 8192,
      diskMb: 60000,
      maxServers: 5,
      maxDatabases: 3,
      maxBackups: 7,
      maxAllocations: 4,
    },
  }).catch(() => prisma.plan.findFirst({ where: { name: "Pro" } }));

  const enterprise = await prisma.plan.upsert({
    where: { id: "seed-enterprise" } as any,
    update: {},
    create: {
      name: "Enterprise",
      description: "Full resources for serious operators",
      price: 49.99,
      cpuPercent: 1600,
      ramMb: 32768,
      diskMb: 250000,
      maxServers: 20,
      maxDatabases: 10,
      maxBackups: 20,
      maxAllocations: 10,
    },
  }).catch(() => prisma.plan.findFirst({ where: { name: "Enterprise" } }));

  if (!starter || !pro || !enterprise) throw new Error("plan seed failed");

  // ── Users ────────────────────────────────────────────────────────────
  const adminPasswordHash = await argon2.hash("CloudN!Admin123", { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { email: "admin@cloudn.local" },
    update: {},
    create: {
      email: "admin@cloudn.local",
      username: "admin",
      passwordHash: adminPasswordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  const demoPasswordHash = await argon2.hash("CloudN!Demo123", { type: argon2.argon2id });
  const demo = await prisma.user.upsert({
    where: { email: "demo@cloudn.local" },
    update: {},
    create: {
      email: "demo@cloudn.local",
      username: "demo",
      passwordHash: demoPasswordHash,
      role: "USER",
      status: "ACTIVE",
      planId: pro.id,
    },
  });

  // ── Demo servers ─────────────────────────────────────────────────────
  async function makeServer(name: string, ownerId: string, nodeId: string, eggId: string, planId: string, allocIndex: number, status: any) {
    const existing = await prisma.server.findFirst({ where: { name, ownerId } });
    if (existing) return existing;

    const allocation = await prisma.allocation.findFirst({
      where: { nodeId, status: "AVAILABLE" },
      skip: allocIndex,
    });
    if (!allocation) return null;

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return null;

    const server = await prisma.server.create({
      data: {
        identifier: nanoid(8).toLowerCase(),
        name,
        ownerId,
        nodeId,
        eggId,
        planId,
        status,
        dockerImage: "ghcr.io/cloudn/minecraft:java21",
        startupCommand: "java -jar server.jar nogui",
        cpuLimit: plan.cpuPercent,
        ramLimitMb: plan.ramMb,
        diskLimitMb: plan.diskMb,
      },
    });
    await prisma.allocation.update({
      where: { id: allocation.id },
      data: { status: "ASSIGNED", serverId: server.id, primaryForServerId: server.id },
    });
    return server;
  }

  await makeServer("Survival", demo.id, node1.id, mcJava.id, pro.id, 0, "ONLINE");
  await makeServer("Development", demo.id, node1.id, nodeEgg.id, pro.id, 1, "OFFLINE");
  await makeServer("Proxy", admin.id, node2.id, mcJava.id, enterprise.id, 0, "ONLINE");
  await makeServer("Website", admin.id, node3.id, nodeEgg.id, enterprise.id, 0, "ONLINE");

  await prisma.activity.createMany({
    data: [
      { userId: admin.id, type: "USER_LOGIN", message: "admin logged in" },
      { userId: demo.id, type: "SERVER_CREATED", message: 'Server "Survival" created' },
      { userId: demo.id, type: "SERVER_STARTED", message: 'Server "Survival" started' },
    ],
  });

  console.log("Seed complete.");
  console.log("  admin@cloudn.local / CloudN!Admin123 (SUPER_ADMIN)");
  console.log("  demo@cloudn.local  / CloudN!Demo123  (USER, Pro plan)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
