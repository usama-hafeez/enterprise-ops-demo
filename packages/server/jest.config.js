/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  // Every suite talks to the same MySQL database - never in parallel.
  maxWorkers: 1,
  testTimeout: 120000,
};
