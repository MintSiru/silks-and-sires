import { createBreedingSystem } from '../../src/engine/breeding/season';
import { growthSystem } from '../../src/engine/horse/growth';
import { generateHorse } from '../../src/engine/horse/generate';
import { displayName, unnamedLabel, nameSuggestions, registerHorseName } from '../../src/engine/naming/register';
import { normalizeName, validateHorseName } from '../../src/engine/naming/validate';
import { createPeopleContext, generateTrainer } from '../../src/engine/people/generate';
import { createRng } from '../../src/engine/rng';
import { assignTrainer, declarePlayerHorse } from '../../src/engine/season/player';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import type { GameState } from '../../src/engine/types';
import { DUE_WEEK_KEY_YEAR_SCALE } from '../../src/engine/config/breedingSeason';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
const options = { seed: 20261016, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };

it('고정 시드 2년 진행은 기존 공용 난수·AI 말·레이스 결과를 보존한다', () => {
  let state = bootstrapGame(options, staticData);
  const mare = Object.values(state.mares).find(m => state.horses[m.horseId]?.ownerId === state.playerOwnerId)!;
  mare.pregnant = true;
  mare.coveredBy = Object.keys(state.stallions).sort()[0]!;
  mare.dueWeek = state.date.year * DUE_WEEK_KEY_YEAR_SCALE + state.date.week;
  const systems = createGameSystems(staticData);
  const births: string[] = [];
  for (let i = 0; i < 104; i++) {
    const result = advanceWeek(state, systems);
    state = result.state;
    for (const e of result.events) if (e.type === 'foal_born') {
      births.push(e.foalId);
      const born = state.horses[e.foalId]!;
      if (born.ownerId === state.playerOwnerId) expect(born.nameRegistered).toBe(false);
      else expect(born).not.toHaveProperty('nameRegistered');
    }
  }
  // M4-E3 적용 전 HEAD(22회차 혈통 반영 후)의 코드로 같은 입력을 104주 진행해 측정한 기준값. 이후 혈통 데이터 보완(22회차 추가분)으로 AI 말 해시만 재고정.
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  expect(hash(state.rng)).toBe('cbc27473107229474383b07cca05dbb29a16d4e26babd40a75019cd2c125a658');
  expect(hash(Object.values(state.horses).filter(h => h.ownerId !== state.playerOwnerId))).toBe('65caa9cd12cb3c27ec13146e03ab27e424f6bff072090701a9be2089a264fb2e');
  expect(hash(state.raceResults)).toBe('681e057b699fe63de7e129b60e64929237f998b8ebccf6bc13bdd3791ab2152c');
  expect(births.length).toBeGreaterThan(0);
}, 300_000);

function fixture() {
  const state = createNewGame(options);
  const horse = generateHorse(createRng('naming-fixture'), {
    id: 'unnamed-foal', name: 'Silver Lantern', sex: 'male', birthYear: 2027,
    currentYear: 2027, countryOfBirth: 'GB', status: 'yearling', level: 50,
  });
  state.date = { year: 2027, week: 1 };
  horse.ownerId = state.playerOwnerId;
  horse.nameRegistered = false;
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  return { state, horse };
}

it('수동 등록은 원본·eventLog·난수 불변, 필드 삭제와 auto false 이벤트', () => {
  const { state, horse } = fixture();
  const before = structuredClone(state);
  const result = registerHorseName(state, horse.id, 'Velvet Lantern');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.horses[horse.id]!.name).toBe('Velvet Lantern');
  expect(result.state.horses[horse.id]).not.toHaveProperty('nameRegistered');
  expect(result.events).toEqual([{ type: 'horse_named', horseId: horse.id,
    name: 'Velvet Lantern', auto: false, date: state.date }]);
  expect(result.state.eventLog).toEqual(state.eventLog);
  expect(result.state.rng).toEqual(state.rng);
  expect(state).toEqual(before);
  expect(registerHorseName(result.state, horse.id, 'Velvet Lantern')).toEqual({ ok: false, error: 'already_registered' });
});

