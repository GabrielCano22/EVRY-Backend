import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

async function validateInput(input: Record<string, unknown>) {
  return validate(plainToInstance(UpdateUserDto, input));
}

describe('UpdateUserDto', () => {
  it('trims a valid profile name before validation', async () => {
    const dto = plainToInstance(UpdateUserDto, { name: '  Eva Cano  ' });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Eva Cano');
  });

  it.each([' ', 'a', 'x'.repeat(101)])('rejects an unsafe profile name length', async (name) => {
    await expect(validateInput({ name })).resolves.not.toHaveLength(0);
  });

  it('rejects oversized and duplicate goal arrays', async () => {
    await expect(validateInput({
      goals: ['STRENGTH', 'HYPERTROPHY', 'ENDURANCE', 'FAT_LOSS', 'GENERAL_FITNESS', 'MOBILITY', 'STRENGTH'],
    })).resolves.not.toHaveLength(0);

    await expect(validateInput({ goals: ['STRENGTH', 'STRENGTH'] }))
      .resolves.not.toHaveLength(0);
  });
});
