import { describe, expect, it } from 'vitest';
import type { TrainerReportKey } from '../../src/engine/horse/conditioning';
import type { PersonalityClueKey } from '../../src/engine/horse/personality';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { assignTrainer, declarePlayerHorse } from '../../src/engine/season/player';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type {
  GameDate,
  GameState,
  Horse,
  HorseId,
  Race,
  RaceId,
  RaceResult,
  ScheduledRace,
} from '../../src/engine/types';
import {
  feeKo,
  INJURY_REGION_HINT_KO,
  injuryErrorKo,
  injuryKo,
  personalityClueKo,
  raceConditionsKo,
  trainerReportKo,
} from '../../src/ui/game/text';
import {
  eligiblePlayerHorses,
  hasPendingPlayerRace,
  meetingsView,
  playerHorses,
  ratingHintKo,
  recentResults,
  trainerChoices,
  type PlayerHorseView,
} from '../../src/ui/season/seasonView';
import { INJURY_KINDS, VET_EXAM_COST } from '../../src/engine/config/injury';
import { chooseTreatment, type InjuryError } from '../../src/engine/horse/injury';
import { formatDateKo } from '../../src/engine/time/calendar';
import type { Injury, InjuryRecord } from '../../src/engine/types';

const SEED = 20261011;
const SILKS = { primary: '#1a3c6e', secondary: '#f2d200', pattern: 'hoops' } as const;

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const TRAINER_REPORT_KEYS: readonly TrainerReportKey[] = [
  'injured',
  'tired',
  'flat',
  'backward',
  'needs_run',
  'nearly_ready',
  'peak',
];

const PERSONALITY_CLUE_KEYS: readonly PersonalityClueKey[] = [
  'gate_nervous',
  'keen_going',
  'genuine',
  'quirky',
  'laid_back',
];

let cachedBase: GameState | null = null;

/** 새 게임(bootstrapGame) 상태의 복제본. 원본은 캐시에 남긴다. */
function bootedGame(): GameState {
  if (cachedBase === null) {
    cachedBase = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
  }
  return structuredClone(cachedBase);
}

function firstMeetingId(state: GameState): string {
  const meeting = state.seasonState.meetings[0];
  if (meeting === undefined) throw new Error('개최가 없다');
  return meeting.id;
}

function playerHorseIdAt(state: GameState, index: number): HorseId {
  const id = state.owners[state.playerOwnerId]?.horseIds[index];
  if (id === undefined) throw new Error('플레이어 말이 없다');
  return id;
}

function horseOf(state: GameState, id: HorseId): Horse {
  const horse = state.horses[id];
  if (horse === undefined) throw new Error(`말이 없다: ${id}`);
  return horse;
}

/** 플레이어 말 하나를 2세 조교 전 상태로 만든다(조건 테스트용). 개최 연도 기준 2세. */
function makeYearling(state: GameState, horseId: HorseId, year: number): void {
  const horse = horseOf(state, horseId);
  horse.status = 'yearling';
  horse.birthYear = year - 2;
  horse.trainerId = null;
  horse.condition = { fitness: 80, fatigue: 0, mental: 60, injury: null };
  horse.record.wins = 0;
  delete state.seasonState.lastRun[horseId];
}

/** 2세 플레이어 말을 조교사에게 맡긴 상태(in_training). 개최 id 도 함께 돌려준다. */
function trainedPlayerHorse(): { state: GameState; horseId: HorseId; meetingId: string } {
  const state = bootedGame();
  const meetingId = firstMeetingId(state);
  const meeting = state.seasonState.meetings.find((m) => m.id === meetingId);
  if (meeting === undefined) throw new Error('개최가 없다');
  const horseId = playerHorseIdAt(state, 0);
  makeYearling(state, horseId, meeting.date.year);
  const trainer = trainerChoices(state, horseId).find((t) => !t.full);
  if (trainer === undefined) throw new Error('배정 가능한 조교사가 없다');
  const assigned = assignTrainer(state, horseId, trainer.id);
  if (!assigned.ok) throw new Error(`조교사 배정 실패: ${assigned.error}`);
  return { state: assigned.state, horseId, meetingId };
}

interface AddRaceOptions {
  minAge?: number;
  sex?: Race['conditions']['sex'];
  kind?: Race['kind'];
}

