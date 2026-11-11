/**
 * Set types shared by the REST and sync contracts.
 *
 * `setType` is the source of truth. `isWarmup` is still accepted from older
 * clients and derived here, so both representations can never disagree.
 */
export enum SetType {
  WARMUP = 'WARMUP',
  NORMAL = 'NORMAL',
  FAILURE = 'FAILURE',
  DROP = 'DROP',
}

export function resolveSetType(
  setType: SetType | undefined,
  isWarmup: boolean | undefined,
): SetType {
  if (setType !== undefined) return setType;
  return isWarmup === true ? SetType.WARMUP : SetType.NORMAL;
}

export function isWarmupSetType(setType: SetType): boolean {
  return setType === SetType.WARMUP;
}
