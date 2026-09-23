import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "scripts/**/*.test.tsx",
    ],
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "."),
    },
  },
});
