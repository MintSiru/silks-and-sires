/**
 * 라이벌 마주(M5-D1). 설계: docs/m5-plan.md 결정 4·5. 밸런스 상수는 config/rivals.ts.
 * 주간 시스템 createRivalsSystem() (id 'rivals'):
 *  - 매주: 사라진 마주 비활성 → 대레이스(G1·클래식)에서 플레이어 말을 앞선 우승 마주('big_race' 후보)
 *    → 그룹 레이스 맞대결 집계 → 세일에서 플레이어가 큰 입찰로 진 로트의 낙찰 마주('sale_battle' 후보)
 *  - 연초 1주(RIVAL_YEARLY_WEEK): 경쟁심 감소·비활성, 플레이어 현역마나 번식 사업이 있으면 'same_tier' 선정 1명
 * 난수: 선정만 createRng(`${initialSeed}:rival:${year}`) 독립 스트림. 공용 ctx.rng 는 쓰지 않는다.
 * 효과(세일 입찰 상한·대레이스 출주 가중)는 아직 없다(M5-D2). 이 시스템은 state.rivals·이벤트·연대기만 바꾼다.
 * 등록 위치: 세일(sales) 뒤, 연대기(chronicle) 앞 — 세일 로트 결과와 그 주 레이스 결과를 읽는다.
 */
import {
  RIVAL_INTENSITY_CLASH,
  RIVAL_INTENSITY_DECAY,
  RIVAL_INTENSITY_MAX,
  RIVAL_INTENSITY_START,
  RIVAL_MAX_ACTIVE,
  RIVAL_PRIZE_UNIT,
  RIVAL_SALE_BATTLE_MIN,
  RIVAL_SAME_COUNTRY_WEIGHT,
  RIVAL_TIER_RANK,
  RIVAL_YEARLY_WEEK,
} from '../config/rivals';
import { getRaceTemplates, getSalesData } from '../data/staticData';
import { createRng } from '../rng';
import { addWeeks } from '../time/calendar';
import { pickWeightedIndex } from '../world/population';
import type {
  ChronicleEntry,
  CountryCode,
  GameDate,
  GameEvent,
  GameState,
  HorseId,
  HorseStatus,
  Owner,
  OwnerId,
  RaceId,
  RaceResult,
  RaceTemplate,
  Rival,
  RivalReason,
  WeeklySystem,
} from '../types';
import { appendChronicle, hasChronicle } from './chronicle';

/** 현역(출주 중·휴양) 상태와 번식 사업(어미말·종마) 상태 */
const RACING_STATUSES: readonly HorseStatus[] = ['in_training', 'resting'];
const BREEDING_STATUSES: readonly HorseStatus[] = ['broodmare', 'stud'];
/** 1착의 착순 값(착순은 1부터) */
const WINNING_POSITION = 1;

/** 화면용 라이벌 한 줄(rivals()). 활성 라이벌이 먼저, 그다음 지난 라이벌(최근 지정 순) */
export interface RivalView {
  ownerId: OwnerId;
  /** 마주 이름(가상). 마주가 state 에 없으면 null */
  name: string | null;
  country: CountryCode | null;
  reason: RivalReason;
  since: number;
  active: boolean;
  intensity: number;
  playerAhead: number;
  rivalAhead: number;
  /** 이 라이벌과의 맞대결 연대기 항목(오래된 순). 플레이어 항목이라 보존된다 */
  clashes: ChronicleEntry[];
}

