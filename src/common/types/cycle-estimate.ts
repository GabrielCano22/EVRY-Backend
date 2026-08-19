import type { CyclePhase } from '@prisma/client';
import type { CivilDate } from '../dates/civil-date';

export type CycleEstimate =
  | {
      status: 'ESTIMATE';
      phase: CyclePhase;
      cycleDay: number;
      cycleLengthDays: number;
      nextPeriodDate: CivilDate;
      basedOnPeriodStarts: number;
      explanation: string;
    }
  | {
      status: 'INSUFFICIENT_DATA';
      basedOnPeriodStarts: number;
      explanation: string;
    };
