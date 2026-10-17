import { getNicks, getRacecourses, getRaceTemplates, getStallionRecords } from '../../engine/data/staticData';
import { buildPedigree } from '../../engine/breeding/pedigree';
import { createPedigreeLookup } from '../../engine/breeding/realPedigree';
import { findInbreeding, dominantCrosses, totalBloodPercent } from '../../engine/breeding/inbreeding';
import { nickKey, nickLabel, nickValue } from '../../engine/breeding/nicks';
import { displayName } from '../../engine/naming/register';
import { goingLabel } from '../../engine/going/going';
import { formatDateKo } from '../../engine/time/calendar';
import {
  FITNESS_PEAK_ZONE,
  HIGH_FATIGUE,
  MAX_FATIGUE_TO_RUN,
  NEEDS_RUN_FITNESS,
} from '../../engine/config/conditioning';
import { MIN_FITNESS_TO_RUN } from '../../engine/config/entries';
import type {
  Assessment,
  GameDate,
  GameEvent,
  GameState,
  Going,
  Grade,
  Horse,
  PlannedRace,
} from '../../engine/types';
import type { UpcomingRaceWeek } from '../../engine/season/lookahead';
import {
  commentText,
  conformationLabelKo,
  countryKo,
  distanceHintKo,
  feeKo,
  growthKo,
  nickLabelKo,
  raceConditionsKo,
  raceDistanceKo,
  raceGradeKo,
  type ConformationKey,
} from '../game/text';
import { horseChronicleRows } from '../legacy/legacyView';
import type { HorseTab } from './HorseLink';
import { targetLabel } from '../season/racePlanView';
import type { StatusTone } from '../common/badges';

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

/** 마구간 '최근 5전' 띠와 전적 요약이 보는 출주 수 */
export const RECENT_RUN_COUNT = 5;

/**
 * 화면 표시 기준(문구 구간). 출주 가능·주의·위험 판정 자체는 engine config 상수를 그대로 쓰고,
 * 여기에는 '없음·조금·많음' 같은 문구를 나누는 경계만 둔다.
 */
export const FATIGUE_NONE_BELOW = 20;

/** 마장 한국어(원문 영문은 전적 표 title 툴팁에 남긴다) */
const GOING_KO: Record<Going, string> = {
  firm: '단단함',
  good_to_firm: '약간 단단함',
  good: '좋음',
  good_to_soft: '약간 무름',
  soft: '무름',
  soft_to_heavy: '매우 무름',
  heavy: '아주 무름',
  standard_to_fast: '표준~빠름',
  standard: '표준',
  standard_to_slow: '표준~느림',
  dirt_fast: '빠름',
  dirt_good: '좋음',
  dirt_muddy: '진흙',
  dirt_sloppy: '질척임',
};

export function goingKo(g: Going): string {
  return GOING_KO[g];
}

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

/** 이 말이 뛴 출주(최신순)의 착순. 결과 보관 기간이 지난 출주는 빠진다. */
export interface RunForm {
  position: number;
  fieldSize: number;
}

export function recentRuns(state: GameState, id: string, count: number = RECENT_RUN_COUNT): RunForm[] {
  const runs: RunForm[] = [];
  for (let i = state.raceResults.length - 1; i >= 0 && runs.length < count; i -= 1) {
    const result = state.raceResults[i]!;
    const runner = result.runners.find((r) => r.horseId === id);
    if (runner) runs.push({ position: runner.position, fieldSize: result.runners.length });
  }
  return runs;
}

/** 전적 요약 한 줄. 예: "최근 5전 1착 0회 · 1~3착 2회". 1착과 입상(1~3착)을 나눠 센다. */
export function formSummaryKo(runs: readonly RunForm[]): string {
  if (runs.length === 0) return '최근 출주 기록이 없습니다.';
  const wins = runs.filter((r) => r.position === 1).length;
  const placed = runs.filter((r) => r.position >= 1 && r.position <= 3).length;
  return `최근 ${runs.length}전 1착 ${wins}회 · 1~3착 ${placed}회`;
}

export interface HorseRunRow {
  key: string;
  date: string;
  course: string;
  name: string;
  /** 등급 배지 글자. 등급 없는 레이스는 '클래스 N', 자동 편성 레이스(등급 정보 없음)는 null 이라 배지를 숨긴다 */
  gradeBadge: string | null;
  /** 한국어 등급 문구(원래 표기) */
  grade: string;
  /** 거리 한국어. 예: "1,600m (8f)" */
  distance: string;
  /** 마장 한국어. 원문은 goingTitle */
  going: string;
  goingTitle: string;
  placing: string;
  position: number;
  fieldSize: number;
  margin: string;
  jockey: string;
  weight: number;
  rating: string;
  prize: string;
  replayKey: string | null;
}

