import { jest as jestGlobals } from '@jest/globals';

Object.defineProperty(globalThis, 'jest', {
  configurable: false,
  value: jestGlobals,
  writable: false,
});