let raceSeq = 0;

/**
 * 개최에 조건을 직접 정한 open 레이스를 붙인다(테스트 전용). 기본: 2세 이상 · 암수 혼합 · 조건경주.
 * 레이스 정의는 첫 레이스 스냅샷을 베끼고 조건만 바꾼다.
 */
function addOpenRace(state: GameState, meetingId: string, opts: AddRaceOptions): RaceId {
  const meeting = state.seasonState.meetings.find((m) => m.id === meetingId);
  const template = meeting?.races[0];
  if (meeting === undefined || template === undefined) throw new Error('개최 또는 레이스가 없다');
  raceSeq += 1;
  const id = `test-race-${raceSeq}`;
  const race: Race = {
    ...template.race,
    id,
    kind: opts.kind ?? 'conditions',
    grade: null,
    conditions: {
      ...template.race.conditions,
      minAge: opts.minAge ?? 2,
      maxAge: null,
      sex: opts.sex ?? 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
    },
  };
  const sr: ScheduledRace = { race, templateId: null, status: 'open', declarations: [], simulated: false };
  meeting.races.push(sr);
  return id;
}

function idsOf(options: { id: HorseId }[]): HorseId[] {
  return options.map((o) => o.id);
}

function templateRace(): Race {
  const first = getRaceTemplates()[0];
  if (first === undefined) throw new Error('레이스 템플릿이 없다');
  return first;
}

function raceWithConditions(conditions: Partial<Race['conditions']>): Race {
  const base = templateRace();
  return { ...base, conditions: { ...base.conditions, ...conditions } };
}

function fakeResult(raceId: RaceId, date: GameDate, placings: { horseId: HorseId; position: number }[]): RaceResult {
  return {
    raceId,
    racecourseId: 'test-course',
    date: { ...date },
    going: 'good',
    distance: 1600,
    seed: 1,
    winningTime: 100,
    sectionalMarks: [],
    runners: placings.map((p, i) => ({
      runnerIndex: i,
      horseId: p.horseId,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: 'test-jockey',
      weightLb: 126,
      position: p.position,
      finishTime: 100 + i,
      margin: null,
      beatenLengths: 0,
      sectionals: [],
      performanceFigure: 0,
      odds: null,
    })),
  };
}

describe('meetingsView', () => {
  it('bootstrap 상태에서 다음 주 개최를 1개 이상 돌려주고, 레이스마다 조건 요약·총상금이 있다', () => {
    const views = meetingsView(bootedGame());
    expect(views.length).toBeGreaterThanOrEqual(1);
    for (const m of views) {
      expect(m.races.length).toBeGreaterThan(0);
      expect(m.courseName.length).toBeGreaterThan(0);
      expect(m.goingLabel.length).toBeGreaterThan(0);
      for (const r of m.races) {
        expect(r.name.length).toBeGreaterThan(0);
        expect(r.conditionsLabel.length).toBeGreaterThan(0);
        expect(r.totalPrize).toBeGreaterThan(0);
        expect(r.maxRunners).toBeGreaterThan(0);
        expect(['open', 'closed', 'run']).toContain(r.status);
      }
    }
  });

  it('마장이 아직 정해지지 않은 개최는 "미정"으로 표기한다', () => {
    const state = bootedGame();
    for (const m of state.seasonState.meetings) m.going = null;
    for (const view of meetingsView(state)) expect(view.goingLabel).toBe('미정');
  });

  it('플레이어 선언 말을 이름과 함께 보인다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const raceId = addOpenRace(state, meetingId, {});
    const declared = declarePlayerHorse(state, meetingId, raceId, horseId);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    const view = meetingsView(declared.state).find((m) => m.meetingId === meetingId);
    const race = view?.races.find((r) => r.raceId === raceId);
    expect(race?.playerDeclared).toEqual([{ horseId, name: horseOf(state, horseId).name }]);
    expect(race?.runners).toBe(1);
  });
});