export function horseRunRows(state: GameState, id: string): HorseRunRow[] {
  return [...state.raceResults].reverse().flatMap((result): HorseRunRow[] => {
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
        gradeBadge: race ? (race.grade ?? `클래스 ${race.raceClass}`) : null,
        grade: race ? raceGradeKo(race) : '—',
        distance: raceDistanceKo(result.distance),
        going: goingKo(result.going),
        goingTitle: goingLabel(result.going),
        placing: `${runner.position}/${result.runners.length}`,
        position: runner.position,
        fieldSize: result.runners.length,
        margin: runner.position === 1 ? '—' : `${runner.beatenLengths.toFixed(2)}마신 (승자와)`,
        jockey: state.jockeys[runner.jockeyId]?.name ?? '—',
        weight: runner.weightLb,
        rating: change ? `${change.from ?? '미부여'} → ${change.to}` : '—',
        /* 상금 정보가 없는 자동 편성 레이스도 '€0' 으로 적는다(— 대신). */
        prize: feeKo(race?.prizeMoney[runner.position - 1] ?? 0),
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
  const nickKo = nickLabelKo(nickLabel(nickValue(getNicks(), horse.sireLineId, line), known));
  return {
    root,
    /** 혈통 상단 해설용 니크 라벨(미확인이면 null) */
    nick: known ? nickKo : null,
    summary: `외조부 ${damsire ? displayName(state, damsire) : '—'} · 니크 ${nickLabelKo(nickLabel(nickValue(getNicks(), horse.sireLineId, line), known))} · 근친 혈량 ${totalBloodPercent(dominantCrosses(root, findInbreeding(root)))}%`,
  };
}

/* ── 개요 ───────────────────────────────────────── */

const OVERVIEW_DETAIL_KEYS: ConformationKey[] = ['frame', 'hindquarters', 'legs', 'action', 'temperament'];

export interface OverviewView {
  /** 종합 등급(배지) */
  grade: Grade;
  /** 한 줄 총평 = 해설의 첫 문장. 해설이 없으면 null */
  lead: string | null;
  /** 총평 뒤 나머지 해설(불릿) */
  notes: { tone: 'positive' | 'neutral' | 'negative'; text: string }[];
  /** 세부 등급(불릿) */
  details: { key: ConformationKey; label: string; grade: Grade }[];
  distanceKo: string;
  growthKo: string;
}

export function overviewOf(assessment: Assessment): OverviewView {
  const texts = assessment.comments.map((c) => ({
    tone: c.tone,
    text: commentText(c, `${assessment.horseId}|${assessment.year}|${assessment.week}|${c.key}`),
  }));
  return {
    grade: assessment.conformation.overall,
    lead: texts[0]?.text ?? null,
    notes: texts.slice(1),
    details: OVERVIEW_DETAIL_KEYS.map((key) => ({
      key,
      label: conformationLabelKo(key),
      grade: assessment.conformation[key],
    })),
    distanceKo: distanceHintKo(assessment.distanceHint),
    growthKo: growthKo(assessment.growthHint),
  };
}

/* ── 컨디션 ─────────────────────────────────────── */

export type ConditionTone = Extract<StatusTone, 'good' | 'warn' | 'danger'>;

export interface ConditionView {
  tone: ConditionTone;
  /** 좋음 · 주의 · 위험 */
  label: string;
  /** 주의·위험의 이유(기준 문구). 기준 안이면 빈 배열 */
  reasons: string[];
  /** 최상 · 좋음 · 보통 · 나쁨 */
  fitnessWord: string;
  /** 피로 없음 · 조금 · 많음 (피로 앞에 붙여 읽는다) */
  fatigueWord: string;
  fitness: number;
  fatigue: number;
}

const CONDITION_LABEL: Record<ConditionTone, string> = { good: '좋음', warn: '주의', danger: '위험' };

export function conditionOf(horse: Horse): ConditionView {
  const { fitness, fatigue, injury } = horse.condition;
  const injured = Boolean(injury);
  const danger = injured || fatigue >= HIGH_FATIGUE;
  const warn = fatigue > MAX_FATIGUE_TO_RUN || fitness < MIN_FITNESS_TO_RUN;
  const tone: ConditionTone = danger ? 'danger' : warn ? 'warn' : 'good';
  const reasons: string[] = [];
  if (injured) reasons.push('부상 중');
  if (fatigue >= HIGH_FATIGUE) reasons.push('피로 많음');
  else if (fatigue > MAX_FATIGUE_TO_RUN) reasons.push('피로 쌓임');
  if (fitness < MIN_FITNESS_TO_RUN) reasons.push('컨디션 낮음');
  return {
    tone,
    label: CONDITION_LABEL[tone],
    reasons,
    fitnessWord: fitness >= FITNESS_PEAK_ZONE ? '최상' : fitness >= NEEDS_RUN_FITNESS ? '좋음' : fitness >= MIN_FITNESS_TO_RUN ? '보통' : '나쁨',
    fatigueWord: fatigue < FATIGUE_NONE_BELOW ? '없음' : fatigue <= MAX_FATIGUE_TO_RUN ? '조금' : '많음',
    fitness,
    fatigue,
  };
}

/* ── 출주 계획 ──────────────────────────────────── */

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
        const label = `${countryKo(country)} · ${targetLabel(target)} (조건 목표)`;
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

/* ── 기록 타임라인 ──────────────────────────────── */

/** 운영 로그: 출주 신청·건너뜀(취소)·교배 예약 같은 처리 기록. 기본은 접어 둔다. */
const OPS_EVENT_TYPES = new Set<string>([
  'race_plan_declared',
  'race_plan_skipped',
  'covering_booked',
  'mating_proposal_skipped',
]);

export interface TimelineItem {
  key: string;
  date: GameDate;
  dateLabel: string;
  /** 같은 주 안의 정렬 순서(클수록 나중) */
  seq: number;
  kind: 'milestone' | 'race' | 'event';
  /** milestone: 연대기 문장 */
  text?: string;
  /** event: 기존 이벤트(링크 포함 문장은 HorseEventText 가 만든다) */
  event?: GameEvent;
  /** race: 이 말 관점 한 줄 — 착순(없으면 null)·경주명·등급 배지 글자(등급 정보가 없으면 null) */
  race?: { position: number | null; fieldSize: number | null; raceName: string; gradeBadge: string | null };
}

export interface HorseTimeline {
  /** 최신순 단일 타임라인(운영 로그 제외) */
  items: TimelineItem[];
  /** 최신순 운영 로그(접힘) */
  ops: TimelineItem[];
}

function chronicleSeq(id: string): number {
  return Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10) || 0;
}

export function horseTimeline(state: GameState, horseId: string, nameOf: (id: string) => string): HorseTimeline {
  const rowById = new Map(horseChronicleRows(state, horseId, nameOf).map((row) => [row.id, row] as const));
  const milestones: TimelineItem[] = [];
  for (const entry of state.chronicle ?? []) {
    if (entry.horseId !== horseId) continue;
    const row = rowById.get(entry.id);
    if (row === undefined) continue;
    milestones.push({
      key: `c:${entry.id}`,
      date: entry.date,
      dateLabel: formatDateKo(entry.date),
      seq: chronicleSeq(entry.id),
      kind: 'milestone',
      text: row.text,
    });
  }
  const events: TimelineItem[] = [];
  state.eventLog.forEach((event, index) => {
    if (!eventInvolvesHorse(event, horseId) || !('date' in event)) return;
    const date = event.date;
    const base = { key: `e:${index}`, date, dateLabel: formatDateKo(date), seq: index + 1 };
    if (event.type === 'race_run') {
      const result = state.raceResults.find(
        (r) => r.raceId === event.raceId && r.date.year === date.year && r.date.week === date.week,
      );
      const runner = result?.runners.find((r) => r.horseId === horseId);
      const position = runner ? runner.position : event.winnerId === horseId ? 1 : null;
      const replay = state.seasonState.replayable.find(
        (r) => r.race.id === event.raceId && r.date.year === date.year && r.date.week === date.week,
      );
      const race = replay?.race ?? getRaceTemplates().find((t) => t.id === event.raceId);
      events.push({
        ...base,
        kind: 'race',
        race: {
          position,
          fieldSize: result ? result.runners.length : null,
          raceName: race?.name ?? '자동 편성 레이스',
          gradeBadge: race ? (race.grade ?? `클래스 ${race.raceClass}`) : null,
        },
      });
      return;
    }
    events.push({ ...base, kind: 'event', event });
  });
  const sorted = [...milestones, ...events].sort(
    (a, b) => b.date.year - a.date.year || b.date.week - a.date.week || b.seq - a.seq,
  );
  const isOps = (item: TimelineItem) => item.event !== undefined && OPS_EVENT_TYPES.has(item.event.type);
  return { items: sorted.filter((i) => !isOps(i)), ops: sorted.filter(isOps) };
}
