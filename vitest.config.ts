/// <reference types="vitest/globals" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    exclude: ["src/firebase-rules.test.ts"],
  },
});
