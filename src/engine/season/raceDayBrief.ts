import {
  FAST_PACE_FRONT_MIN, INNER_DRAW_SHARE, MORNING_UNRATED_OR, MORNING_OR_PER_STRENGTH, OUTER_DRAW_SHARE,
  PADDOCK_COMPOSURE_LOW, PADDOCK_FATIGUE_GOOD, PADDOCK_FATIGUE_HIGH,
  PADDOCK_FITNESS_GOOD, PADDOCK_FITNESS_LOW, PADDOCK_LONG_BREAK_WEEKS,
  PADDOCK_NOISE, PADDOCK_TIMIDITY_HIGH, PADDOCK_YOUNG_AGE, RECENT_FORM_RUNS,
  SLOW_PACE_FRONT_MAX, TACTIC_ORDER,
} from '../config/raceDayBrief';
import { GOING_FAST_MAX, GOING_SOFT_MIN } from '../config/assessment';
import { rollGoing, isTurfGoing, turfGoingIndex } from '../going/going';
import { gradeOf } from '../horse/assessment';
import { assessForPlayer } from '../horse/playerView';
import { priceField } from '../race/odds';
import { createRng } from '../rng';
import { ageInYear, compareDates, monthOfWeek, weeksBetween } from '../time/calendar';
import type {
  CourseFeature, GameEvent, GameState, Horse, HorseId, PaddockNote, PaceOutlook,
  RaceCardRunner, RaceDayBrief, RaceDayComment, RaceId, RunningStyle,
} from '../types';
import { reconsiderRivalG1Entries } from './declarations';
import { buildRaceField } from './field';
import type { RaceCalendarData } from './lookahead';
import { applyRacePlansInPlace } from './racePlan';

/** 관찰 우선순위: 피로·준비 부족 → 장기 공백 → 흥분·겁 → 좋은 상태 → 나이 → 평상. */
const PADDOCK = {
  tired: '땀을 많이 흘리고 걸음에 피로가 묻어납니다.',
  unfit: '몸이 무겁고 아직 준비가 덜 된 듯합니다.',
  returning: '오랜만이라 몸이 덜 풀린 듯합니다.',
  keen: '고개를 들고 재촉하며 다소 흥분한 모습입니다.',
  timid: '주변을 살피며 무리와 거리를 두려 합니다.',
  ready: '윤기가 흐르고 걸음이 가볍습니다.',
  young: '어린 말답게 주변에 호기심을 보입니다.',
  normal: '차분하게 걸으며 평소의 모습을 보입니다.',
} as const;
const STYLE_TEXT: Record<RunningStyle, string> = {
  front: '선행', prominent: '선단', midfield: '중단', held_up: '후방',
};
const COURSE_TEXT: Record<CourseFeature, string> = {
  uphill_finish: '결승 오르막에 대비해 힘을 남겨야 합니다.',
  downhill_run: '내리막에서 리듬을 잃지 않는 것이 중요합니다.',
  dip: '주로의 낮아지는 구간을 차분히 넘겨야 합니다.',
  false_straight: '가짜 직선에서 너무 일찍 승부하지 않아야 합니다.',
  camber: '주로의 기울기에서 균형을 잡아야 합니다.',
  straight_course: '직선 코스라 일정한 리듬이 중요합니다.',
  tight_turns: '급한 코너에서 자리를 잡는 것이 중요합니다.',
  galloping: '넓게 뻗는 코스에서 리듬을 살려 보겠습니다.',
  undulating: '기복이 있는 주로라 힘을 고르게 써야 합니다.',
  long_straight: '긴 마지막 직선까지 힘을 아끼겠습니다.',
  short_straight: '마지막 직선이 짧아 미리 자리를 잡아야 합니다.',
};

/** 이번 주 자동 신청을 주간 시스템과 같은 함수로 처리한다. 입력 상태·공용 rng 는 보존한다. */
export function prepareRaceDay(state: GameState, data: RaceCalendarData): { state: GameState; events: GameEvent[] } {
  const next = structuredClone(state);
  return { state: next, events: applyRacePlansInPlace(next, data, next.date) };
}

export function pendingRaceDays(state: GameState): { meetingId: string; raceId: RaceId; horseId: HorseId }[] {
  return state.seasonState.meetings.filter((m) => compareDates(m.date, state.date) === 0)
    .flatMap((m) => m.races.filter((sr) => sr.status === 'open' || sr.status === 'closed')
      .flatMap((sr) => sr.declarations.filter((d) => d.isPlayer && d.ownerId === state.playerOwnerId
        && state.horses[d.horseId]?.ownerId === state.playerOwnerId)
        .map((d) => ({ meetingId: m.id, raceId: sr.race.id, horseId: d.horseId }))));
}

export type RaceOrderError = 'not_found' | 'not_player_horse' | 'not_declared' | 'invalid_tactic';

