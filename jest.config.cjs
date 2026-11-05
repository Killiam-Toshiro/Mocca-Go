const shared = {
  rootDir: __dirname,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  clearMocks: true,
  haste: { enableSymlinks: true },
};

module.exports = {
  watchman: false,
  testTimeout: 30000,
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      ...shared,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
