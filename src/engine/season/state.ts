import type { LeadingTables, SeasonState } from '../types';

/** 리딩 집계 빈 표 */
export function emptyLeadingTables(): LeadingTables {
  return { sire: {}, damsire: {}, jockey: {}, trainer: {}, owner: {}, breeder: {} };
}

/** 새 게임·저장 마이그레이션용 빈 시즌 상태 */
export function createEmptySeasonState(year: number): SeasonState {
  return {
    year,
    meetings: [],
    series: {},
    leading: emptyLeadingTables(),
    ratingHistory: {},
    unratedFigures: {},
    nextGeneratedRace: 1,
    lastRun: {},
    lastPopulationYear: null,
    replayable: [],
  };
}
