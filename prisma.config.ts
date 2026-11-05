// Prisma CLI settings. Loads DATABASE_URL from .env.local (like Next.js does), falling back to .env.
// Variables already set in the environment (e.g. on Vercel) are kept.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
});
