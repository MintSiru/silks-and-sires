import { START_YEAR } from '../config/game';
import { CLASSIC_TYPES, DYNASTY_GOALS } from '../config/legacy';
import type { ChronicleEntry, DynastyGoalProgress, GameState } from '../types';
import type { ChronicleStaticData } from './chronicleSystem';

/** 저장하지 않는 왕조 목표 조회. 옛 저장본의 선택 필드가 없어도 원본은 고치지 않는다. */
export function dynastyGoals(state: GameState, data: Pick<ChronicleStaticData, 'templates'>): DynastyGoalProgress[] {
  const entries = (state.chronicle ?? []).filter((e) => e.player)
    .sort((a, b) => a.date.year - b.date.year || a.date.week - b.date.week);
  const ofKind = (kind: ChronicleEntry['kind']) => entries.filter((e) => e.kind === kind);
  const classics = new Map(data.templates.filter((t) => t.tags.includes('classic')).map((t) => [t.id, t]));
  const classicType = (entry: ChronicleEntry): string | undefined => {
    const template = entry.templateId === undefined ? undefined : classics.get(entry.templateId);
    if (template === undefined) return undefined;
    return CLASSIC_TYPES.find((type) => template.id.endsWith(`_${type}`));
  };
  const classicEntries = ofKind('classic_win');
  const wonTypes = new Set(classicEntries.map(classicType).filter((t) => t !== undefined));
  const g1 = ofKind('g1_win');
  const laurel = ofKind('laurel_award').filter((e) => e.label === 'horse_of_the_year');
  const awardCount = (kind: 'owner' | 'breeder'): number => state.awardsHistory.filter(
    (a) => a.leading[kind][0]?.id === state.playerOwnerId,
  ).length;
  const yearOf = (list: ChronicleEntry[], target = 1): number | null => list[target - 1]?.date.year ?? null;

  return DYNASTY_GOALS.map(({ id, target }) => {
    let progress = 0;
    let doneYear: number | null = null;
    switch (id) {
      case 'first_win':
      case 'first_group_win': {
        const list = ofKind(id);
        progress = list.length > 0 ? 1 : 0;
        doneYear = yearOf(list);
        break;
      }
      case 'first_g1_win':
      case 'ten_g1_wins':
        progress = id === 'first_g1_win' ? Math.min(1, g1.length) : g1.length;
        doneYear = yearOf(g1, target);
        break;
      case 'first_classic_win':
        progress = Math.min(1, classicEntries.length);
        doneYear = yearOf(classicEntries);
        break;
      case 'five_classics': {
        progress = wonTypes.size;
        const seen = new Set<string>();
        for (const entry of classicEntries) {
          const type = classicType(entry);
          if (type !== undefined) seen.add(type);
          if (seen.size >= target) { doneYear = entry.date.year; break; }
        }
        break;
      }
      case 'horse_of_the_year':
        progress = laurel.length > 0 || state.awardsHistory.some((a) => {
          const id = a.laurel.horse_of_the_year;
          const horse = id === null ? undefined : state.horses[id];
          return horse !== undefined && (horse.ownerId === state.playerOwnerId || horse.breederId === state.playerOwnerId);
        }) ? 1 : 0;
        doneYear = yearOf(laurel);
        break;
      case 'leading_owner':
      case 'leading_breeder':
        progress = Math.min(1, awardCount(id === 'leading_owner' ? 'owner' : 'breeder'));
        doneYear = yearOf(ofKind('leading_title').filter((e) => e.label === 'europe:1'
          && e.ownerId === state.playerOwnerId && state.awardsHistory.some((a) => a.year === e.date.year - 1
            && a.leading[id === 'leading_owner' ? 'owner' : 'breeder'][0]?.id === state.playerOwnerId)));
        break;
      case 'sire_line_established':
        progress = Math.min(1, state.legacy?.lines.filter((line) => line.playerBred).length ?? 0);
        doneYear = yearOf(ofKind(id));
        break;
      case 'female_family_established':
        progress = Math.min(1, state.legacy?.families.filter((family) => family.playerBred).length ?? 0);
        doneYear = yearOf(ofKind(id));
        break;
      case 'thirty_year_dynasty':
        progress = Math.max(0, state.date.year - START_YEAR);
        doneYear = entries.find((e) => e.date.year >= START_YEAR + target)?.date.year ?? null;
        break;
    }
    return { id, done: progress >= target, doneYear: progress >= target ? doneYear : null, progress, target };
  });
}
