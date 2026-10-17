import { describe, expect, it } from 'vitest';
import { RETAINER_EXTRA_BOXES } from '../../src/engine/config/economy';
import { generateHorse } from '../../src/engine/horse/generate';
import { emptyCareer } from '../../src/engine/people/generate';
import { createRng } from '../../src/engine/rng';
import { createAutoTrainingSystem } from '../../src/engine/season/autoTraining';
import { assignTrainer } from '../../src/engine/season/player';
import { createNewGame } from '../../src/engine/state/newGame';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState, Trainer } from '../../src/engine/types';
import { homeTasks } from '../../src/ui/home/homeView';

function fixture() {
  const state = createNewGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  const horse = generateHorse(createRng('auto-training'), { id: 'young', name: 'Silver Fern',
    sex: 'female', birthYear: state.date.year - 2, currentYear: state.date.year,
    countryOfBirth: 'GB', status: 'yearling', level: 60 });
  horse.ownerId = state.playerOwnerId;
  horse.trainerId = null;
  horse.nameRegistered = false;
  state.horses = { [horse.id]: horse };
  state.owners[state.playerOwnerId]!.horseIds = [horse.id];
  state.farm.country = 'GB';
  const trainer: Trainer = { id: 'home', name: '가상 조교사', country: 'GB',
    yardName: '가상 야드', region: '가상 지역', facilityGrade: 3, style: 'all_round',
    skill: 60, weeklyFee: 200, capacity: 1, birthYear: 1980, staminaBias: 0,
    juvenileFocus: 0.5, eye: 50, career: emptyCareer() };
  state.trainers = { home: trainer,
    away: { ...structuredClone(trainer), id: 'away', country: 'IE', skill: 100 } };
  return { state, horse };
}

function run(state: GameState) {
  return advanceWeek(state, [createAutoTrainingSystem()]);
}

describe('2세 자동 입사', () => {
  it.each([undefined, true])('설정 %s이면 수동과 같은 이름·상태·시설 보너스·이벤트를 적용한다', (setting) => {
    const { state, horse } = fixture();
    if (setting !== undefined) state.settings.autoSendToTraining = setting;
    const before = structuredClone(state);
    const manual = assignTrainer(state, horse.id, 'home');
    const auto = run(state);
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    expect(auto.state.horses).toEqual(manual.state.horses);
    expect(auto.events).toEqual(manual.events);
    expect(auto.events.map((e) => e.type)).toEqual(['horse_named', 'horse_status_changed']);
    expect(state).toEqual(before);
    expect(auto.state.rng).toEqual(state.rng);
    expect(run(auto.state).events).toEqual([]);
  });

  it('수동이면 배정하지 않고 홈에서만 맡기기 할 일을 보여준다', () => {
    const { state, horse } = fixture();
    expect(homeTasks(state).some((task) => task.id === `training:${horse.id}`)).toBe(false);
    state.settings.autoSendToTraining = false;
    expect(run(state).state.horses[horse.id]).toEqual(horse);
    expect(run(state).events).toEqual([]);
    expect(homeTasks(state)).toContainEqual(expect.objectContaining({
      id: `training:${horse.id}`, label: expect.stringContaining('조교사에게 맡기기'),
    }));
  });

  it('다른 나라 전속을 실력 높은 자국 조교사보다 먼저 고르고 추가 마방을 인정한다', () => {
    const { state, horse } = fixture();
    state.trainers.away!.skill = 1;
    state.trainers.away!.capacity = 0;
    state.relations.contracts = [{ kind: 'trainer', personId: 'away',
      startYear: state.date.year, endYear: state.date.year, annualFee: 100 }];
    for (let i = 0; i < RETAINER_EXTRA_BOXES + 1; i++) {
      const id = `young-${i.toString().padStart(2, '0')}`;
      state.horses[id] = { ...structuredClone(horse), id };
    }
    const next = run(state).state;
    expect(next.horses[horse.id]!.trainerId).toBe('away');
    expect(Object.values(next.horses).filter((h) => h.trainerId === 'away')).toHaveLength(RETAINER_EXTRA_BOXES);
    expect(Object.values(next.horses).filter((h) => h.trainerId === 'home')).toHaveLength(1);
    expect(Object.values(next.horses).filter((h) => h.trainerId === null)).toHaveLength(1);
  });

  it('자국 실력 내림차순·동점 id 오름차순, 그 다음 다른 나라로 배정한다', () => {
    const { state, horse } = fixture();
    state.trainers = { z: { ...state.trainers.home!, id: 'z', skill: 70 },
      ...state.trainers, a: { ...state.trainers.home!, id: 'a', skill: 70 } };
    for (const id of ['young-2', 'young-3', 'young-4']) state.horses[id] = { ...structuredClone(horse), id };
    const next = run(state).state;
    expect(['young', 'young-2', 'young-3', 'young-4'].map((id) => next.horses[id]!.trainerId))
      .toEqual(['a', 'z', 'home', 'away']);
    const reversed = structuredClone(state);
    reversed.horses = Object.fromEntries(Object.entries(reversed.horses).reverse());
    reversed.trainers = Object.fromEntries(Object.entries(reversed.trainers).reverse());
    expect(run(reversed)).toEqual(run(state));
  });

  it('모두 꽉 차면 이벤트 없이 건너뛰며 다음 주 빈 자리가 생기면 배정한다', () => {
    const { state, horse } = fixture();
    for (const trainer of Object.values(state.trainers)) {
      const id = `occupied-${trainer.id}`;
      state.horses[id] = { ...structuredClone(horse), id, ownerId: 'ai', trainerId: trainer.id };
    }
    const skipped = run(state);
    expect(skipped.events).toEqual([]);
    expect(skipped.state.horses[horse.id]!.trainerId).toBeNull();
    skipped.state.horses['occupied-home']!.trainerId = null;
    expect(run(skipped.state).state.horses[horse.id]!.trainerId).toBe('home');
  });

  it('1세·다른 소유자·다른 상태·배정 완료·세일 위탁·판매 예정인 말은 제외한다', () => {
    const { state, horse } = fixture();
    state.horses = {};
    for (const id of ['young', 'ai', 'resting', 'assigned', 'consigned', 'catalogued']) {
      state.horses[id] = { ...structuredClone(horse), id };
    }
    state.horses.young!.birthYear++;
    state.horses.ai!.ownerId = 'ai';
    state.horses.resting!.status = 'resting';
    state.horses.assigned!.trainerId = 'home';
    state.sales.consignments = [{ horseId: 'consigned', saleId: 'test-sale', year: state.date.year, reserve: null }];
    state.sales.catalogues = [{ saleId: 'test-sale', year: state.date.year, status: 'catalogued',
      lots: [{ lotNo: 1, book: 1, horseId: 'catalogued', horseName: horse.name,
        sireId: null, vendor: { kind: 'owner', id: state.playerOwnerId }, reserve: null,
        valuation: 1000, aiBids: [], result: null }] }];
    expect(run(state).events).toEqual([]);
    expect(run(state).state.horses).toEqual(state.horses);
  });

  it('조교사가 없어도 조용히 건너뛰며 공용 난수는 그대로다', () => {
    const { state } = fixture();
    state.trainers = {};
    expect(run(state).events).toEqual([]);
    expect(run(state).state.rng).toEqual(state.rng);
  });
});