it('자기 후보 그대로 등록 가능, 정규화 중복·18자 초과·보호 이름은 거절', () => {
  const { state, horse } = fixture();
  expect(registerHorseName(state, horse.id, horse.name).ok).toBe(true);
  expect(registerHorseName(state, horse.id, 'A'.repeat(19))).toEqual({ ok: false, error: 'tooLong' });
  const protectedName = [...data.getNamingData().protectedNames].find(name => {
    const validation = validateHorseName(name, { isTaken: () => false }, data.getNamingData().protectedNames);
    return !validation.ok && validation.reason === 'protected';
  })!;
  expect(registerHorseName(state, horse.id, protectedName)).toEqual({ ok: false, error: 'protected' });
  state.horses.other = { ...horse, id: 'other', name: 'Velvet Lantern' };
  expect(registerHorseName(state, horse.id, 'VELVET LANTERN')).toEqual({ ok: false, error: 'taken' });
  // 자기 후보와 같은 이름을 다른 말도 갖고 있으면 제외하지 않는다.
  state.horses.other.name = horse.name;
  expect(registerHorseName(state, horse.id, horse.name)).toEqual({ ok: false, error: 'taken' });
});

it('없는 말·AI 말·기존 등록된 말은 거절한다', () => {
  const { state, horse } = fixture();
  expect(registerHorseName(state, 'missing', horse.name)).toEqual({ ok: false, error: 'not_found' });
  horse.ownerId = 'ai-owner';
  expect(registerHorseName(state, horse.id, horse.name)).toEqual({ ok: false, error: 'not_player' });
  horse.ownerId = state.playerOwnerId;
  delete horse.nameRegistered;
  expect(displayName(state, horse)).toBe(horse.name);
  expect(registerHorseName(state, horse.id, horse.name)).toEqual({ ok: false, error: 'already_registered' });
});

it('무명 표기는 어미명·출생연도 두 자리(성별 없음), 어미 없을 때 무명 + 두 자리', () => {
  const { state, horse } = fixture();
  expect(unnamedLabel(state, horse)).toBe('무명 27');
  horse.damId = 'dam';
  state.horses.dam = { ...horse, id: 'dam', name: 'Silver Tide' };
  expect(displayName(state, horse)).toBe('Silver Tide 27');
  horse.sex = 'female';
  expect(unnamedLabel(state, horse)).toBe('Silver Tide 27');
  horse.sex = 'male'; horse.gelded = true;
  expect(unnamedLabel(state, horse)).toBe('Silver Tide 27');
  delete state.horses.dam;
  expect(unnamedLabel(state, horse)).toBe('무명 27');
});

it('후보 8개는 현재 후보부터, 같은 인자 재현·round 별 변경·공용 난수 불변', () => {
  const { state, horse } = fixture();
  const before = structuredClone(state);
  const first = nameSuggestions(state, horse.id);
  expect(first).toHaveLength(8);
  expect(first[0]).toBe(horse.name);
  expect(nameSuggestions(state, horse.id)).toEqual(first);
  expect(nameSuggestions(state, horse.id, 8, 1)).not.toEqual(first);
  expect(new Set(first.map(normalizeName)).size).toBe(8);
  for (const name of first) expect(registerHorseName(state, horse.id, name).ok, name).toBe(true);
  expect(nameSuggestions(state, horse.id, 1)).toEqual([horse.name]);
  expect(nameSuggestions(state, horse.id, 0)).toEqual([]);
  expect(nameSuggestions(state, 'missing')).toEqual([]);
  expect(state).toEqual(before);
});

