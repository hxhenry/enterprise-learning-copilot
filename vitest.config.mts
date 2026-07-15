import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],

  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["data/**/*.ts", "lib/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "lib/agents/graph.ts",
        "lib/agents/run-streaming-agent.ts",
      ],
    },
  },
});