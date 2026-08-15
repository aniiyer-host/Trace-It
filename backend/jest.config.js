export default {
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
    "^.+\\.mjs$": "@swc/jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!@prisma/client)"],
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  globalTeardown: "<rootDir>/jest.teardown.js",
};
