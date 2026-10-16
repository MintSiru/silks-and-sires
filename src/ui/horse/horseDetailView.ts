import { getNicks, getRacecourses, getRaceTemplates, getStallionRecords } from '../../engine/data/staticData';
import { buildPedigree } from '../../engine/breeding/pedigree';
import { createPedigreeLookup } from '../../engine/breeding/realPedigree';
import { findInbreeding, dominantCrosses, totalBloodPercent } from '../../engine/breeding/inbreeding';
import { nickKey, nickLabel, nickValue } from '../../engine/breeding/nicks';
import { displayName } from '../../engine/naming/register';
import { goingLabel } from '../../engine/going/going';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameEvent, GameState, Horse, PlannedRace } from '../../engine/types';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import { countryKo, feeKo, nickLabelKo, raceConditionsKo, raceGradeKo } from '../game/text';
import type { HorseTab } from './HorseLink';
export const HORSE_TAB_LABELS: Record<HorseTab, string> = {
  overview: '개요',
  plan: '출주 계획',
  record: '전적',
  pedigree: '혈통',
  events: '기록',
  breeding: '임신/교배',
  foals: '산자 목록',
  book: '북',
  offspring: '자마 성적',
};
export function horseTabs(horse: Horse): HorseTab[] {
  const common: HorseTab[] = ['pedigree', 'events'];
  if (horse.status === 'broodmare') return ['overview', 'breeding', 'foals', ...common];
  if (horse.status === 'stud') return ['overview', 'book', 'offspring', ...common];
  if (['foal', 'weanling', 'yearling', 'historical'].includes(horse.status)) return ['overview', ...common];
  return ['overview', 'plan', 'record', ...common];
}
export function eventInvolvesHorse(event: GameEvent, id: string): boolean {
  return (
    ('horseId' in event && event.horseId === id) ||
    ('mareId' in event && event.mareId === id) ||
    ('stallionId' in event && event.stallionId === id) ||
    ('foalId' in event && event.foalId === id) ||
    (event.type === 'race_run' && (event.winnerId === id || event.playerHorseIds.includes(id)))
  );
}
export function horseEvents(state: GameState, id: string) {
  return state.eventLog.filter((e) => eventInvolvesHorse(e, id)).reverse();
}
export function horseRunRows(state: GameState, id: string) {
  return [...state.raceResults].reverse().flatMap((result) => {
    const runner = result.runners.find((r) => r.horseId === id);
    if (!runner) return [];
    const replay = state.seasonState.replayable.find(
      (r) =>
        r.race.id === result.raceId && r.date.year === result.date.year && r.date.week === result.date.week,
    );
    const race = replay?.race ?? getRaceTemplates().find((t) => t.id === result.raceId);
    const change = (state.seasonState.ratingHistory[id] ?? []).find(
      (c) =>
        c.raceId === result.raceId && c.date.year === result.date.year && c.date.week === result.date.week,
    );
    return [
      {
        key: `${result.date.year}:${result.date.week}:${result.raceId}`,
        date: formatDateKo(result.date),
        course: getRacecourses().find((c) => c.id === result.racecourseId)?.name ?? '—',
        name: race?.name ?? '자동 편성 레이스',
        grade: race ? raceGradeKo(race) : '—',
        distance: `${result.distance}m`,
        going: goingLabel(result.going),
        placing: `${runner.position}/${result.runners.length}`,
        margin: runner.position === 1 ? '—' : `${runner.beatenLengths.toFixed(2)}마신 (승자와)`,
        jockey: state.jockeys[runner.jockeyId]?.name ?? '—',
        weight: runner.weightLb,
        rating: change ? `${change.from ?? '미부여'} → ${change.to}` : '—',
        prize: race ? feeKo(race.prizeMoney[runner.position - 1] ?? 0) : '—',
        replayKey: replay ? `${replay.meetingId}|${replay.race.id}` : null,
      },
    ];
  });
}
export function horsePedigree(state: GameState, horse: Horse) {
  const root = buildPedigree(createPedigreeLookup(state.horses, getStallionRecords()), horse.id);
  const damsireId = root.dam?.sire?.horseId;
  const damsire = damsireId ? state.horses[damsireId] : undefined;
  const line = damsire?.sireLineId ?? null;
  const known =
    horse.sireLineId !== null &&
    line !== null &&
    state.breeding.revealedNicks.includes(nickKey(horse.sireLineId, line));
  return {
    root,
    summary: `외조부 ${damsire ? displayName(state, damsire) : '—'} · 니크 ${nickLabelKo(nickLabel(nickValue(getNicks(), horse.sireLineId, line), known))} · 근친 혈량 ${totalBloodPercent(dominantCrosses(root, findInbreeding(root)))}%`,
  };
}
export interface PlanChoice {
  key: string;
  label: string;
  plan: PlannedRace;
}
/** 미정 일반 경주는 UX1의 국가·거리·종류 조건으로 고른다. */
export function planChoices(horseId: string, weeks: readonly UpcomingRaceWeek[]): PlanChoice[] {
  return weeks.flatMap((week) => {
    const prefix = `${horseId}:${week.date.year}-${week.date.week}`;
    const fixed = week.fixedRaces.map((race) => ({
      key: `${prefix}:${race.id}`,
      label: `${race.name} · ${raceGradeKo(race)} · ${race.distance}m · ${raceConditionsKo(race)}`,
      plan: {
        id: prefix,
        date: week.date,
        templateId: race.id,
        target: null,
        status: 'proposed' as const,
        note: '플레이어가 추가한 고정 일정',
      },
    }));
    const countries = [...new Set(week.meetings.map((m) => m.course.country))];
    const targets = countries.flatMap((country) => {
      const kinds = week.meetings.find((m) => m.course.country === country)?.expectedKinds ?? [];
      return kinds.map((kind) => {
        const distances = kind.distances.map((d) => d.distance);
        const target = {
          kinds: [kind.kind],
          minDistance: Math.min(...distances),
          maxDistance: Math.max(...distances),
          country,
        };
        const label = `${countryKo(country)} · ${kind.kind === 'maiden' ? '미승리' : kind.kind === 'novice' ? '노비스' : kind.kind === 'handicap' ? '핸디캡' : '조건'} · ${target.minDistance}~${target.maxDistance}m (조건 목표)`;
        return {
          key: `${prefix}:${country}:${kind.kind}`,
          label,
          plan: {
            id: prefix,
            date: week.date,
            templateId: null,
            target,
            status: 'proposed' as const,
            note: '플레이어가 추가한 조건 목표 — 개최 확정 시 맞는 레이스를 찾습니다.',
          },
        };
      });
    });
    return [...fixed, ...targets];
  });
}
