import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  resolve: {
    tsconfigPaths: true,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/api/**/*.ts", "data/**/*.ts", "lib/**/*.ts"],
      exclude: ["**/*.d.ts"],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 88,
        lines: 85,
      },
    },
  },
});
