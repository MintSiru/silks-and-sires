import { displayName } from '../../engine/naming/register';
/**
 * 시즌 화면 뷰 모델 (M3-D3a). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 플레이어에게 OR 숫자를 보이지 않는다: 결과 객체에는 officialRating 필드가 없고, 레이팅은 ratingHintKo 문구로만 보인다.
 */
import { INJURY_KINDS, VET_EXAM_COST, type InjuryTreatmentDef } from '../../engine/config/injury';
import { PLAYER_TRAINING_START_AGE } from '../../engine/config/season';
import { getRacecourses, getRaceTemplates } from '../../engine/data/staticData';
import { goingLabel } from '../../engine/going/going';
import { coatColour } from '../../engine/horse/coat';
import { trainerReport, type TrainerReportKey } from '../../engine/horse/conditioning';
import { personalityClues, type PersonalityClueKey } from '../../engine/horse/personality';
import { isEligible } from '../../engine/season/eligibility';
import { ageInYear, formatDateKo } from '../../engine/time/calendar';
import type {
  GameDate,
  GameState,
  Horse,
  HorseId,
  Injury,
  InjuryRecord,
  InjuryTreatment,
  Money,
  Race,
  RaceId,
  RaceResult,
  ScheduledRace,
  TrainerId,
} from '../../engine/types';
import {
  coatColourKo,
  feeKo,
  INJURY_REGION_HINT_KO,
  INJURY_TREATMENT_KO,
  injuryKo,
  raceConditionsKo,
  raceDistanceKo,
  raceGradeKo,
  sexKo,
} from '../game/text';

export { ratingHintKo } from '../game/text';

/** 개최가 없을 때 칸을 채우는 표기 */
const UNDECIDED_GOING = '미정';
/** 자동 생성 레이스의 이름 대신 쓰는 표기(정적 목록에 없는 레이스) */
const GENERATED_RACE_NAME = '자동 편성 레이스';

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function nameOfHorse(state: GameState, id: HorseId): string {
  return (state.horses[id] === undefined ? id : displayName(state, state.horses[id]!));
}

function isPlayerHorse(state: GameState, horse: Horse): boolean {
  return horse.ownerId === state.playerOwnerId;
}

