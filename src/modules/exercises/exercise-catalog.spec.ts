import { Equipment, MuscleGroup } from '@prisma/client';
import {
  deriveCatalogTags,
  isCompoundExercise,
  mapBodyPartToMuscleGroup,
  mapEquipment,
  toExerciseCreateInput,
} from './exercise-catalog';

describe('exercise catalog mapping', () => {
  it('maps source equipment to EVRY equipment', () => {
    expect(mapEquipment('body weight')).toBe(Equipment.BODYWEIGHT);
    expect(mapEquipment('smith machine')).toBe(Equipment.MACHINE);
    expect(mapEquipment('resistance band')).toBe(Equipment.BAND);
    expect(mapEquipment('stability ball')).toBe(Equipment.OTHER);
  });

  it('uses target muscle to refine broad body-part categories', () => {
    expect(mapBodyPartToMuscleGroup('upper arms', 'triceps')).toBe(MuscleGroup.TRICEPS);
    expect(mapBodyPartToMuscleGroup('upper arms', 'biceps')).toBe(MuscleGroup.BICEPS);
    expect(mapBodyPartToMuscleGroup('upper legs', 'glutes')).toBe(MuscleGroup.GLUTES);
    expect(mapBodyPartToMuscleGroup('waist', 'abs')).toBe(MuscleGroup.CORE);
    expect(mapBodyPartToMuscleGroup('cardio', 'cardio', 'Burpee')).toBe(MuscleGroup.FULL_BODY);
  });

  it('adds only evidence-based catalog tags', () => {
    expect(deriveCatalogTags('body weight', 'Chair squat', 'Sit on a chair and stand.')).toEqual([
      'equipment_free',
      'accessibility_seated',
    ]);
    expect(deriveCatalogTags('barbell', 'Back squat', 'Brace your core.')).toEqual([]);
  });

  it('detects common compound movements without safety claims', () => {
    expect(isCompoundExercise('Barbell bench press', 'pectorals', 'chest')).toBe(true);
    expect(isCompoundExercise('Dumbbell biceps curl', 'biceps', 'upper arms')).toBe(false);
  });

  it('builds a Prisma-compatible source exercise payload', () => {
    const input = toExerciseCreateInput({
      id: '0001',
      name: '3/4 sit-up',
      category: 'waist',
      body_part: 'waist',
      equipment: 'body weight',
      instructions: { en: 'Lie down.', es: 'Acuéstate.' },
      instruction_steps: { en: ['Lie down.'], es: ['Acuéstate.'] },
      muscle_group: 'hip flexors',
      secondary_muscles: ['lower back'],
      target: 'abs',
      media_id: '2gPfomN',
      image: 'images/0001-2gPfomN.jpg',
      gif_url: 'videos/0001-2gPfomN.gif',
      attribution: '© Gym visual — https://gymvisual.com/',
      created_at: '2026-03-18T12:31:32.854798+00:00',
    });

    expect(input).toMatchObject({
      sourceId: '0001',
      muscleGroup: MuscleGroup.CORE,
      equipment: Equipment.BODYWEIGHT,
      imagePath: 'images/0001-2gPfomN.jpg',
      gifPath: 'videos/0001-2gPfomN.gif',
    });
  });
});
