import { PrismaClient, MuscleGroup, Equipment } from '@prisma/client';
import { importSourceExercises } from './import-exercises';

const prisma = new PrismaClient();

const exercises: Array<{
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCompound: boolean;
  tags?: string[];
}> = [
  { name: 'Sentadilla con barra', muscleGroup: 'QUADS', equipment: 'BARBELL', isCompound: true },
  { name: 'Peso muerto convencional', muscleGroup: 'BACK', equipment: 'BARBELL', isCompound: true },
  { name: 'Press banca', muscleGroup: 'CHEST', equipment: 'BARBELL', isCompound: true },
  { name: 'Press militar', muscleGroup: 'SHOULDERS', equipment: 'BARBELL', isCompound: true },
  { name: 'Dominadas', muscleGroup: 'BACK', equipment: 'BODYWEIGHT', isCompound: true, tags: ['equipment_free'] },
  { name: 'Hip thrust', muscleGroup: 'GLUTES', equipment: 'BARBELL', isCompound: true },
  { name: 'Sentadilla goblet', muscleGroup: 'QUADS', equipment: 'DUMBBELL', isCompound: true, tags: ['joint_friendly'] },
  { name: 'Peso muerto rumano', muscleGroup: 'HAMSTRINGS', equipment: 'BARBELL', isCompound: true },
  { name: 'Remo con barra', muscleGroup: 'BACK', equipment: 'BARBELL', isCompound: true },
  { name: 'Press inclinado mancuernas', muscleGroup: 'CHEST', equipment: 'DUMBBELL', isCompound: true },
  { name: 'Curl bíceps mancuerna', muscleGroup: 'BICEPS', equipment: 'DUMBBELL', isCompound: false },
  { name: 'Extensión tríceps polea', muscleGroup: 'TRICEPS', equipment: 'CABLE', isCompound: false },
  { name: 'Elevaciones laterales', muscleGroup: 'SHOULDERS', equipment: 'DUMBBELL', isCompound: false },
  { name: 'Plancha', muscleGroup: 'CORE', equipment: 'BODYWEIGHT', isCompound: false, tags: ['equipment_free', 'pregnancy_safe'] },
  { name: 'Caminata', muscleGroup: 'CARDIO', equipment: 'BODYWEIGHT', isCompound: false, tags: ['joint_friendly', 'equipment_free', 'pregnancy_safe'] },
  { name: 'Sentadilla en silla', muscleGroup: 'QUADS', equipment: 'BODYWEIGHT', isCompound: true, tags: ['accessibility_seated', 'joint_friendly'] },
  { name: 'Press hombro sentado', muscleGroup: 'SHOULDERS', equipment: 'DUMBBELL', isCompound: true, tags: ['accessibility_seated'] },
  { name: 'Curl femoral máquina', muscleGroup: 'HAMSTRINGS', equipment: 'MACHINE', isCompound: false },
  { name: 'Extensión cuádriceps', muscleGroup: 'QUADS', equipment: 'MACHINE', isCompound: false },
  { name: 'Elevación de talones', muscleGroup: 'CALVES', equipment: 'BODYWEIGHT', isCompound: false, tags: ['equipment_free'] },
];

async function main() {
  const imported = await importSourceExercises(prisma);
  console.log(`Imported source catalog: ${imported.inserted} inserted, ${imported.updated} updated.`);

  for (const ex of exercises) {
    await prisma.exercise.upsert({
      where: { id: ex.name.toLowerCase().replace(/\s+/g, '-') },
      create: { ...ex, id: ex.name.toLowerCase().replace(/\s+/g, '-'), tags: ex.tags ?? [] },
      update: {},
    });
  }
  console.log(`Seeded ${exercises.length} exercises.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