function sameWeek(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

function compareDate(a: GameDate, b: GameDate): number {
  return a.year - b.year || a.week - b.week;
}

/** 같은 주에 이미 다른 레이스에 선언된 말인가 */
function declaredInWeek(state: GameState, date: GameDate, horseId: HorseId): boolean {
  return state.seasonState.meetings.some(
    (m) => sameWeek(m.date, date) && m.races.some((sr) => sr.declarations.some((d) => d.horseId === horseId)),
  );
}

/** '내 말' 목록에 드는가: 조교 중·휴양 중, 또는 조교 시작 나이 이상인데 아직 조교 전인 1세 말 */
function isListedPlayerHorse(horse: Horse, year: number): boolean {
  if (horse.status === 'in_training' || horse.status === 'resting') return true;
  return horse.status === 'yearling' && ageInYear(horse.birthYear, year) >= PLAYER_TRAINING_START_AGE;
}

// ── 내 말 ───────────────────────────────────────────────────────

/** 병력 표시 개수(최신 먼저) */
const INJURY_HISTORY_VIEW_COUNT = 5;

export interface InjurySuspectedView {
  kind: 'suspected';
  /** 조교사 단서 문구(부위별). 종류는 확진 전이라 숨긴다 */
  hintKo: string;
  /** 검사 버튼의 비용 문구 */
  examCostKo: string;
}

export interface InjuryTreatmentOptionView {
  treatment: InjuryTreatment;
  labelKo: string;
  costKo: string;
  /** 기간·재발·후유증 배수와 성공률 요약. 예: '기간 ×0.7 · 성공률 80%' */
  noteKo: string;
}

export interface InjuryDiagnosedView {
  kind: 'diagnosed';
  nameKo: string;
  weeksOut: number;
  /** 고른 치료 이름. 아직 고르지 않았으면 null */
  treatmentKo: string | null;
  /** 고를 수 있는 치료(휴양 제외). 이미 의료·수술을 골랐으면 빈 배열 */
  options: InjuryTreatmentOptionView[];
}

export type InjuryView = InjurySuspectedView | InjuryDiagnosedView;

/** 치료 정의 한 줄 요약. 기간 범위가 있으면 범위를, 아니면 배수를 쓴다 */
function treatmentNoteKo(def: InjuryTreatmentDef): string {
  const parts: string[] = [];
  if (def.minWeeks !== undefined && def.maxWeeks !== undefined) {
    parts.push(`기간 ${def.minWeeks}~${def.maxWeeks}주`);
  } else if (def.weeksMult !== 1) {
    parts.push(`기간 ×${def.weeksMult}`);
  }
  if (def.recurMult !== 1) parts.push(`재발 ×${def.recurMult}`);
  if (def.permanentMult !== 1) parts.push(`후유증 ×${def.permanentMult}`);
  if (def.successRate < 1) parts.push(`성공률 ${Math.round(def.successRate * 100)}%`);
  return parts.length === 0 ? '효과 없음' : parts.join(' · ');
}

function treatmentOptionsOf(injury: Injury): InjuryTreatmentOptionView[] {
  if (injury.treatment === 'medical' || injury.treatment === 'surgery') return [];
  const entries = Object.entries(INJURY_KINDS[injury.kind].treatments) as [InjuryTreatment, InjuryTreatmentDef][];
  return entries
    .filter(([treatment]) => treatment !== 'rest')
    .map(([treatment, def]) => ({
      treatment,
      labelKo: INJURY_TREATMENT_KO[treatment],
      costKo: feeKo(def.cost),
      noteKo: treatmentNoteKo(def),
    }));
}

/** 부상 상태 뷰. 확진 전이면 단서만, 확진되면 종류·기간·치료 선택을 준다 */
export function injuryViewOf(injury: Injury): InjuryView {
  if (injury.diagnosed === false) {
    return {
      kind: 'suspected',
      hintKo: INJURY_REGION_HINT_KO[INJURY_KINDS[injury.kind].region],
      examCostKo: feeKo(VET_EXAM_COST),
    };
  }
  return {
    kind: 'diagnosed',
    nameKo: injuryKo(injury.kind),
    weeksOut: injury.weeksOut,
    treatmentKo: injury.treatment === undefined || injury.treatment === null ? null : INJURY_TREATMENT_KO[injury.treatment],
    options: treatmentOptionsOf(injury),
  };
}

/** 병력 줄(최근 5건, 최신 먼저). 영구 영향이 있으면 '· 후유증'을 붙인다 */
function historyLinesOf(history: InjuryRecord[] | undefined): string[] {
  return (history ?? [])
    .slice(-INJURY_HISTORY_VIEW_COUNT)
    .reverse()
    .map((record) => {
      const line = `${formatDateKo(record.since)} ${injuryKo(record.kind)} ${record.weeks}주 · ${INJURY_TREATMENT_KO[record.treatment]}`;
      const permanent = record.permanent !== undefined && Object.keys(record.permanent).length > 0;
      return permanent ? `${line} · 후유증` : line;
    });
}

export interface PlayerHorseView {
  id: HorseId;
  name: string;
  status: Horse['status'];
  ageYears: number;
  /** 성별 호칭: 암말 · 수말 · 거세마 */
  sexLabel: string;
  coatLabel: string;
  trainerId: TrainerId | null;
  /** 조교사 이름. 미배정이면 null */
  trainerName: string | null;
  /** 조교사 코멘트 키. 조교사 미배정이면 null */
  statusKey: TrainerReportKey | null;
  /** 기수·조교사 코멘트용 성격 단서 키(최대 개수는 엔진 규칙을 따른다) */
  personalityKeys: PersonalityClueKey[];
  /** 부상 상태. 부상이 없으면 null */
  injury: InjuryView | null;
  /** 병력 줄(최근 5건, 최신 먼저). 병력이 없으면 빈 배열 */
  historyKo: string[];
}

/** 플레이어 소유 '내 말' 목록(id 오름차순). 조교 중·휴양 중 말과 2세 이상 미조교 말 */
export function playerHorses(state: GameState): PlayerHorseView[] {
  const year = state.date.year;
  return Object.values(state.horses)
    .filter((h) => isPlayerHorse(state, h) && isListedPlayerHorse(h, year))
    .sort(byId)
    .map((h) => {
      const trainer = h.trainerId === null ? undefined : state.trainers[h.trainerId];
      return {
        id: h.id,
        name: displayName(state, h),
        status: h.status,
        ageYears: ageInYear(h.birthYear, year),
        sexLabel: sexKo(h.sex, h.gelded),
        coatLabel: coatColourKo(coatColour(h.coat.genes)),
        trainerId: h.trainerId,
        trainerName: trainer?.name ?? null,
        statusKey: trainer === undefined ? null : trainerReport(h),
        personalityKeys: personalityClues(h.personality),
        injury: h.condition.injury === null ? null : injuryViewOf(h.condition.injury),
        historyKo: historyLinesOf(h.injuryHistory),
      };
    });
}

export interface TrainerChoice {
  id: TrainerId;
  name: string;
  /** 이 말을 뺀 현재 맡은 두수 */
  load: number;
  capacity: number;
  full: boolean;
}

/** 조교사 선택지(id 오름차순). horseId 말은 계산에서 뺀다(같은 조교사 재배정 판정용) */
export function trainerChoices(state: GameState, horseId: HorseId): TrainerChoice[] {
  const loads = new Map<TrainerId, number>();
  for (const h of Object.values(state.horses)) {
    if (h.id === horseId || h.trainerId === null) continue;
    loads.set(h.trainerId, (loads.get(h.trainerId) ?? 0) + 1);
  }
  return Object.values(state.trainers)
    .sort(byId)
    .map((t) => {
      const load = loads.get(t.id) ?? 0;
      return { id: t.id, name: t.name, load, capacity: t.capacity, full: load >= t.capacity };
    });
}

// ── 개최·출주 ───────────────────────────────────────────────────

/** 화면 상태: 개최 레이스 상태. abandoned(성립 안 됨)는 마감과 같이 본다 */
export type RaceStatusView = 'open' | 'closed' | 'run';

export interface PlayerDeclarationView {
  horseId: HorseId;
  name: string;
}

export interface MeetingRaceView {
  meetingId: string;
  raceId: RaceId;
  name: string;
  /** G1·G2·G3·리스티드 또는 '종류 · 클래스 N' */
  gradeLabel: string;
  distanceLabel: string;
  /** 조건 요약. 예: "3세 · 암말 · WFA" */
  conditionsLabel: string;
  totalPrize: Money;
  /** 현재 출주 접수 두수(플레이어 말 포함) */
  runners: number;
  maxRunners: number;
  status: RaceStatusView;
  playerDeclared: PlayerDeclarationView[];
}

export interface MeetingView {
  meetingId: string;
  courseName: string;
  date: GameDate;
  dateLabel: string;
  /** 마장 표기. 확정 전이면 '미정' */
  goingLabel: string;
  races: MeetingRaceView[];
}

function viewStatus(status: ScheduledRace['status']): RaceStatusView {
  if (status === 'open' || status === 'run') return status;
  return 'closed';
}

/** 이번 주·다음 주 개최 목록(날짜 오름차순). 경마장 이름은 정적 경마장 목록에서 찾는다 */
export function meetingsView(state: GameState): MeetingView[] {
  const courses = new Map(getRacecourses().map((c) => [c.id, c.name]));
  return [...state.seasonState.meetings]
    .sort((a, b) => compareDate(a.date, b.date))
    .map((m) => ({
      meetingId: m.id,
      courseName: courses.get(m.racecourseId) ?? m.racecourseId,
      date: { ...m.date },
      dateLabel: formatDateKo(m.date),
      goingLabel: m.going === null ? UNDECIDED_GOING : goingLabel(m.going),
      races: m.races.map((sr) => ({
        meetingId: m.id,
        raceId: sr.race.id,
        name: sr.race.name,
        gradeLabel: raceGradeKo(sr.race),
        distanceLabel: raceDistanceKo(sr.race.distance),
        conditionsLabel: raceConditionsKo(sr.race),
        totalPrize: sr.race.prizeMoney.reduce((sum, money) => sum + money, 0),
        runners: sr.declarations.length,
        maxRunners: sr.race.maxRunners,
        status: viewStatus(sr.status),
        playerDeclared: sr.declarations
          .filter((d) => d.isPlayer)
          .map((d) => ({ horseId: d.horseId, name: nameOfHorse(state, d.horseId) })),
      })),
    }));
}

export interface PlayerHorseOption {
  id: HorseId;
  name: string;
}

/**
 * 그 레이스에 낼 수 있는 플레이어 말(id 오름차순).
 * 조건: 레이스 open, 두수 여유, 조교사 배정, isEligible, 그 주 다른 선언 없음, 이 레이스에 아직 없음.
 */
export function eligiblePlayerHorses(state: GameState, meetingId: string, raceId: RaceId): PlayerHorseOption[] {
  const meeting = state.seasonState.meetings.find((m) => m.id === meetingId);
  const sr = meeting?.races.find((r) => r.race.id === raceId);
  if (meeting === undefined || sr === undefined) return [];
  if (sr.status !== 'open') return [];
  if (sr.declarations.length >= sr.race.maxRunners) return [];

  const out: PlayerHorseOption[] = [];
  for (const horse of Object.values(state.horses).sort(byId)) {
    if (!isPlayerHorse(state, horse)) continue;
    if (horse.nameRegistered === false || horse.trainerId === null) continue;
    if (sr.declarations.some((d) => d.horseId === horse.id)) continue;
    if (declaredInWeek(state, meeting.date, horse.id)) continue;
    if (!isEligible(horse, sr.race, meeting.date, state.seasonState)) continue;
    out.push({ id: horse.id, name: displayName(state, horse) });
  }
  return out;
}

/** 플레이어 말이 출주 접수돼 있고 아직 결과가 나오지 않은(open·closed) 레이스가 있는가 */
export function hasPendingPlayerRace(state: GameState): boolean {
  return state.seasonState.meetings.some((m) =>
    m.races.some(
      (sr) => (sr.status === 'open' || sr.status === 'closed') && sr.declarations.some((d) => d.isPlayer),
    ),
  );
}

// ── 최근 결과 ───────────────────────────────────────────────────

export interface RecentPlayerRun {
  horseId: HorseId;
  name: string;
  /** 착순(1부터) */
  position: number;
}

export interface RecentResultView {
  key: string;
  date: GameDate;
  dateLabel: string;
  raceName: string;
  /** 1착마 이름. 없으면 '—' */
  winnerName: string;
  /** 이 레이스에서 나온 플레이어 말(없으면 빈 배열, G1 결과만 보는 경우) */
  playerRuns: RecentPlayerRun[];
}

const NO_VALUE = '—';

/** 레이스 이름과 등급: 다시보기 목록 → 고정 일정 목록 → 없음 순으로 찾는다 */
function raceInfoOf(state: GameState, raceId: RaceId): { name: string; grade: Race['grade'] } {
  const replay = state.seasonState.replayable.find((r) => r.race.id === raceId);
  if (replay !== undefined) return { name: replay.race.name, grade: replay.race.grade };
  const template = getRaceTemplates().find((t) => t.id === raceId);
  if (template !== undefined) return { name: template.name, grade: template.grade };
  return { name: GENERATED_RACE_NAME, grade: null };
}

/**
 * 최근 결과 n개(최신순). 플레이어 말이 나온 레이스와 G1 결과만 고른다.
 * 결과 표시: 날짜 · 레이스 · 우승마 · 플레이어 말 착순.
 */
export function recentResults(state: GameState, n: number): RecentResultView[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`recentResults: n 은 0 이상의 정수여야 한다: ${n}`);
  }
  const picked: RecentResultView[] = [];
  for (let i = state.raceResults.length - 1; i >= 0 && picked.length < n; i--) {
    const result: RaceResult | undefined = state.raceResults[i];
    if (result === undefined) continue;
    const info = raceInfoOf(state, result.raceId);
    const playerRuns: RecentPlayerRun[] = result.runners
      .filter((r) => state.horses[r.horseId]?.ownerId === state.playerOwnerId)
      .map((r) => ({ horseId: r.horseId, name: nameOfHorse(state, r.horseId), position: r.position }));
    if (playerRuns.length === 0 && info.grade !== 'G1') continue;

    const winner = result.runners.find((r) => r.position === 1);
    picked.push({
      key: `${i}-${result.raceId}`,
      date: { ...result.date },
      dateLabel: formatDateKo(result.date),
      raceName: info.name,
      winnerName: winner === undefined ? NO_VALUE : nameOfHorse(state, winner.horseId),
      playerRuns,
    });
  }
  return picked;
}
