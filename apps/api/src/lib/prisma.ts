import { PrismaClient } from "@prisma/client";

// Single shared Prisma client. Never instantiate PrismaClient elsewhere.
export const prisma = new PrismaClient();
