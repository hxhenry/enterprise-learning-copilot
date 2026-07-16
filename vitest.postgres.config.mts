import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL?.trim()) {
  throw new Error(
    "TEST_DATABASE_URL is required for the PostgreSQL integration suite.",
  );
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },

  test: {
    environment: "node",
    include: ["tests/persistence/**/*.postgres.test.ts"],
    passWithNoTests: false,
  },
});
