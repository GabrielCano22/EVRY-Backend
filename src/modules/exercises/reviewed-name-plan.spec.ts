import { traducirNombreOriginal } from './exercise-localization';
import { planReviewedNames } from './reviewed-name-plan';

it('plans only reviewed built-ins whose old name has not been modified', () => {
  const source = [{ id: '0001', name: '3/4 sit-up' }, { id: '0003', name: 'air bike' }, { id: 'other', name: 'unknown exercise' }];
  const legacy = traducirNombreOriginal('3/4 sit-up');
  const result = planReviewedNames(source, [
    { id: 'safe', sourceId: '0001', name: legacy, isCustom: false, ownerId: null },
    { id: 'changed', sourceId: '0003', name: 'Nombre editado', isCustom: false, ownerId: null },
    { id: 'custom', sourceId: '0001', name: legacy, isCustom: true, ownerId: 'alice' },
    { id: 'owner', sourceId: '0001', name: legacy, isCustom: false, ownerId: 'alice' },
    { id: 'already', sourceId: '0001', name: 'Abdominal 3/4', isCustom: false, ownerId: null },
    { id: 'not-reviewed', sourceId: 'other', name: 'Algo', isCustom: false, ownerId: null },
  ]);
  expect(result).toEqual({ changes: [{ id: 'safe', sourceId: '0001', expected: legacy, replacement: 'Abdominal 3/4' }], alreadyCorrect: 1, skippedDifferent: 1 });
});

it('accepts a superseded reviewed name as an exact previous state', () => {
  const result = planReviewedNames([{ id: '0003', name: 'hands bike' }], [
    { id: 'old', sourceId: '0003', name: 'Bicicleta de manos', isCustom: false, ownerId: null },
    { id: 'edited', sourceId: '0003', name: 'Mi bici', isCustom: false, ownerId: null },
  ]);
  expect(result).toEqual({
    changes: [{ id: 'old', sourceId: '0003', expected: 'Bicicleta de manos', replacement: 'Bicicleta de brazos' }],
    alreadyCorrect: 0,
    skippedDifferent: 1,
  });
});
