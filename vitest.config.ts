import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)) };

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], setupFiles: ["tests/support/env.ts"] },
      },
      {
        extends: true,
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/support/env.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
  },
});
