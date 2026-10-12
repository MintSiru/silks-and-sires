import { beforeAll, describe, expect, it } from 'vitest';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { declarePlayerHorse } from '../../src/engine/season/player';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { ageInYear } from '../../src/engine/time/calendar';
import type { GameState, HorseId, RaceId } from '../../src/engine/types';
import { eligiblePlayerHorses } from '../../src/ui/season/seasonView';
import { buildReplay, replayKey, replayList } from '../../src/ui/season/replayView';

const SEED = 20261011;
const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;
/** 플레이어 3세 지급마가 출주할 때까지 진행하는 최대 주 수(2세 경주는 15주부터 열린다) */
const MAX_WEEKS = 20;
/** 부트스트랩 + 여러 주 진행 제한 시간(ms) */
const MID_TIMEOUT = 300_000;

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  words: getHorseWords(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, MID_TIMEOUT);

/** 플레이어 소유 3세 이상 현역 지급마(id 오름차순 첫 말) */
function starterThreeYearOld(state: GameState): HorseId {
  const horse = Object.values(state.horses)
    .filter(
      (h) =>
        h.ownerId === state.playerOwnerId &&
        h.status === 'in_training' &&
        ageInYear(h.birthYear, state.date.year) >= 3,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  if (horse === undefined) throw new Error('테스트 전제 위반: 플레이어 3세 지급마가 없다');
  return horse.id;
}

function isDeclared(state: GameState, horseId: HorseId): boolean {
  return state.seasonState.meetings.some((m) =>
    m.races.some((sr) => sr.declarations.some((d) => d.horseId === horseId)),
  );
}

function findEligibleOpenRace(
  state: GameState,
  horseId: HorseId,
): { meetingId: string; raceId: RaceId } | undefined {
  for (const m of state.seasonState.meetings) {
    for (const sr of m.races) {
      if (sr.status !== 'open') continue;
      if (eligiblePlayerHorses(state, m.id, sr.race.id).some((h) => h.id === horseId)) {
        return { meetingId: m.id, raceId: sr.race.id };
      }
    }
  }
  return undefined;
}

/** 플레이어 3세 지급마를 출주시켜 결과가 나올 때까지 진행한 상태 */
function playerRaceState(): { state: GameState; horseId: HorseId } {
  const systems = createGameSystems(STATIC_GAME);
  let current = structuredClone(BASE);
  const horseId = starterThreeYearOld(current);
  for (let week = 0; week < MAX_WEEKS; week++) {
    if (!isDeclared(current, horseId)) {
      const target = findEligibleOpenRace(current, horseId);
      if (target !== undefined) {
        const declared = declarePlayerHorse(current, target.meetingId, target.raceId, horseId);
        if (declared.ok) current = declared.state;
      }
    }
    current = advanceWeek(current, systems).state;
    if (current.raceResults.some((r) => r.runners.some((x) => x.horseId === horseId))) {
      return { state: current, horseId };
    }
  }
  throw new Error('테스트 전제 위반: 최대 주 수 안에 플레이어 말이 출주하지 않았다');
}

let PLAYED: { state: GameState; horseId: HorseId };

beforeAll(() => {
  PLAYED = playerRaceState();
}, MID_TIMEOUT);

describe('시즌 다시보기 (M3-D3b)', () => {
  it('1. 플레이어 말이 출주한 레이스가 replayList 에 hasPlayer true 로 있다', () => {
    const items = replayList(PLAYED.state);
    const playerItems = items.filter((i) => i.hasPlayer);
    expect(playerItems.length).toBeGreaterThan(0);
    const first = playerItems[0];
    expect(first?.dateLabel).toBeTruthy();
    expect(first?.title).toBeTruthy();
    expect(items.every((i) => i.key.includes('|'))).toBe(true);
  });

  it('2. buildReplay 결과의 착순·마번·finishTime 이 저장된 결과와 같다', () => {
    const stored = PLAYED.state.raceResults.find((r) => r.runners.some((x) => x.horseId === PLAYED.horseId));
    if (stored === undefined) throw new Error('저장된 결과가 없다');
    const entry = PLAYED.state.seasonState.replayable.find(
      (r) => r.race.id === stored.raceId && r.date.year === stored.date.year && r.date.week === stored.date.week,
    );
    if (entry === undefined) throw new Error('다시보기 항목이 없다');
    const bundle = buildReplay(PLAYED.state, replayKey(entry));
    const replayed = bundle.output.sim.result.runners.map((r) => ({
      horseId: r.horseId,
      position: r.position,
      finishTime: r.finishTime,
    }));
    const saved = stored.runners.map((r) => ({ horseId: r.horseId, position: r.position, finishTime: r.finishTime }));
    expect(replayed).toEqual(saved);
  });

  it('3. ratingChanges 가 ratingHistory 의 그 레이스 변동과 같다(첫 OR 이면 from null)', () => {
    const replayable = PLAYED.state.seasonState.replayable.find((r) => r.field.requests.some((q) => q.isPlayer));
    if (replayable === undefined) throw new Error('다시보기 항목이 없다');
    const bundle = buildReplay(PLAYED.state, replayKey(replayable));
    const changes = bundle.info.ratingChanges ?? {};

    replayable.field.runners.forEach((runner, runnerIndex) => {
      const history = PLAYED.state.seasonState.ratingHistory[runner.horse.id] ?? [];
      const expected = history.find(
        (c) =>
          c.raceId === replayable.race.id &&
          c.date.year === replayable.date.year &&
          c.date.week === replayable.date.week,
      );
      if (expected === undefined) {
        expect(changes[runnerIndex]).toBeUndefined();
      } else {
        expect(changes[runnerIndex]).toEqual({ from: expected.from, to: expected.to });
      }
    });
    expect(Object.keys(changes).length).toBeGreaterThan(0);
  });

  it('4. 자막과 한 줄 평이 비어 있지 않다', () => {
    const replayable = PLAYED.state.seasonState.replayable[0];
    if (replayable === undefined) throw new Error('다시보기 항목이 없다');
    const bundle = buildReplay(PLAYED.state, replayKey(replayable));
    expect(bundle.commentary.length).toBeGreaterThan(0);
    expect(bundle.commentary.every((line) => line.text.trim() !== '')).toBe(true);
    expect(bundle.verdicts.length).toBe(bundle.output.sim.result.runners.length);
    expect(bundle.verdicts.every((v) => v.text.trim() !== '')).toBe(true);
  });

  it('5. 저장 결과와 착순이 다르면 Error(재현성 깨짐 감지)', () => {
    const tampered = structuredClone(PLAYED.state);
    const stored = tampered.raceResults.find((r) => r.runners.some((x) => x.horseId === PLAYED.horseId));
    const first = stored?.runners[0];
    const second = stored?.runners[1];
    if (first === undefined || second === undefined) throw new Error('결과 착순이 부족하다');
    const swapped = first.position;
    first.position = second.position;
    second.position = swapped;
    const replayable = tampered.seasonState.replayable.find((r) => r.field.requests.some((q) => q.isPlayer));
    if (replayable === undefined) throw new Error('다시보기 항목이 없다');
    expect(() => buildReplay(tampered, replayKey(replayable))).toThrow(Error);
  });

  it('6. 알 수 없는 key 는 RangeError', () => {
    expect(() => buildReplay(PLAYED.state, 'no-such-meeting|no-such-race')).toThrow(RangeError);
  });
});