export function setRaceOrder(
  state: GameState, raceId: RaceId, horseId: HorseId, tactic: RunningStyle,
): { ok: true; state: GameState } | { ok: false; error: RaceOrderError } {
  const horse = state.horses[horseId];
  if (horse === undefined) return { ok: false, error: 'not_found' };
  if (horse.ownerId !== state.playerOwnerId) return { ok: false, error: 'not_player_horse' };
  if (!TACTIC_ORDER.includes(tactic)) return { ok: false, error: 'invalid_tactic' };
  if (!pendingRaceDays(state).some((p) => p.raceId === raceId && p.horseId === horseId)) {
    return { ok: false, error: 'not_declared' };
  }
  const next = structuredClone(state);
  for (const meeting of next.seasonState.meetings) {
    if (compareDates(meeting.date, next.date) !== 0) continue;
    const declaration = meeting.races.find((sr) => sr.race.id === raceId)?.declarations.find((d) => d.horseId === horseId);
    if (declaration !== undefined) declaration.tactic = tactic;
  }
  return { ok: true, state: next };
}

function recentForm(state: GameState, horseId: HorseId): number[] {
  return state.raceResults.map((result, index) => ({ result, index }))
    .filter(({ result }) => compareDates(result.date, state.date) <= 0 && result.runners.some((r) => r.horseId === horseId))
    .sort((a, b) => compareDates(b.result.date, a.result.date) || b.index - a.index)
    .slice(0, RECENT_FORM_RUNS).map(({ result }) => result.runners.find((r) => r.horseId === horseId)!.position);
}

function paddockNote(state: GameState, horse: Horse, seed: number): PaddockNote {
  const noise = createRng(`${seed}:paddock:${horse.id}`).range(-PADDOCK_NOISE, PADDOCK_NOISE);
  const fitness = horse.condition.fitness + noise;
  const fatigue = horse.condition.fatigue - noise;
  const last = state.seasonState.lastRun[horse.id];
  const note = (tone: PaddockNote['tone'], text: string): PaddockNote => ({ horseId: horse.id, tone, text });
  if (fatigue >= PADDOCK_FATIGUE_HIGH) return note('bad', PADDOCK.tired);
  if (fitness < PADDOCK_FITNESS_LOW) return note('bad', PADDOCK.unfit);
  if (last !== undefined && weeksBetween(last, state.date) >= PADDOCK_LONG_BREAK_WEEKS) return note('neutral', PADDOCK.returning);
  if (horse.personality.composure < PADDOCK_COMPOSURE_LOW) return note('bad', PADDOCK.keen);
  if (horse.personality.timidity >= PADDOCK_TIMIDITY_HIGH) return note('neutral', PADDOCK.timid);
  if (fitness >= PADDOCK_FITNESS_GOOD && fatigue <= PADDOCK_FATIGUE_GOOD) return note('good', PADDOCK.ready);
  if (ageInYear(horse.birthYear, state.date.year) <= PADDOCK_YOUNG_AGE) return note('neutral', PADDOCK.young);
  return note('neutral', PADDOCK.normal);
}

function recommend(preferred: RunningStyle, pace: PaceOutlook, draw: number, size: number): RunningStyle {
  const index = TACTIC_ORDER.indexOf(preferred);
  const shift = pace === 'fast' ? 1 : pace === 'slow' ? -1
    : draw / size > OUTER_DRAW_SHARE && (preferred === 'front' || preferred === 'prominent') ? 1 : 0;
  return TACTIC_ORDER[Math.max(0, Math.min(TACTIC_ORDER.length - 1, index + shift))]!;
}

