import {
  CONDITION_MAX,
  CONDITION_MIN,
  FATIGUE_GAIN_BY_DISTANCE,
  FATIGUE_GAIN_LONG,
  FITNESS_LOSS_PER_RUN,
  PLACED_MAX_POSITION,
  REPLAYABLE_MAX,
} from '../config/season';
import type { SampleField } from '../race/sampleField';
import { applyRatingsInPlace } from './handicapper';
import type {
  CareerRecord,
  Declaration,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  LeadingCategory,
  LeadingEntry,
  LeadingTables,
  Meeting,
  Race,
  RaceResult,
  ReplayableRace,
  RunnerResult,
  ScheduledRace,
  SeriesDefinition,
  SeriesProgress,
} from '../types';

export interface ApplyRaceResultArgs {
  /** 개최일(id·날짜만 쓴다) */
  meeting: Meeting;
  /** 확정된 개최 레이스(declarations 에 jockeyId·trainerId·ownerId 가 있어야 한다) */
  scheduled: ScheduledRace;
  result: RaceResult;
  /** runRace·summarizeRace 에 넣은 필드(다시보기 재생 입력) */
  field: SampleField;
  series: readonly SeriesDefinition[];
}

export interface ApplyRaceResultOutput {
  state: GameState;
  events: GameEvent[];
}

/** 거리별 피로 증가량 */
function fatigueGainFor(distance: number): number {
  for (const band of FATIGUE_GAIN_BY_DISTANCE) {
    if (distance <= band.maxDistance) return band.gain;
  }
  return FATIGUE_GAIN_LONG;
}

function clampCondition(v: number): number {
  return Math.min(CONDITION_MAX, Math.max(CONDITION_MIN, v));
}

function requireHorse(state: GameState, id: HorseId): Horse {
  const horse = state.horses[id];
  if (horse === undefined) throw new Error(`applyRaceResult: 말 ${id} 없음`);
  return horse;
}

function requireDeclaration(scheduled: ScheduledRace, horseId: HorseId): Declaration {
  const decl = scheduled.declarations.find((d) => d.horseId === horseId);
  if (decl === undefined) throw new Error(`applyRaceResult: 말 ${horseId} 의 출주 선언이 없다`);
  return decl;
}

/**
 * 주자별 상금. 기본은 착순별 prizeMoney[pos−1](없으면 0).
 * 동착은 그 착순들이 점유한 상금을 나눈다(합계 보존, 나머지 1원은 앞 주자부터). 동착이 없으면 명세 그대로다.
 */
function payoutsOf(race: Race, runners: readonly RunnerResult[]): number[] {
  const out: number[] = runners.map(() => 0);
  let i = 0;
  while (i < runners.length) {
    const first = runners[i];
    if (first === undefined) break;
    const pos = first.position;
    let j = i;
    while (j < runners.length && runners[j]?.position === pos) j += 1;
    const k = j - i;
    let total = 0;
    for (let p = pos; p < pos + k; p++) {
      total += race.prizeMoney[p - 1] ?? 0;
    }
    const base = Math.floor(total / k);
    const rem = total - base * k;
    for (let m = 0; m < k; m++) {
      out[i + m] = base + (m < rem ? 1 : 0);
    }
    i = j;
  }
  return out;
}

/** 리딩 한 줄에 출주 한 번을 더한다 */
function addLeading(
  tables: LeadingTables,
  category: LeadingCategory,
  id: string,
  delta: { won: boolean; placed: boolean; groupWin: boolean; prize: number },
): void {
  const table = tables[category];
  const entry: LeadingEntry = table[id] ?? {
    id,
    runners: 0,
    wins: 0,
    places: 0,
    groupWins: 0,
    earnings: 0,
  };
  entry.runners += 1;
  if (delta.won) entry.wins += 1;
  if (delta.placed) entry.places += 1;
  if (delta.groupWin) entry.groupWins += 1;
  entry.earnings += delta.prize;
  table[id] = entry;
}

/** (seriesId, year) 진행 상태. 같은 해의 것이 없으면 새로 만든다 */
function ensureProgress(state: GameState, seriesId: string, year: number): SeriesProgress {
  const existing = state.seasonState.series[seriesId];
  if (existing !== undefined && existing.year === year) return existing;
  const fresh: SeriesProgress = { seriesId, year, legWinners: {}, points: {}, champion: null };
  state.seasonState.series[seriesId] = fresh;
  return fresh;
}

/**
 * 레이스 결과를 게임 상태에 직접 반영한다(state 를 고친다). 복제하지 않으므로 시즌 시스템 안에서 쓴다.
 * 상금·말 성적·컨디션·리딩·시리즈·결과 보존·다시보기·race_run / series_completed 이벤트를 처리하고 이벤트를 돌려준다.
 */
