import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Logging every query to the console slows dev down noticeably. Opt in with PRISMA_LOG=query.
    log:
      process.env.PRISMA_LOG === "query"
        ? ["query", "error", "warn"]
        : ["error"],
    // Default interactive-transaction timeout is 5s. With a remote database (high latency
    // per query) signups/registrations fail with P2028 "Transaction already closed".
    transactionOptions: { maxWait: 15_000, timeout: 30_000 },
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
