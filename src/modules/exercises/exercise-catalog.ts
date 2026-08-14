import { Equipment, MuscleGroup, Prisma } from '@prisma/client';
import { traducirNombreEjercicio } from './exercise-localization';

export type LocalizedText = Record<string, string>;
export type LocalizedSteps = Record<string, string[]>;

export type DatasetExercise = {
  id: string;
  name: string;
  category: string;
  body_part: string;
  equipment: string;
  instructions: LocalizedText;
  instruction_steps: LocalizedSteps;
  muscle_group: string;
  secondary_muscles: string[];
  target: string;
  media_id: string;
  image: string;
  gif_url: string;
  attribution: string;
  created_at: string;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function mapBodyPartToMuscleGroup(bodyPart: string, target: string, name = ''): MuscleGroup {
  const part = normalize(bodyPart);
  const targetName = normalize(target);
  const exerciseName = normalize(name);

  if (/burpee|thruster|man maker|turkish get up|clean and jerk|snatch|mountain climber/.test(`${exerciseName} ${targetName}`)) {
    return MuscleGroup.FULL_BODY;
  }

  if (part === 'back') return MuscleGroup.BACK;
  if (part === 'chest') return MuscleGroup.CHEST;
  if (part === 'shoulders') return MuscleGroup.SHOULDERS;
  if (part === 'lower arms') return MuscleGroup.FOREARMS;
  if (part === 'lower legs') return MuscleGroup.CALVES;
  if (part === 'waist') return MuscleGroup.CORE;
  if (part === 'cardio') return MuscleGroup.CARDIO;
  if (part === 'neck') return MuscleGroup.SHOULDERS;

  if (part === 'upper arms') {
    return /triceps|tricep/.test(targetName) ? MuscleGroup.TRICEPS : MuscleGroup.BICEPS;
  }

  if (part === 'upper legs') {
    if (/glute|hip/.test(targetName)) return MuscleGroup.GLUTES;
    if (/hamstring/.test(targetName)) return MuscleGroup.HAMSTRINGS;
    return MuscleGroup.QUADS;
  }

  return MuscleGroup.FULL_BODY;
}

export function mapEquipment(equipment: string): Equipment {
  const value = normalize(equipment);
  if (value === 'body weight') return Equipment.BODYWEIGHT;
  if (value === 'dumbbell') return Equipment.DUMBBELL;
  if (value === 'cable') return Equipment.CABLE;
  if (value === 'barbell' || value === 'olympic barbell' || value === 'ez barbell') return Equipment.BARBELL;
  if (value === 'kettlebell') return Equipment.KETTLEBELL;
  if (value === 'band' || value === 'resistance band') return Equipment.BAND;
  if (value === 'leverage machine' || value === 'smith machine') return Equipment.MACHINE;
  return Equipment.OTHER;
}

export function isCompoundExercise(name: string, target: string, bodyPart: string): boolean {
  const text = `${normalize(name)} ${normalize(target)} ${normalize(bodyPart)}`;
  return /bench press|chest press|shoulder press|overhead press|squat|deadlift|row|pull[- ]?up|chin[- ]?up|push[- ]?up|lunge|step[- ]?up|hip thrust|clean|snatch|jerk|dip|burpee|farmer/.test(text);
}

export function deriveCatalogTags(equipment: string, name: string, instructions: string): string[] {
  const tags = new Set<string>();
  if (mapEquipment(equipment) === Equipment.BODYWEIGHT) tags.add('equipment_free');
  if (/\b(seated|sitting|chair)\b/i.test(`${name} ${instructions}`)) tags.add('accessibility_seated');
  return [...tags];
}

export function toExerciseCreateInput(record: DatasetExercise): Prisma.ExerciseCreateInput {
  const englishInstructions = record.instructions?.en ?? '';
  return {
    sourceId: record.id,
    name: traducirNombreEjercicio(record.name),
    muscleGroup: mapBodyPartToMuscleGroup(record.body_part, record.target, record.name),
    equipment: mapEquipment(record.equipment),
    category: record.category,
    bodyPart: record.body_part,
    target: record.target,
    secondaryMuscles: record.secondary_muscles,
    equipmentLabel: record.equipment,
    isCustom: false,
    isCompound: isCompoundExercise(record.name, record.target, record.body_part),
    tags: deriveCatalogTags(record.equipment, record.name, englishInstructions),
    instructions: record.instructions as Prisma.InputJsonValue,
    instructionSteps: record.instruction_steps as Prisma.InputJsonValue,
    mediaId: record.media_id,
    imagePath: record.image.replaceAll('\\', '/'),
    gifPath: record.gif_url.replaceAll('\\', '/'),
    attribution: record.attribution,
  };
}