export function applyRaceResultInPlace(state: GameState, args: ApplyRaceResultArgs): GameEvent[] {
  const { meeting, scheduled, result, field, series } = args;
  const race = scheduled.race;

  if (field.requests.length !== result.runners.length) {
    throw new Error(
      `applyRaceResult: 출주 요청(${field.requests.length})과 결과 두수(${result.runners.length})가 다르다`,
    );
  }
  const playerIds = new Set(field.requests.filter((r) => r.isPlayer).map((r) => r.horseId));
  const hasPlayer = playerIds.size > 0;
  const winner = result.runners[0];
  if (winner === undefined) throw new Error('applyRaceResult: 결과에 주자가 없다');

  const next = state;
  const events: GameEvent[] = [];
  const gain = fatigueGainFor(race.distance);
  const date = { year: meeting.date.year, week: meeting.date.week };

  // 1. 주자별: 상금·성적·컨디션·마주 자금·최근 출주일·리딩
  const payouts = payoutsOf(race, result.runners);
  for (const [idx, runner] of result.runners.entries()) {
    const horse = requireHorse(next, runner.horseId);
    const decl = requireDeclaration(scheduled, runner.horseId);
    const owner = next.owners[decl.ownerId];
    if (owner === undefined) throw new Error(`applyRaceResult: 마주 ${decl.ownerId} 없음`);

    const pos = runner.position;
    const prize = payouts[idx] ?? 0;
    const won = pos === 1;
    const placed = pos <= PLACED_MAX_POSITION;
    const isGroup = race.grade !== null && race.grade !== 'L';
    const groupWin = isGroup && won;

    const rec: CareerRecord = horse.record;
    rec.starts += 1;
    if (won) rec.wins += 1;
    if (pos === 2) rec.seconds += 1;
    if (pos === 3) rec.thirds += 1;
    if (race.grade !== null && placed) rec.blackTypePlacings += 1;
    if (groupWin) rec.groupWins += 1;
    rec.earnings += prize;

    horse.condition.fatigue = clampCondition(horse.condition.fatigue + gain);
    horse.condition.fitness = clampCondition(horse.condition.fitness - FITNESS_LOSS_PER_RUN);

    owner.funds += prize;
    next.seasonState.lastRun[horse.id] = { ...date };

    const tables = next.seasonState.leading;
    const sireId = horse.sireId;
    if (sireId !== null) {
      addLeading(tables, 'sire', sireId, { won, placed, groupWin, prize });
    }
    const dam = horse.damId === null ? undefined : next.horses[horse.damId];
    const damsireId = dam?.sireId ?? null;
    if (damsireId !== null) {
      addLeading(tables, 'damsire', damsireId, { won, placed, groupWin, prize });
    }
    addLeading(tables, 'jockey', runner.jockeyId, { won, placed, groupWin, prize });
    if (decl.trainerId !== null) {
      addLeading(tables, 'trainer', decl.trainerId, { won, placed, groupWin, prize });
    }
    addLeading(tables, 'owner', decl.ownerId, { won, placed, groupWin, prize });
    if (horse.breederId !== null) {
      addLeading(tables, 'breeder', horse.breederId, { won, placed, groupWin, prize });
    }
  }

  // 1b. OR 갱신(M3-C3): 레이스 전 OR 기준으로 PR 을 계산해 OR·첫 OR 대기분을 갱신
  applyRatingsInPlace(next, race, result, date);

  // 2. 시리즈: 이 레이스가 레그인 시리즈만
  const templateId = scheduled.templateId;
  if (templateId !== null) {
    for (const def of series) {
      if (!def.legs.includes(templateId)) continue;
      const progress = ensureProgress(next, def.id, meeting.date.year);

      if (def.kind === 'crown') {
        progress.legWinners[templateId] = winner.horseId;
        const winnerLegs = Object.keys(progress.legWinners).filter(
          (leg) => progress.legWinners[leg] === winner.horseId,
        );
        const required = def.winsRequired ?? def.legs.length;
        const requiredOk = (def.requiredLegs ?? []).every((leg) => winnerLegs.includes(leg));
        if (progress.champion === null && winnerLegs.length >= required && requiredOk) {
          progress.champion = winner.horseId;
          const winnerDecl = requireDeclaration(scheduled, winner.horseId);
          const owner = next.owners[winnerDecl.ownerId];
          if (owner === undefined) throw new Error(`applyRaceResult: 마주 ${winnerDecl.ownerId} 없음`);
          owner.funds += def.bonus;
          events.push({ type: 'series_completed', seriesId: def.id, horseId: winner.horseId, date: { ...date } });
        }
      } else {
        const table = def.pointsByPosition ?? [];
        for (const runner of result.runners) {
          const pts = table[runner.position - 1];
          if (runner.position <= table.length && pts !== undefined) {
            progress.points[runner.horseId] = (progress.points[runner.horseId] ?? 0) + pts;
          }
        }
      }
    }
  }

  // 3. 결과 보존: 그룹·리스티드 또는 플레이어 말 출주
  const keepResult = race.grade !== null || hasPlayer;
  if (keepResult) {
    next.raceResults.push(structuredClone(result));
  }

  // 4. 다시보기: 플레이어 말 출주 또는 G1
  if (hasPlayer || race.grade === 'G1') {
    const replay: ReplayableRace = {
      meetingId: meeting.id,
      race: structuredClone(race),
      going: result.going,
      date: { ...date },
      seed: result.seed,
      field: structuredClone(field),
    };
    next.seasonState.replayable = [replay, ...next.seasonState.replayable].slice(0, REPLAYABLE_MAX);
  }

  // 5. 이벤트: race_run (그룹·리스티드 또는 플레이어 말 출주)
  if (keepResult) {
    const playerHorseIds = result.runners
      .filter((r: RunnerResult) => playerIds.has(r.horseId))
      .map((r) => r.horseId);
    events.unshift({
      type: 'race_run',
      raceId: race.id,
      meetingId: meeting.id,
      date: { ...date },
      winnerId: winner.horseId,
      playerHorseIds,
    });
  }

  return events;
}

/**
 * 레이스 결과를 게임 상태에 반영한다. 입력 state 는 바꾸지 않고 복제본을 고쳐 돌려준다(테스트·외부용 래퍼).
 * 시즌 시스템은 applyRaceResultInPlace 를 쓴다.
 */
export function applyRaceResult(state: GameState, args: ApplyRaceResultArgs): ApplyRaceResultOutput {
  const next = structuredClone(state);
  const events = applyRaceResultInPlace(next, args);
  return { state: next, events };
}