describe('eligiblePlayerHorses', () => {
  it('assignTrainer 한 뒤 조건 맞는 레이스에서 그 말을 돌려준다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const raceId = addOpenRace(state, meetingId, {});
    expect(idsOf(eligiblePlayerHorses(state, meetingId, raceId))).toContain(horseId);
  });

  it('나이 조건이 안 맞는 레이스에서는 돌려주지 않는다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const raceId = addOpenRace(state, meetingId, { minAge: 3 });
    expect(idsOf(eligiblePlayerHorses(state, meetingId, raceId))).not.toContain(horseId);
  });

  it('성별 조건이 안 맞는 레이스에서는 돌려주지 않는다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const horse = horseOf(state, horseId);
    const otherSex: Race['conditions']['sex'] = horse.sex === 'female' ? 'colts_geldings' : 'fillies_mares';
    const raceId = addOpenRace(state, meetingId, { sex: otherSex });
    expect(idsOf(eligiblePlayerHorses(state, meetingId, raceId))).not.toContain(horseId);
  });

  it('메이든 조건은 무승 말만 돌려주고, 승리가 있으면 돌려주지 않는다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const maidenRace = addOpenRace(state, meetingId, { kind: 'maiden' });
    expect(idsOf(eligiblePlayerHorses(state, meetingId, maidenRace))).toContain(horseId);

    horseOf(state, horseId).record.wins = 1;
    expect(idsOf(eligiblePlayerHorses(state, meetingId, maidenRace))).not.toContain(horseId);
  });

  it('같은 주 다른 레이스에 선언된 말은 다른 레이스에서 돌려주지 않는다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    const first = addOpenRace(state, meetingId, {});
    const second = addOpenRace(state, meetingId, {});
    const declared = declarePlayerHorse(state, meetingId, first, horseId);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(idsOf(eligiblePlayerHorses(declared.state, meetingId, second))).not.toContain(horseId);
    expect(idsOf(eligiblePlayerHorses(declared.state, meetingId, first))).not.toContain(horseId);
  });

  it('조교사가 없는 말은 돌려주지 않는다', () => {
    const state = bootedGame();
    const meetingId = firstMeetingId(state);
    const horseId = playerHorseIdAt(state, 0);
    makeYearling(state, horseId, state.seasonState.meetings[0]?.date.year ?? state.date.year);
    horseOf(state, horseId).status = 'in_training';
    const raceId = addOpenRace(state, meetingId, {});
    expect(idsOf(eligiblePlayerHorses(state, meetingId, raceId))).not.toContain(horseId);
  });
});

describe('playerHorses', () => {
  it('플레이어 말만, 조교 중·휴양 중·2세 이상 미조교 말로 거른다', () => {
    const state = bootedGame();
    for (const view of playerHorses(state)) {
      const horse = horseOf(state, view.id);
      expect(horse.ownerId).toBe(state.playerOwnerId);
      const listed =
        horse.status === 'in_training' ||
        horse.status === 'resting' ||
        (horse.status === 'yearling' && view.ageYears >= 2);
      expect(listed).toBe(true);
    }
  });

  it('조교사 배정 말은 조교사 이름과 조교사 코멘트 키를 가진다', () => {
    const { state, horseId } = trainedPlayerHorse();
    const view = playerHorses(state).find((h) => h.id === horseId);
    const trainerId = horseOf(state, horseId).trainerId;
    expect(view).toBeDefined();
    expect(view?.trainerName).toBe(trainerId === null ? null : state.trainers[trainerId]?.name ?? null);
    expect(view?.statusKey).not.toBeNull();
  });

  it('조교사 미배정 말은 조교사 이름과 코멘트 키가 null 이다', () => {
    const state = bootedGame();
    const horseId = playerHorseIdAt(state, 0);
    makeYearling(state, horseId, state.date.year);
    const view = playerHorses(state).find((h) => h.id === horseId);
    expect(view?.trainerName).toBeNull();
    expect(view?.statusKey).toBeNull();
  });

  it('OR 숫자 필드를 담지 않는다', () => {
    const { state, horseId } = trainedPlayerHorse();
    horseOf(state, horseId).officialRating = 73;
    const payload = JSON.stringify([playerHorses(state), meetingsView(state), recentResults(state, 5)]);
    expect(payload).not.toContain('officialRating');
  });
});

