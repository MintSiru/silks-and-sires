import { beforeAll, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { MIN_FIELD_SIZE } from '../../src/engine/config/entries';
import { placeBet } from '../../src/engine/betting/betting';
import { forecastOdds } from '../../src/engine/betting/betting';
import { declarePlayerHorse, withdrawPlayerHorse } from '../../src/engine/season/player';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import type { GameState } from '../../src/engine/types';

const staticData = {
  nicks: data.getNicks(), naming: data.getNamingData(), stallionNames: data.getStallionNames(),
  stallionRecords: data.getStallionRecords(), ...data.getPeopleData(), courses: data.getRacecourses(),
  templates: data.getRaceTemplates(), series: data.getSeriesDefinitions(),
};
const options = { seed: 20261011, playerName: 'Test Owner', silks: {
  primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const,
} };
const systems = createGameSystems(staticData);
let base: GameState;
beforeAll(() => { base = bootstrapGame(options, staticData); }, 120000);

function target(state: GameState) {
  for (const meeting of state.seasonState.meetings) {
    for (const sr of meeting.races) {
      if (sr.status === 'open' && sr.declarations.length >= MIN_FIELD_SIZE) return { meeting, sr };
    }
  }
  throw new Error('선언된 레이스 없음');
}

it('첫 개최와 1주 진행 뒤 AI 선언은 open 이고 예상 오즈에 표시된다', () => {
  for (const state of [base, advanceWeek(base, systems).state]) {
    const races = state.seasonState.meetings.flatMap((m) => m.races).filter((sr) => sr.status !== 'abandoned');
    expect(races.length).toBeGreaterThan(0);
    expect(races.every((sr) => sr.status === 'open' && sr.declarations.some((d) => !d.isPlayer))).toBe(true);
    process.stdout.write(`[earlyDeclarations] 주 ${state.date.week} 취소 제외 평균 두수: ${races.reduce((n, sr) => n + sr.declarations.length, 0) / races.length}\n`);
    const { meeting, sr } = target(state);
    expect(forecastOdds(state, meeting.id, sr.race.id)).toHaveLength(sr.declarations.length);
  }
});

it.each([false, true])('최저 AI 교체·동률 id 내림차순·베팅 전액 환불 (OR 없음: %s)', (unrated) => {
  const s = structuredClone(base);
  const { meeting, sr } = target(s);
  const ids = sr.declarations.map((d) => d.horseId).sort();
  for (const id of ids) {
    const horse = s.horses[id]!;
    horse.officialRating = unrated ? null : 80;
    if (unrated) horse.ability = { speed: 60, stamina: 60, acceleration: 60, guts: 60, power: 60 };
  }
  const displaced = ids.at(-1)!;
  for (const id of ids.slice(0, -2)) {
    if (unrated) s.horses[id]!.ability = { speed: 90, stamina: 90, acceleration: 90, guts: 90, power: 90 };
    else s.horses[id]!.officialRating = 100;
  }
  if (unrated) {
    sr.race.kind = 'conditions';
    sr.race.conditions.weightSystem = 'wfa';
  }
  const playerId = 'test-early-player';
  s.horses[playerId] = { ...structuredClone(s.horses[ids[0]!]!), id: playerId, ownerId: s.playerOwnerId, officialRating: 80 };
  s.owners[s.playerOwnerId]!.horseIds.push(playerId);
  sr.race.maxRunners = sr.declarations.length;
  const bet = placeBet(s, { bookmakerId: data.getBookmakers()[0]!.id, meetingId: meeting.id,
    raceId: sr.race.id, horseId: displaced, kind: 'win', stake: 100 }, { bookmakers: data.getBookmakers() });
  if (!bet.ok) throw new Error(bet.error);
  const declared = declarePlayerHorse(bet.state, meeting.id, sr.race.id, playerId);
  if (!declared.ok) throw new Error(declared.error);
  const changed = target(declared.state).sr;
  expect(changed.declarations).toHaveLength(sr.race.maxRunners);
  expect(changed.declarations.some((d) => d.horseId === displaced)).toBe(false);
  expect(changed.declarations.some((d) => d.horseId === playerId && d.isPlayer)).toBe(true);
  expect(sr.declarations.some((d) => d.horseId === displaced)).toBe(true);
  let result = advanceWeek(declared.state, systems).state;
  result = advanceWeek(result, systems).state;
  expect(result.betting.history.find((b) => b.horseId === displaced)).toMatchObject({ returned: 100, position: null });
  const withdrawn = withdrawPlayerHorse(declared.state, meeting.id, sr.race.id, playerId);
  if (!withdrawn.ok) throw new Error(withdrawn.error);
  expect(target(withdrawn.state).sr.declarations).toHaveLength(sr.race.maxRunners - 1);
});

it('전부 플레이어인 만원 레이스는 실패한다', () => {
  const s = structuredClone(base);
  const { meeting, sr } = target(s);
  for (const d of sr.declarations) d.isPlayer = true;
  sr.race.maxRunners = sr.declarations.length;
  const id = 'test-full-player';
  s.horses[id] = { ...structuredClone(s.horses[sr.declarations[0]!.horseId]!), id, ownerId: s.playerOwnerId };
  expect(declarePlayerHorse(s, meeting.id, sr.race.id, id)).toEqual({ ok: false, error: 'field_full' });
});

it('옛 저장본의 선언 없는 개최는 실행 직전에 AI 선언한다', () => {
  const s = structuredClone(base);
  for (const meeting of s.seasonState.meetings) {
    for (const sr of meeting.races) { sr.status = 'open'; sr.declarations = []; }
  }
  s.date = { ...s.seasonState.meetings[0]!.date };
  const after = advanceWeek(s, systems).state;
  expect(Object.values(after.seasonState.leading.jockey).reduce((n, e) => n + e.runners, 0)).toBeGreaterThan(0);
});

it('선언 후 필드 부족은 재충원 없이 취소하고 환불한다', () => {
  const s = structuredClone(base);
  const { meeting, sr } = target(s);
  sr.declarations.splice(MIN_FIELD_SIZE - 1);
  const bet = placeBet(s, { bookmakerId: data.getBookmakers()[0]!.id, meetingId: meeting.id,
    raceId: sr.race.id, horseId: sr.declarations[0]!.horseId, kind: 'win', stake: 100 }, { bookmakers: data.getBookmakers() });
  if (!bet.ok) throw new Error(bet.error);
  const after = advanceWeek(advanceWeek(bet.state, systems).state, systems).state;
  expect(after.raceResults.some((r) => r.raceId === sr.race.id)).toBe(false);
  expect(after.betting.history[0]).toMatchObject({ returned: 100 });
});

it('같은 시드와 저장 왕복 후 주간 진행이 동일하다', () => {
  const other = bootstrapGame(options, staticData);
  expect(other).toEqual(base);
  const restored = deserializeGame(serializeGame(base, '2026-10-15T00:00:00.000Z'));
  if (!restored.ok) throw new Error('저장 복원 실패');
  expect(advanceWeek(restored.state, systems)).toEqual(advanceWeek(other, systems));
}, 120000);