it('2세 조교 입사 때 자동 등록은 1회, 1세 조교 배정에서는 미등록 유지', () => {
  const { state, horse } = fixture();
  const trainer = generateTrainer(createRng('trainer'), createPeopleContext(data.getPeopleData(), state.date.year), 'trainer', 'GB');
  state.trainers[trainer.id] = trainer;
  state.date.year = horse.birthYear + 1;
  const young = assignTrainer(state, horse.id, trainer.id);
  expect(young.ok && young.state.horses[horse.id]!.nameRegistered).toBe(false);
  state.date.year = horse.birthYear + 2;
  const before = structuredClone(state);
  const result = assignTrainer(state, horse.id, trainer.id);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.horses[horse.id]).toMatchObject({ status: 'in_training', name: horse.name });
  expect(result.state.horses[horse.id]).not.toHaveProperty('nameRegistered');
  expect(result.events.filter(e => e.type === 'horse_named')).toEqual([{ type: 'horse_named', horseId: horse.id, name: horse.name, auto: true, date: state.date }]);
  const twice = assignTrainer(result.state, horse.id, trainer.id);
  expect(twice.ok && twice.events.some(e => e.type === 'horse_named')).toBe(false);
  expect(state).toEqual(before);
});

it('3세 이상 안전장치: 연초 1주에만 플레이어 미등록 말 자동 등록', () => {
  const { state, horse } = fixture();
  state.date = { year: horse.birthYear + 3, week: 1 };
  state.horses.ai = { ...horse, id: 'ai', ownerId: 'ai-owner' };
  horse.status = 'retired';
  const ctx = { date: state.date, rng: createRng(1) };
  const events = growthSystem.run(state, ctx);
  expect(events.filter(e => e.type === 'horse_named')).toHaveLength(1);
  expect(state.horses.ai!.nameRegistered).toBe(false);
  expect(horse).not.toHaveProperty('nameRegistered');
  expect(growthSystem.run(state, ctx).filter(e => e.type === 'horse_named')).toEqual([]);
  horse.nameRegistered = false;
  state.date.week = 2;
  expect(growthSystem.run(state, { ...ctx, date: state.date }).some(e => e.type === 'horse_named')).toBe(false);
});

it('출주 API는 미등록 말을 unnamed로 거절한다', () => {
  const state = bootstrapGame(options, staticData);
  const horse = state.horses[state.owners[state.playerOwnerId]!.horseIds[0]!]!;
  horse.nameRegistered = false;
  const meeting = state.seasonState.meetings[0]!;
  const race = meeting.races[0]!;
  const before = structuredClone(state);
  expect(declarePlayerHorse(state, meeting.id, race.race.id, horse.id)).toEqual({ ok: false, error: 'unnamed' });
  expect(state).toEqual(before);
});

it('플레이어 망아지만 미등록, AI 출산은 동일 rng·이름·능력치', () => {
  const base = bootstrapWorld(createNewGame(options), staticData, createRng(options.seed));
  const mare = Object.values(base.mares)[0]!;
  const aiState = structuredClone(base);
  aiState.playerOwnerId = 'other-player';
  const system = createBreedingSystem(staticData);
  const deliver = (state: GameState) => {
    const m = state.mares[mare.horseId]!;
    m.pregnant = true; m.coveredBy = Object.keys(state.stallions).sort()[0]!;
    m.dueWeek = state.date.year * DUE_WEEK_KEY_YEAR_SCALE + state.date.week;
    const rng = createRng('birth');
    const events = system.run(state, { date: state.date, rng });
    const event = events.find(e => e.type === 'foal_born')!;
    if (event.type !== 'foal_born') throw new Error('출산 이벤트 누락');
    return { foal: state.horses[event.foalId]!, rng: rng.getState() };
  };
  const player = deliver(base);
  const ai = deliver(aiState);
  expect(player.foal.nameRegistered).toBe(false);
  expect(ai.foal).not.toHaveProperty('nameRegistered');
  expect(ai.rng).toEqual(player.rng);
  expect(ai.foal.name).toBe(player.foal.name);
  expect(ai.foal.ability).toEqual(player.foal.ability);
});