interface Best {
  ownerId: OwnerId;
  position: number;
  horseId: HorseId;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sameDate(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

function ownerOfHorse(state: GameState, horseId: HorseId): OwnerId | null {
  return state.horses[horseId]?.ownerId ?? null;
}

/** 대레이스: G1 또는 클래식 유형 */
function isBigRace(template: RaceTemplate): boolean {
  return template.grade === 'G1' || template.tags.includes('classic');
}

/** 그룹 레이스(G1·G2·G3). 리스티드는 맞대결 집계 대상이 아니다 */
function isGroupRace(template: RaceTemplate): boolean {
  return template.grade === 'G1' || template.grade === 'G2' || template.grade === 'G3';
}

/** 조건에 맞는 주자 중 가장 앞선 말(착순이 같으면 마주 id 오름차순) */
function bestRunner(state: GameState, result: RaceResult, wanted: (ownerId: OwnerId) => boolean): Best | null {
  let best: Best | null = null;
  for (const runner of result.runners) {
    const ownerId = ownerOfHorse(state, runner.horseId);
    if (ownerId === null || !wanted(ownerId)) continue;
    const candidate: Best = { ownerId, position: runner.position, horseId: runner.horseId };
    if (best === null || candidate.position < best.position
      || (candidate.position === best.position && compareIds(candidate.ownerId, best.ownerId) < 0)) {
      best = candidate;
    }
  }
  return best;
}

function activeRivals(state: GameState): Rival[] {
  return (state.rivals ?? []).filter((rival) => rival.active);
}

function hasSlot(state: GameState): boolean {
  return activeRivals(state).length < RIVAL_MAX_ACTIVE;
}

function clampIntensity(value: number): number {
  return Math.min(RIVAL_INTENSITY_MAX, Math.max(0, value));
}

function racingCount(state: GameState, owner: Owner): number {
  return owner.horseIds.filter((id) => {
    const horse = state.horses[id];
    return horse !== undefined && RACING_STATUSES.includes(horse.status);
  }).length;
}

/** 보유 말의 누적 상금 합(€). '최근 상금'의 근사: 연초 1주에는 시즌 리딩이 이미 비워져 있어 보유마 기록을 쓴다 */
function prizeOf(state: GameState, owner: Owner): number {
  return owner.horseIds.reduce((sum, id) => sum + (state.horses[id]?.record.earnings ?? 0), 0);
}

/** 플레이어가 현역마나 번식 사업(어미말·종마)을 가지고 있는가 */
function playerInBusiness(state: GameState): boolean {
  return Object.values(state.horses).some((horse) => horse.ownerId === state.playerOwnerId
    && (RACING_STATUSES.includes(horse.status) || BREEDING_STATUSES.includes(horse.status)));
}

/** 라이벌 지정(또는 지난 라이벌 재지정). 이벤트와 연대기를 남긴다. 자리 확인은 호출자가 한다 */
function declareRival(draft: GameState, ownerId: OwnerId, reason: RivalReason, now: GameDate, events: GameEvent[]): void {
  const list = (draft.rivals ??= []);
  const past = list.find((rival) => rival.ownerId === ownerId);
  if (past !== undefined) {
    past.since = now.year;
    past.reason = reason;
    past.intensity = RIVAL_INTENSITY_START;
    past.active = true;
  } else {
    list.push({ ownerId, since: now.year, reason, playerAhead: 0, rivalAhead: 0, intensity: RIVAL_INTENSITY_START, active: true });
  }
  events.push({ type: 'rival_declared', ownerId, reason, date: { ...now } });
  appendChronicle(draft, { kind: 'rival_declared', date: { ...now }, player: true, ownerId });
}

/**
 * 후보 마주 처리. 이미 활성 라이벌이면 세일 경합만 경쟁심을 올린다(대레이스 경쟁은 맞대결 집계가 올린다 — 이중 계산 방지).
 * 라이벌이 아니면 자리가 있을 때만 지정한다. 지난 라이벌이면 되살린다.
 */
function considerRival(draft: GameState, ownerId: OwnerId, reason: RivalReason, now: GameDate, events: GameEvent[]): void {
  const owner: Owner | undefined = draft.owners[ownerId];
  if (owner === undefined || owner.isPlayer || ownerId === draft.playerOwnerId) return;
  const current = (draft.rivals ?? []).find((rival) => rival.ownerId === ownerId && rival.active);
  if (current !== undefined) {
    if (reason === 'sale_battle') current.intensity = clampIntensity(current.intensity + RIVAL_INTENSITY_CLASH);
    return;
  }
  if (hasSlot(draft)) declareRival(draft, ownerId, reason, now, events);
}

/** 사라진 마주(파산·정리로 state.owners 에서 없어짐)의 라이벌은 비활성(기록은 남긴다) */
function deactivateVanished(draft: GameState): void {
  for (const rival of draft.rivals ?? []) {
    if (rival.active && draft.owners[rival.ownerId] === undefined) rival.active = false;
  }
}

/** 선정 가중: 같은 나라 배율 / (1 + 등급 차 + 현역마 수 차 + 누적 상금 차, 로그 척도) */
function candidateWeight(state: GameState, owner: Owner, player: Owner): number {
  const tierGap = Math.abs(RIVAL_TIER_RANK[owner.tier] - RIVAL_TIER_RANK[player.tier]);
  const horseGap = Math.abs(Math.log1p(racingCount(state, owner)) - Math.log1p(racingCount(state, player)));
  const prizeGap = Math.abs(
    Math.log1p(prizeOf(state, owner) / RIVAL_PRIZE_UNIT) - Math.log1p(prizeOf(state, player) / RIVAL_PRIZE_UNIT),
  );
  const country = owner.country === player.country ? RIVAL_SAME_COUNTRY_WEIGHT : 1;
  return country / (1 + tierGap + horseGap + prizeGap);
}

/** 연초 'same_tier' 선정: 플레이어가 현역마·번식 사업이 있고 자리가 있을 때 AI 마주 1명(독립 스트림) */
function selectSameTier(draft: GameState, now: GameDate, events: GameEvent[]): void {
  const player: Owner | undefined = draft.owners[draft.playerOwnerId];
  if (player === undefined || !playerInBusiness(draft) || !hasSlot(draft)) return;
  const rivals = draft.rivals ?? [];
  // 같은 해 same_tier 지정이 이미 있으면 건너뛴다(연초 1주가 두 번 실행돼도 한 명)
  if (rivals.some((rival) => rival.since === now.year && rival.reason === 'same_tier')) return;
  const known = new Set(rivals.map((rival) => rival.ownerId));
  const pool = Object.values(draft.owners)
    .filter((owner) => !owner.isPlayer && owner.id !== player.id && !known.has(owner.id) && racingCount(draft, owner) > 0)
    .sort((a, b) => compareIds(a.id, b.id));
  if (pool.length === 0) return;
  const weights = pool.map((owner) => candidateWeight(draft, owner, player));
  const rng = createRng(`${draft.initialSeed}:rival:${now.year}`);
  const picked = pool[pickWeightedIndex(rng, weights)];
  if (picked === undefined) return;
  declareRival(draft, picked.id, 'same_tier', now, events);
}

/** 연초: 활성 라이벌 경쟁심 감소(0 이하면 지난 라이벌), 그다음 선정. 이번 해 지정된 라이벌은 감소하지 않는다(순서) */
function yearlyStep(draft: GameState, now: GameDate, events: GameEvent[]): void {
  for (const rival of draft.rivals ?? []) {
    if (!rival.active) continue;
    rival.intensity -= RIVAL_INTENSITY_DECAY;
    if (rival.intensity <= 0) {
      rival.intensity = 0;
      rival.active = false;
    }
  }
  selectSameTier(draft, now, events);
}

/** 이번 주 대레이스에서 플레이어 말을 앞선 우승 마주를 후보로 준다. 플레이어 말이 1착이거나 없으면 후보 없음 */
function bigRaceCandidates(draft: GameState, now: GameDate, templates: ReadonlyMap<RaceId, RaceTemplate>, events: GameEvent[]): void {
  for (const result of draft.raceResults) {
    if (!sameDate(result.date, now)) continue;
    const template = templates.get(result.raceId);
    if (template === undefined || !isBigRace(template)) continue;
    const playerBest = bestRunner(draft, result, (id) => id === draft.playerOwnerId);
    if (playerBest === null || playerBest.position <= WINNING_POSITION) continue;
    const winners = new Set<OwnerId>();
    for (const runner of result.runners) {
      if (runner.position !== WINNING_POSITION) continue;
      const ownerId = ownerOfHorse(draft, runner.horseId);
      if (ownerId !== null && ownerId !== draft.playerOwnerId) winners.add(ownerId);
    }
    for (const ownerId of [...winners].sort(compareIds)) considerRival(draft, ownerId, 'big_race', now, events);
  }
}

/** 이 레이스에 맞대결 연대기가 이미 있는가(같은 날짜·같은 레이스) */
function clashRecorded(draft: GameState, raceId: RaceId, now: GameDate): boolean {
  return hasChronicle(draft, 'rival_clash', undefined, raceId)
    && (draft.chronicle ?? []).some((e) => e.kind === 'rival_clash' && e.raceId === raceId && sameDate(e.date, now));
}

/**
 * 그룹 레이스 맞대결: 플레이어 말 중 최상위 대 라이벌 말 중 최상위를 한 번 비교한다.
 * 동착이면 앞선 쪽이 없으므로 집계·이벤트·연대기를 남기지 않는다.
 */
function clashes(draft: GameState, now: GameDate, templates: ReadonlyMap<RaceId, RaceTemplate>, events: GameEvent[]): void {
  const rivals = activeRivals(draft);
  if (rivals.length === 0) return;
  const byOwner = new Map(rivals.map((rival) => [rival.ownerId, rival] as const));
  for (const result of draft.raceResults) {
    if (!sameDate(result.date, now)) continue;
    const template = templates.get(result.raceId);
    if (template === undefined || !isGroupRace(template)) continue;
    const player = bestRunner(draft, result, (id) => id === draft.playerOwnerId);
    const rival = bestRunner(draft, result, (id) => byOwner.has(id));
    if (player === null || rival === null || clashRecorded(draft, result.raceId, now)) continue;
    if (player.position === rival.position) continue;
    const entry = byOwner.get(rival.ownerId);
    if (entry === undefined) continue;
    const playerAhead = player.position < rival.position;
    if (playerAhead) entry.playerAhead += 1;
    else entry.rivalAhead += 1;
    entry.intensity = clampIntensity(entry.intensity + RIVAL_INTENSITY_CLASH);
    events.push({ type: 'rival_clash', ownerId: rival.ownerId, raceId: result.raceId, playerAhead, date: { ...now } });
    appendChronicle(draft, {
      kind: 'rival_clash',
      date: { ...now },
      player: true,
      horseId: player.horseId,
      raceId: result.raceId,
      label: template.name,
      ownerId: rival.ownerId,
      count: entry.playerAhead + entry.rivalAhead,
    });
  }
}

/**
 * 세일 경합: 이번 주가 북 주인 로트 중 플레이어가 RIVAL_SALE_BATTLE_MIN 이상 입찰했다가 진 로트의 낙찰 마주를 후보로 준다.
 * sales 시스템이 같은 주에 먼저 로트를 처리한 결과(lot.result)를 읽는다. 플레이어가 실제로 유효 입찰했는지는
 * 다시 판정하지 않는다(자금 변화 때문에): 입찰 상한이 있고 낙찰자가 플레이어가 아니면 '진 것'으로 본다.
 */
function saleBattles(draft: GameState, now: GameDate, events: GameEvent[]): void {
  const eventById = new Map(getSalesData().events.map((event) => [event.id, event] as const));
  for (const bid of draft.sales.playerBids) {
    if (bid.maxBid < RIVAL_SALE_BATTLE_MIN) continue;
    const catalogue = draft.sales.catalogues.find((c) => c.saleId === bid.saleId && c.year === bid.year);
    const lot = catalogue?.lots.find((l) => l.lotNo === bid.lotNo);
    const event = eventById.get(bid.saleId);
    if (catalogue === undefined || lot === undefined || event === undefined) continue;
    const book = event.books.find((b) => b.book === lot.book);
    if (book === undefined || !sameDate(addWeeks({ year: catalogue.year, week: event.week }, book.weekOffset), now)) continue;
    const result = lot.result;
    if (result === null || result.kind !== 'sold' || result.buyerId === draft.playerOwnerId) continue;
    considerRival(draft, result.buyerId, 'sale_battle', now, events);
  }
}

/**
 * 라이벌 주간 시스템. 난수는 독립 스트림만 쓰고 ctx.rng 는 건드리지 않는다.
 * 라이벌·세일 경합·맞대결 후보가 없으면 draft 를 바꾸지 않는다(라이벌 배열도 만들지 않는다).
 */
export function createRivalsSystem(): WeeklySystem {
  return {
    id: 'rivals',
    run(draft, ctx): GameEvent[] {
      const now: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const events: GameEvent[] = [];
      const templates = new Map(getRaceTemplates().map((template) => [template.id, template] as const));
      deactivateVanished(draft);
      if (now.week === RIVAL_YEARLY_WEEK) yearlyStep(draft, now, events);
      bigRaceCandidates(draft, now, templates, events);
      clashes(draft, now, templates, events);
      saleBattles(draft, now, events);
      return events;
    },
  };
}

/**
 * 화면용 조회: 활성 라이벌이 먼저(경쟁심 높은 순 아님, 최근 지정 순), 그다음 지난 라이벌.
 * 맞대결 기록은 연대기의 rival_clash 항목을 모은다. 순수 함수(복사본을 돌려준다).
 */
export function rivalViews(state: GameState): RivalView[] {
  const chronicle = state.chronicle ?? [];
  return [...(state.rivals ?? [])]
    .sort((a, b) => Number(b.active) - Number(a.active) || b.since - a.since || compareIds(a.ownerId, b.ownerId))
    .map((rival): RivalView => {
      const owner: Owner | undefined = state.owners[rival.ownerId];
      return {
        ownerId: rival.ownerId,
        name: owner?.name ?? null,
        country: owner?.country ?? null,
        reason: rival.reason,
        since: rival.since,
        active: rival.active,
        intensity: rival.intensity,
        playerAhead: rival.playerAhead,
        rivalAhead: rival.rivalAhead,
        clashes: chronicle
          .filter((e) => e.kind === 'rival_clash' && e.ownerId === rival.ownerId)
          .map((e) => ({ ...e, date: { ...e.date } })),
      };
    });
}