/** 상태와 공용 난수에 쓰지 않는, 이번 주 플레이어 선언마의 출주표·관찰·소견. */
export function raceDayBrief(state: GameState, raceId: RaceId, horseId: HorseId, data: RaceCalendarData): RaceDayBrief {
  if (!pendingRaceDays(state).some((p) => p.raceId === raceId && p.horseId === horseId)) {
    throw new RangeError('raceDayBrief: 이번 주에 선언된 플레이어 말이 아닙니다');
  }
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const country = (id: string) => courseById.get(id)?.country;
  // 실행 직전 G1 라이벌 교체도 같은 순수 함수로 미리 반영한다. 입력 개최는 바꾸지 않는다.
  const meetings = reconsiderRivalG1Entries(state,
    state.seasonState.meetings.filter((m) => compareDates(m.date, state.date) === 0), country);
  const meeting = meetings.find((m) => m.races.some((sr) => sr.race.id === raceId))!;
  const sr = meeting.races.find((r) => r.race.id === raceId)!;
  const seed = meeting.seed;
  if (seed === undefined) throw new RangeError('raceDayBrief: 개최 시드가 없는 옛 개최는 주간 진행으로 실행해 주세요');
  const course = courseById.get(meeting.racecourseId);
  if (course === undefined) throw new RangeError('raceDayBrief: 개최 경마장을 찾을 수 없습니다');
  const going = rollGoing(createRng(`${seed}:going`), course, monthOfWeek(meeting.date.week));
  const built = buildRaceField(state, sr, meeting.date, createRng(`${seed}:field:${raceId}`), country, seed);
  const entries = built.entries!;
  // 시장은 공개 OR 만 쓴다. 실제 SP 는 실행 시드·실제 예상 전력으로 별도 산출한다.
  const odds = priceField(createRng(`${seed}:ml:${raceId}`),
    entries.map((e) => (state.horses[e.horseId]!.officialRating ?? MORNING_UNRATED_OR) / MORNING_OR_PER_STRENGTH));
  const runners: RaceCardRunner[] = entries.map((entry, index) => {
    const horse = state.horses[entry.horseId]!;
    const declaration = sr.declarations[index]!;
    const owner = state.owners[declaration.ownerId]!;
    const trainer = declaration.trainerId === null ? undefined : state.trainers[declaration.trainerId];
    return {
      horseId: horse.id, name: horse.name, saddleCloth: entry.saddleCloth, draw: entry.draw,
      age: ageInYear(horse.birthYear, meeting.date.year), sex: horse.sex, weightLb: entry.weightLb,
      jockeyId: entry.jockeyId, jockeyName: state.jockeys[entry.jockeyId]!.name,
      trainerId: declaration.trainerId, trainerName: trainer?.name ?? null,
      ownerId: owner.id, ownerName: owner.name, silks: { ...entry.silks }, or: horse.officialRating,
      recentForm: recentForm(state, horse.id), preferredStyle: horse.preferredStyle,
      morningOdds: odds[index]!, isPlayer: entry.isPlayer,
    };
  });
  const horse = state.horses[horseId]!;
  const mine = runners.find((r) => r.horseId === horseId)!;
  const tactic = sr.declarations.find((d) => d.horseId === horseId)!.tactic ?? horse.preferredStyle;
  const fronts = runners.filter((r) => r.preferredStyle === 'front').length;
  const paceOutlook: PaceOutlook = fronts >= FAST_PACE_FRONT_MIN ? 'fast' : fronts <= SLOW_PACE_FRONT_MAX ? 'slow' : 'even';
  const recommendedTactic = recommend(horse.preferredStyle, paceOutlook, mine.draw, runners.length);
  const paddock = [mine, ...runners.filter((r) => r.horseId !== horseId)]
    .map((r) => paddockNote(state, state.horses[r.horseId]!, seed));
  const comments: RaceDayComment[] = [];
  const trainer = mine.trainerId === null ? undefined : state.trainers[mine.trainerId];
  if (trainer !== undefined) {
    const assessment = assessForPlayer(state, horseId);
    const { min, max } = assessment.distanceHint;
    const distance = sr.race.distance >= min && sr.race.distance <= max
      ? '평가한 거리 적성 범위라 제 경주를 할 만합니다.' : '평가한 거리 범위를 벗어나 페이스 조절이 필요합니다.';
    const likesFast = assessment.comments.some((c) => c.key === 'going_likes_fast');
    const likesSoft = assessment.comments.some((c) => c.key === 'going_likes_soft');
    const goingText = isTurfGoing(going) && ((likesFast && turfGoingIndex(going) <= GOING_FAST_MAX)
      || (likesSoft && turfGoingIndex(going) >= GOING_SOFT_MIN))
      ? '선호하는 마장 쪽이라 기대합니다.' : null;
    const feature = course.features?.[0];
    const condition = paddock[0]!.tone === 'good' ? '오늘은 준비 상태가 좋아 보입니다.'
      : paddock[0]!.tone === 'bad' ? '패독에서 보인 상태를 유심히 살피겠습니다.' : '평소 리듬대로 준비하겠습니다.';
    comments.push({ speaker: 'trainer', personId: trainer.id, name: trainer.name,
      text: `${distance}\n${goingText ?? (feature === undefined ? condition : COURSE_TEXT[feature])}` });
  }
  const jockey = state.jockeys[mine.jockeyId]!;
  const drawText = mine.draw / runners.length <= INNER_DRAW_SHARE ? '안쪽 게이트에서 자리를 지켜 보겠습니다.'
    : mine.draw / runners.length > OUTER_DRAW_SHARE ? '바깥 게이트라 초반 자리 잡기에 신경 쓰겠습니다.'
      : '가운데 게이트에서 흐름을 살피겠습니다.';
  const styleText = jockey.preferredStyle === tactic ? '제게 익숙한 작전입니다.' : '말의 리듬에 맞춰 지시를 따르겠습니다.';
  comments.push({ speaker: 'jockey', personId: jockey.id, name: jockey.name,
    text: `기승 평가는 ${gradeOf(jockey.skill)}등급이며 ${STYLE_TEXT[tactic]} 작전으로 가겠습니다.\n${styleText} ${drawText}` });
  return { horseId, raceId, card: { meetingId: meeting.id, race: structuredClone(sr.race), date: { ...meeting.date }, going, runners },
    paddock, comments, paceOutlook, recommendedTactic, tactic };
}
