import { defineConfig } from "vitest/config";

// Real timers + real sockets are used throughout the suite (reconnect/backoff
// tests sleep for hundreds of ms), so give tests generous timeouts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