describe('ratingHintKo', () => {
  it('null 은 아직 평가 전', () => {
    expect(ratingHintKo(null)).toBe('아직 평가 전');
  });

  it('구간 경계값마다 정해진 문구를 돌려준다', () => {
    expect(ratingHintKo(0)).toBe('하위 핸디캡 수준');
    expect(ratingHintKo(59)).toBe('하위 핸디캡 수준');
    expect(ratingHintKo(60)).toBe('중위 핸디캡 수준');
    expect(ratingHintKo(79)).toBe('중위 핸디캡 수준');
    expect(ratingHintKo(80)).toBe('상위 핸디캡 수준');
    expect(ratingHintKo(94)).toBe('상위 핸디캡 수준');
    expect(ratingHintKo(95)).toBe('리스티드 수준');
    expect(ratingHintKo(104)).toBe('리스티드 수준');
    expect(ratingHintKo(105)).toBe('그룹 수준');
    expect(ratingHintKo(114)).toBe('그룹 수준');
    expect(ratingHintKo(115)).toBe('G1 수준');
    expect(ratingHintKo(130)).toBe('G1 수준');
  });
});

describe('단서 문구', () => {
  it('trainerReportKo 는 7개 키 모두에 서로 다른 문구를 준다', () => {
    const texts = TRAINER_REPORT_KEYS.map((k) => trainerReportKo(k));
    expect(new Set(texts).size).toBe(TRAINER_REPORT_KEYS.length);
    for (const t of texts) expect(t.length).toBeGreaterThan(0);
  });

  it('personalityClueKo 는 5개 키 모두에 서로 다른 문구를 준다', () => {
    const texts = PERSONALITY_CLUE_KEYS.map((k) => personalityClueKo(k));
    expect(new Set(texts).size).toBe(PERSONALITY_CLUE_KEYS.length);
    expect(personalityClueKo('gate_nervous')).toBe('게이트에서 예민합니다');
    for (const t of texts) expect(t.length).toBeGreaterThan(0);
  });
});

describe('raceConditionsKo', () => {
  it('연령·성별·WFA 를 한 줄로 적는다', () => {
    const race = raceWithConditions({ minAge: 3, maxAge: 3, sex: 'fillies_mares', weightSystem: 'wfa', ratingMin: null, ratingMax: null });
    expect(raceConditionsKo(race)).toBe('3세 · 암말 · WFA');
  });

  it('핸디캡은 OR 숫자 대신 레이팅 수준 문구로 범위를 적는다', () => {
    const race = raceWithConditions({
      minAge: 3,
      maxAge: null,
      sex: 'open',
      weightSystem: 'handicap',
      ratingMin: 66,
      ratingMax: 85,
    });
    const text = raceConditionsKo(race);
    expect(text).toBe('3세 이상 · 암수 혼합 · 핸디캡 · 중위 핸디캡 수준 ~ 상위 핸디캡 수준');
    expect(text).not.toMatch(/66|85/);
  });
});

describe('recentResults', () => {
  it('플레이어 말이 나온 레이스와 G1 결과만 최신순으로 고른다', () => {
    const state = bootedGame();
    const playerId = playerHorseIdAt(state, 0);
    const otherId = Object.values(state.horses).find((h) => h.ownerId !== state.playerOwnerId)?.id;
    if (otherId === undefined) throw new Error('AI 말이 없다');
    const g1 = getRaceTemplates().find((t) => t.grade === 'G1');
    if (g1 === undefined) throw new Error('G1 템플릿이 없다');
    const date = state.date;

    state.raceResults = [
      fakeResult('test-plain', date, [{ horseId: otherId, position: 1 }]),
      fakeResult('test-player', date, [
        { horseId: otherId, position: 1 },
        { horseId: playerId, position: 3 },
      ]),
      fakeResult(g1.id, date, [{ horseId: otherId, position: 1 }]),
    ];

    const views = recentResults(state, 10);
    expect(views.map((v) => v.raceName)).toEqual([g1.name, '자동 편성 레이스']);
    const playerView = views[1];
    expect(playerView?.winnerName).toBe(horseOf(state, otherId).name);
    expect(playerView?.playerRuns).toEqual([
      { horseId: playerId, name: horseOf(state, playerId).name, position: 3 },
    ]);
    expect(views[0]?.playerRuns).toEqual([]);
  });

  it('n 개까지만 돌려주고, n 이 0 이면 빈 배열이다', () => {
    const state = bootedGame();
    const playerId = playerHorseIdAt(state, 0);
    state.raceResults = [
      fakeResult('test-a', state.date, [{ horseId: playerId, position: 1 }]),
      fakeResult('test-b', state.date, [{ horseId: playerId, position: 2 }]),
    ];
    expect(recentResults(state, 1)).toHaveLength(1);
    expect(recentResults(state, 0)).toEqual([]);
    expect(() => recentResults(state, -1)).toThrow(RangeError);
  });
});

