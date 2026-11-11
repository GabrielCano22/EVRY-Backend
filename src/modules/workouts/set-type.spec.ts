import { isWarmupSetType, resolveSetType, SetType } from './set-type';

describe('set type resolution', () => {
  it('keeps the explicit set type', () => {
    expect(resolveSetType(SetType.FAILURE, false)).toBe(SetType.FAILURE);
    expect(resolveSetType(SetType.DROP, true)).toBe(SetType.DROP);
    expect(resolveSetType(SetType.WARMUP, undefined)).toBe(SetType.WARMUP);
  });

  it('derives the type from legacy isWarmup clients', () => {
    expect(resolveSetType(undefined, true)).toBe(SetType.WARMUP);
    expect(resolveSetType(undefined, false)).toBe(SetType.NORMAL);
    expect(resolveSetType(undefined, undefined)).toBe(SetType.NORMAL);
  });

  it('derives the isWarmup column from the type', () => {
    expect(isWarmupSetType(SetType.WARMUP)).toBe(true);
    for (const type of [SetType.NORMAL, SetType.FAILURE, SetType.DROP]) {
      expect(isWarmupSetType(type)).toBe(false);
    }
  });
});
