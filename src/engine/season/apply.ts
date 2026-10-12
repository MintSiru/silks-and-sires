import {
  CONDITION_MAX,
  CONDITION_MIN,
  FATIGUE_GAIN_BY_DISTANCE,
  FATIGUE_GAIN_LONG,
  FITNESS_LOSS_PER_RUN,
  PLACED_MAX_POSITION,
  PERFORMANCE_RECORD_MIN_PR,
  RACE_RATING_DECIMALS,
  RACE_RATING_TOP_N,
  REPLAYABLE_MAX,
} from '../config/season';
import { NICK_REVEAL_GRADES, NICK_REVEAL_MIN_VALUE } from '../config/offspring';
import { damsireLineOf, revealNick } from '../breeding/season';
import { emptyOffspringStats, recordOffspringRun } from '../breeding/offspring';
import { nickValue } from '../breeding/nicks';
import type { SampleField } from '../race/sampleField';
import { recordMoney } from '../economy/ledger';
import { applyRatingsInPlace } from './handicapper';
import { emptyLeadingTables } from './state';
import type {
  CareerRecord,
  CountryCode,
  Declaration,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  LeadingCategory,
  LeadingEntry,
  LeadingTables,
  Meeting,
  NickEntry,
  PerformanceEntry,
  Race,
  RaceRatingEntry,
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
  /** 레이스 개최국(나라별 리딩·퍼포먼스 기록에 쓴다) */
  country: CountryCode;
  /** 닉스 표(data/breeding/nicks.json). 그룹 우승 때 성적 공개 판정에 쓴다(M3-C4). 테스트는 [] 또는 테스트 표 */
  nicks: readonly NickEntry[];
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
  const { meeting, scheduled, result, field, series, country } = args;
  const race = scheduled.race;
  const templateId = scheduled.templateId;

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
  // 개최국 리딩 표(없으면 빈 표로 만든다). 유럽 합산 leading 과 같은 규칙으로 함께 쓴다
  const countryTables = (next.seasonState.leadingByCountry[country] ??= emptyLeadingTables());

  // 1. 주자별: 상금·성적·컨디션·마주 자금·최근 출주일·리딩(유럽 합산 + 개최국)
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

    // 아비 자마 성적(M3-C4): 이번 출주가 그 말의 첫 출주·첫 우승·첫 그룹 우승인지 경력 기록으로 판정한다
    if (horse.sireId !== null) {
      const stats = (next.sireStats[horse.sireId] ??= emptyOffspringStats());
      recordOffspringRun(stats, {
        firstStart: rec.starts === 1,
        becameWinner: won && rec.wins === 1,
        won,
        groupWin,
        firstGroupWin: groupWin && rec.groupWins === 1,
        earnings: prize,
        distance: race.distance,
      });
    }

    horse.condition.fatigue = clampCondition(horse.condition.fatigue + gain);
    horse.condition.fitness = clampCondition(horse.condition.fitness - FITNESS_LOSS_PER_RUN);

    recordMoney(next, decl.ownerId, 'prize', prize, date, horse.id);
    next.seasonState.lastRun[horse.id] = { ...date };

    const delta = { won, placed, groupWin, prize };
    const tables = next.seasonState.leading;
    /** 유럽 합산 표와 개최국 표에 같은 출주를 더한다 */
    const addBoth = (category: LeadingCategory, id: string): void => {
      addLeading(tables, category, id, delta);
      addLeading(countryTables, category, id, delta);
    };
    const sireId = horse.sireId;
    if (sireId !== null) {
      addBoth('sire', sireId);
    }
    const dam = horse.damId === null ? undefined : next.horses[horse.damId];
    const damsireId = dam?.sireId ?? null;
    if (damsireId !== null) {
      addBoth('damsire', damsireId);
    }
    addBoth('jockey', runner.jockeyId);
    if (decl.trainerId !== null) {
      addBoth('trainer', decl.trainerId);
    }
    addBoth('owner', decl.ownerId);
    if (horse.breederId !== null) {
      addBoth('breeder', horse.breederId);
    }
  }

  // 1a. 닉스 공개(M3-C4): 그룹(G1~G3) 1착 말의 부 계통 × 모부 계통이 좋은 닉스(값 ≥ 기준)이고 처음 공개되면 이벤트
  if (race.grade !== null && NICK_REVEAL_GRADES.includes(race.grade)) {
    for (const runner of result.runners) {
      if (runner.position !== 1) continue;
      const winnerHorse = requireHorse(next, runner.horseId);
      const winnerDam = winnerHorse.damId === null ? undefined : next.horses[winnerHorse.damId];
      const sireLineId = winnerHorse.sireLineId;
      const damsireLineId = winnerDam === undefined ? null : damsireLineOf(next, winnerDam);
      if (sireLineId === null || damsireLineId === null) continue;
      if (nickValue(args.nicks, sireLineId, damsireLineId) < NICK_REVEAL_MIN_VALUE) continue;
      if (!revealNick(next, sireLineId, damsireLineId)) continue;
      events.push({
        type: 'nick_revealed',
        sireLineId,
        damsireLineId,
        horseId: runner.horseId,
        date: { ...date },
      });
    }
  }

  // 1b. OR 갱신(M3-C3): 레이스 전 OR 기준으로 PR 을 계산해 OR·첫 OR 대기분을 갱신
  const prs = applyRatingsInPlace(next, race, result, date);

  // 1c. 퍼포먼스 기록(M3-E1a): 출주마 전원에 PR 을 남기고, 그룹 레이스는 상위 N두 PR 평균을 레이스 레이팅으로 남긴다
  // 날짜 객체는 레이스 하나당 한 번만 만든다(주간 state 복제 비용을 줄인다. 값은 모두 같다)
  const raceDate = { ...date };
  for (const runner of result.runners) {
    const pr = prs.get(runner.horseId);
    if (pr === undefined) throw new Error(`applyRaceResult: 말 ${runner.horseId} 의 PR 없음`);
    // 시상 입력만 남긴다: 블랙타입 레이스이거나 PR 이 기준 이상(하위 핸디캡 기록은 시상에 쓰이지 않아 버린다)
    if (race.grade === null && pr < PERFORMANCE_RECORD_MIN_PR) continue;
    const entry: PerformanceEntry = {
      raceId: race.id,
      templateId,
      date: raceDate,
      grade: race.grade,
      distance: race.distance,
      country,
      position: runner.position,
      pr,
    };
    const list = next.seasonState.performances[runner.horseId] ?? [];
    list.push(entry);
    next.seasonState.performances[runner.horseId] = list;
  }
  // 그룹 레이스(G1·G2·G3)만. 리스티드(L)는 그룹이 아니므로 레이스 레이팅을 남기지 않는다
  const raceGrade = race.grade;
  if (raceGrade !== null && raceGrade !== 'L') {
    const byPosition = [...result.runners].sort((a, b) => a.position - b.position);
    const top = byPosition.slice(0, RACE_RATING_TOP_N);
    const sum = top.reduce((acc, r) => acc + (prs.get(r.horseId) ?? 0), 0);
    const avg = sum / Math.max(1, top.length);
    const factor = 10 ** RACE_RATING_DECIMALS;
    const rating: RaceRatingEntry = {
      raceId: race.id,
      templateId,
      name: race.name,
      date: { ...date },
      grade: raceGrade,
      country,
      rating: Math.round(avg * factor) / factor,
    };
    next.seasonState.raceRatings.push(rating);
  }

  // 2. 시리즈: 이 레이스가 레그인 시리즈만
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
          recordMoney(next, winnerDecl.ownerId, 'series_bonus', def.bonus, date, winner.horseId);
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