describe('hasPendingPlayerRace', () => {
  it('출주 접수가 없는 새 게임에서는 false 이고, 접수 후에는 true 다', () => {
    const { state, horseId, meetingId } = trainedPlayerHorse();
    expect(hasPendingPlayerRace(bootedGame())).toBe(false);
    const raceId = addOpenRace(state, meetingId, {});
    const declared = declarePlayerHorse(state, meetingId, raceId, horseId);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(hasPendingPlayerRace(declared.state)).toBe(true);
  });
});

// ── 부상 화면 뷰(M4-H4) ─────────────────────────────────────────

/** 조교 중인 플레이어 말에 부상을 넣는다(뷰 테스트용) */
function injuredPlayerHorse(injury: Injury): { state: GameState; horseId: HorseId } {
  const { state, horseId } = trainedPlayerHorse();
  horseOf(state, horseId).condition.injury = injury;
  return { state, horseId };
}

function viewOfHorse(state: GameState, horseId: HorseId): PlayerHorseView {
  const view = playerHorses(state).find((h) => h.id === horseId);
  if (view === undefined) throw new Error(`내 말 뷰가 없다: ${horseId}`);
  return view;
}

describe('부상 뷰: 확진 전', () => {
  it('확진 전 부상은 kind suspected 이고 부위 단서와 검사 비용만 보인다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'tendon', weeksOut: 30, diagnosed: false });
    const injury = viewOfHorse(state, horseId).injury;
    expect(injury).toEqual({
      kind: 'suspected',
      hintKo: INJURY_REGION_HINT_KO.tendon,
      examCostKo: feeKo(VET_EXAM_COST),
    });
  });

  it('단서 문구는 부상 부위에 따라 달라진다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'stress_fracture', weeksOut: 10, diagnosed: false });
    const injury = viewOfHorse(state, horseId).injury;
    expect(injury?.kind).toBe('suspected');
    if (injury?.kind !== 'suspected') return;
    expect(injury.hintKo).toBe(INJURY_REGION_HINT_KO.bone);
    expect(injury.hintKo).not.toBe(INJURY_REGION_HINT_KO.tendon);
  });

  it('확진 전 뷰는 종류명과 치료 선택지를 담지 않는다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'tendon', weeksOut: 30, diagnosed: false });
    const payload = JSON.stringify(viewOfHorse(state, horseId).injury);
    expect(payload).not.toContain(injuryKo('tendon'));
    expect(payload).not.toContain('options');
  });
});

