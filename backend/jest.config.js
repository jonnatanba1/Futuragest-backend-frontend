/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      moduleNameMapper: {
        '^@futuragest/contracts$': '<rootDir>/../packages/contracts/src/index.ts',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.int-spec.ts'],
      moduleNameMapper: {
        '^@futuragest/contracts$': '<rootDir>/../packages/contracts/src/index.ts',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
      globalSetup: '<rootDir>/src/database/jest-global-setup.ts',
    },
  ],
};

module.exports = config;
