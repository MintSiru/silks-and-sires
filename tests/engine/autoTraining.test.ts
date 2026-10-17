import { describe, expect, it } from 'vitest';
import { RETAINER_EXTRA_BOXES } from '../../src/engine/config/economy';
import { generateHorse } from '../../src/engine/horse/generate';
import { emptyCareer } from '../../src/engine/people/generate';
import { createRng } from '../../src/engine/rng';
import {
  AUTO_SELL_KEEP_RACERS,
  AUTO_SELL_KEEP_RACERS_IN_DEBT,
  AUTO_TRAINING_MIN_GRADE,
  AUTO_TRAINING_MIN_RACERS,
} from '../../src/engine/config/autoSell';
import {
  autoTrainingPicks,
  createAutoTrainingSystem,
  meetsAutoTrainingGrade,
  playerGradeOf,
  playerRacerCount,
} from '../../src/engine/season/autoTraining';
import { assignTrainer } from '../../src/engine/season/player';
import { createNewGame } from '../../src/engine/state/newGame';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameState, Horse, Trainer } from '../../src/engine/types';
import { homeTasks } from '../../src/ui/home/homeView';

function fixture() {
  const state = createNewGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  const horse = generateHorse(createRng('auto-training'), { id: 'young', name: 'Silver Fern',
    sex: 'female', birthYear: state.date.year - 2, currentYear: state.date.year,
    countryOfBirth: 'GB', status: 'yearling', level: 80 });
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
    // 2세 여섯 두(기본 현역 상한 6두와 같다): 전속 추가 마방 6칸을 다 채운다
    for (let i = 0; i < RETAINER_EXTRA_BOXES - 1; i++) {
      const id = `young-${i.toString().padStart(2, '0')}`;
      state.horses[id] = { ...structuredClone(horse), id };
    }
    const next = run(state).state;
    expect(next.horses[horse.id]!.trainerId).toBe('away');
    expect(Object.values(next.horses).filter((h) => h.trainerId === 'away')).toHaveLength(RETAINER_EXTRA_BOXES);
    expect(Object.values(next.horses).filter((h) => h.trainerId === 'home')).toHaveLength(0);
    expect(Object.values(next.horses).filter((h) => h.trainerId === null)).toHaveLength(0);
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

/** 지정 능력 수준의 플레이어 2세 한 두(조교사 없음). 등급은 id 로 시드가 정해지므로 테스트에서 playerGradeOf 로 확인한다 */
function yearlingAt(state: GameState, id: string, level: number): Horse {
  const horse = generateHorse(createRng(`auto-training-${id}`), { id, name: 'Silver Fern',
    sex: 'female', birthYear: state.date.year - 2, currentYear: state.date.year,
    countryOfBirth: 'GB', status: 'yearling', level });
  horse.ownerId = state.playerOwnerId;
  horse.trainerId = null;
  horse.nameRegistered = false;
  return horse;
}

describe('2세 자동 입사: 기준 등급·현역 상한', () => {
  it('기준 미달 2세는 자동으로 보내지 않고 남기며 공용 rng 는 그대로다', () => {
    const { state, horse } = fixture();
    const low = yearlingAt(state, 'low', 40);
    const racer = { ...structuredClone(horse), id: 'racer-0', status: 'in_training' as const, trainerId: 'home',
      birthYear: state.date.year - 4 };
    state.horses = { [low.id]: low, [racer.id]: racer };
    state.owners[state.playerOwnerId]!.horseIds = [low.id, racer.id];
    expect(meetsAutoTrainingGrade(playerGradeOf(state, low))).toBe(false);
    const result = run(state);
    expect(result.events).toEqual([]);
    expect(result.state.horses[low.id]).toEqual(low);
    expect(result.state.rng).toEqual(state.rng);
    expect(autoTrainingPicks(state)).toEqual([]);
  });

  it('현역이 최소 두수(AUTO_TRAINING_MIN_RACERS)보다 적으면 기준 미달 2세도 등급 높은 순으로 그만큼 보낸다', () => {
    const { state } = fixture();
    const lows = [yearlingAt(state, 'low-a', 40), yearlingAt(state, 'low-b', 40)];
    state.horses = Object.fromEntries(lows.map((h) => [h.id, h]));
    state.owners[state.playerOwnerId]!.horseIds = lows.map((h) => h.id);
    expect(lows.every((h) => !meetsAutoTrainingGrade(playerGradeOf(state, h)))).toBe(true);
    expect(autoTrainingPicks(state)).toHaveLength(AUTO_TRAINING_MIN_RACERS);
    const next = run(state).state;
    expect(playerRacerCount(next)).toBe(AUTO_TRAINING_MIN_RACERS);
    expect(run(next).events).toEqual([]);
  });

  it('기준 이상 2세만 보내고 기준 미달 2세는 같이 남긴다', () => {
    const { state, horse } = fixture();
    const low = yearlingAt(state, 'low', 40);
    state.horses = { [horse.id]: horse, [low.id]: low };
    state.owners[state.playerOwnerId]!.horseIds = [horse.id, low.id];
    expect(meetsAutoTrainingGrade(playerGradeOf(state, horse))).toBe(true);
    const next = run(state).state;
    expect(next.horses[horse.id]!.trainerId).toBe('home');
    expect(next.horses[low.id]).toEqual(low);
  });

  it('기준 등급 판정: 기준(AUTO_TRAINING_MIN_GRADE)과 같거나 높은 등급만 통과한다', () => {
    expect(meetsAutoTrainingGrade(AUTO_TRAINING_MIN_GRADE)).toBe(true);
    expect(meetsAutoTrainingGrade('S')).toBe(true);
    expect(meetsAutoTrainingGrade('D')).toBe(false);
    expect(meetsAutoTrainingGrade('E')).toBe(false);
  });

  it('현역 두수가 상한에 닿으면 더 보내지 않는다(조교 중·휴양 중을 함께 센다)', () => {
    const { state, horse } = fixture();
    delete state.horses[horse.id];
    state.trainers.home!.capacity = 10;
    for (let i = 0; i < AUTO_SELL_KEEP_RACERS - 1; i++) {
      state.horses[`racer-${i}`] = { ...structuredClone(horse), id: `racer-${i}`,
        status: i < 3 ? 'in_training' : 'resting', trainerId: 'home', birthYear: state.date.year - 4 };
    }
    for (const id of ['young-a', 'young-b', 'young-c']) state.horses[id] = { ...structuredClone(horse), id };
    const next = run(state).state;
    const sent = ['young-a', 'young-b', 'young-c'].filter((id) => next.horses[id]!.status === 'in_training');
    expect(sent).toHaveLength(1);
    expect(Object.values(next.horses).filter((h) => h.ownerId === state.playerOwnerId
      && (h.status === 'in_training' || h.status === 'resting'))).toHaveLength(AUTO_SELL_KEEP_RACERS);
    expect(run(next).events).toEqual([]);
  });

  it('빚이 있으면 IN_DEBT 두수에서 멈추고 빚이 없으면 기본 상한까지 보낸다', () => {
    const { state, horse } = fixture();
    state.trainers.home!.capacity = 10;
    for (let i = 0; i < AUTO_SELL_KEEP_RACERS_IN_DEBT; i++) {
      state.horses[`racer-${i}`] = { ...structuredClone(horse), id: `racer-${i}`, status: 'in_training',
        trainerId: 'home', birthYear: state.date.year - 4 };
    }
    state.horses['young-b'] = { ...structuredClone(horse), id: 'young-b' };
    state.economy.debt = 500_000;
    expect(run(state).events).toEqual([]);
    expect(run(state).state.horses['young-b']!.status).toBe('yearling');
    const calm = structuredClone(state);
    calm.economy.debt = 0;
    expect(run(calm).state.horses['young-b']!.status).toBe('in_training');
  });

  it('기준 충족 후보는 등급 높은 순·같으면 id 순으로 고르고 결정적이다', () => {
    const { state } = fixture();
    const levels: [string, number][] = [['p-1', 80], ['p-2', 70], ['p-3', 80], ['p-4', 70]];
    for (const [id, level] of levels) state.horses[id] = yearlingAt(state, id, level);
    state.owners[state.playerOwnerId]!.horseIds = levels.map(([id]) => id);
    const order = ['S', 'A', 'B', 'C', 'D', 'E'];
    const picks = autoTrainingPicks(state);
    const ranks = picks.map((h) => order.indexOf(playerGradeOf(state, h)));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(run(state)).toEqual(run(structuredClone(state)));
  });
});