describe('부상 뷰: 확진', () => {
  it('확진된 tendon 말은 치료 선택지에 medical 을 담고 비용은 설정과 같다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'tendon', weeksOut: 30, diagnosed: true });
    const injury = viewOfHorse(state, horseId).injury;
    expect(injury?.kind).toBe('diagnosed');
    if (injury?.kind !== 'diagnosed') return;
    expect(injury.nameKo).toBe(injuryKo('tendon'));
    expect(injury.weeksOut).toBe(30);
    expect(injury.treatmentKo).toBeNull();
    expect(injury.options.map((o) => o.treatment)).toEqual(['medical']);
    const medical = injury.options[0];
    const config = INJURY_KINDS.tendon.treatments.medical;
    expect(config).toBeDefined();
    expect(medical?.costKo).toBe(feeKo(config?.cost ?? -1));
    expect(medical?.labelKo).toBe('치료');
    expect(medical?.noteKo).toContain('기간 ×0.9');
  });

  it('휴양은 선택지에서 뺀다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'chip_fracture', weeksOut: 12, diagnosed: true });
    const injury = viewOfHorse(state, horseId).injury;
    expect(injury?.kind).toBe('diagnosed');
    if (injury?.kind !== 'diagnosed') return;
    expect(injury.options.map((o) => o.treatment)).toEqual(['surgery']);
    expect(injury.options[0]?.noteKo).toContain('성공률 90%');
  });

  it('휴양만 가능한 부상은 선택지가 비고 treatmentKo 도 null 이다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'knock', weeksOut: 2, diagnosed: true });
    const injury = viewOfHorse(state, horseId).injury;
    expect(injury).toEqual({
      kind: 'diagnosed',
      nameKo: injuryKo('knock'),
      weeksOut: 2,
      treatmentKo: null,
      options: [],
    });
  });

  it('medical 을 고른 뒤에는 선택지가 비고 treatmentKo 가 치료다', () => {
    const { state, horseId } = injuredPlayerHorse({ kind: 'tendon', weeksOut: 30, diagnosed: true });
    const owner = state.owners[state.playerOwnerId];
    if (owner === undefined) throw new Error('마주가 없다');
    owner.funds = 10_000_000;
    const result = chooseTreatment(state, horseId, 'medical');
    if (!result.ok) throw new Error(`치료 선택 실패: ${result.error}`);
    const injury = viewOfHorse(result.state, horseId).injury;
    expect(injury?.kind).toBe('diagnosed');
    if (injury?.kind !== 'diagnosed') return;
    expect(injury.options).toEqual([]);
    expect(injury.treatmentKo).toBe('치료');
  });

  it('부상이 없는 말은 injury 가 null 이다', () => {
    const { state, horseId } = trainedPlayerHorse();
    expect(viewOfHorse(state, horseId).injury).toBeNull();
  });
});

describe('부상 뷰: 병력', () => {
  const RECORDS: InjuryRecord[] = [
    { kind: 'knock', since: { year: 2030, week: 5 }, weeks: 2, treatment: 'rest' },
    { kind: 'tendon', since: { year: 2030, week: 20 }, weeks: 30, treatment: 'medical', permanent: { speed: 8 } },
    { kind: 'foot', since: { year: 2031, week: 3 }, weeks: 4, treatment: 'medical' },
  ];

  it('병력 3건이면 historyKo 3줄, 최신 먼저', () => {
    const { state, horseId } = trainedPlayerHorse();
    horseOf(state, horseId).injuryHistory = RECORDS.map((r) => ({ ...r, since: { ...r.since } }));
    const history = viewOfHorse(state, horseId).historyKo;
    expect(history).toHaveLength(3);
    expect(history[0]).toBe(`${formatDateKo({ year: 2031, week: 3 })} ${injuryKo('foot')} 4주 · 치료`);
    expect(history[1]).toBe(`${formatDateKo({ year: 2030, week: 20 })} ${injuryKo('tendon')} 30주 · 치료 · 후유증`);
    expect(history[2]).toBe(`${formatDateKo({ year: 2030, week: 5 })} ${injuryKo('knock')} 2주 · 휴양`);
  });

  it('병력은 최근 5건만 최신 먼저 보인다', () => {
    const { state, horseId } = trainedPlayerHorse();
    const many: InjuryRecord[] = Array.from({ length: 7 }, (_, i) => ({
      kind: 'knock' as const, since: { year: 2030, week: i + 1 }, weeks: i + 1, treatment: 'rest' as const,
    }));
    horseOf(state, horseId).injuryHistory = many;
    const history = viewOfHorse(state, horseId).historyKo;
    expect(history).toHaveLength(5);
    expect(history[0]).toContain('7주');
    expect(history[4]).toContain('3주');
  });

  it('병력이 없으면 빈 배열이다', () => {
    const { state, horseId } = trainedPlayerHorse();
    expect(viewOfHorse(state, horseId).historyKo).toEqual([]);
  });
});

describe('injuryErrorKo', () => {
  it('8개 사유 모두 비지 않고 서로 다르다', () => {
    const errors: InjuryError[] = [
      'not_found', 'not_player_horse', 'no_injury', 'already_diagnosed',
      'not_diagnosed', 'not_allowed', 'already_treated', 'insufficient_funds',
    ];
    const texts = errors.map((e) => injuryErrorKo(e));
    for (const t of texts) expect(t.length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(errors.length);
  });
});
