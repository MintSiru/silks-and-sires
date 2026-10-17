/**
 * 레이스 당일 화면의 순수 뷰 함수(M7-RD2). React 없이 테스트할 수 있도록 상태·요약을 행 데이터로 바꾸기만 한다.
 * 상태를 바꾸지 않으며, 난수나 시계를 쓰지 않는다.
 */
import type {
  GameDate, GameState, HorseId, Margin, PaceOutlook, Race, RaceCardRunner, RaceDayBrief, RaceId, RaceResult,
  RaceDayComment, RatingChange, RunningStyle, Silks, Racecourse,
} from '../../engine/types';
import { formatOdds } from '../../engine/race/odds';
import { formatMarginKo } from '../../engine/race/results';
import { compareDates } from '../../engine/time/calendar';
import { feeKo, countryKo, raceDistanceKo, raceGradeKo, sexKo } from '../game/text';
import { goingKo } from '../horse/horseDetailView';
import { recentFormKo } from '../sales/privateMarketView';
import { formatRatingChange } from '../race-viewer/viewModel';

/** 작전 선택지 한 줄. 순서는 선행·선입·중단·추입(config 의 TACTIC_ORDER 와 같다). */
export interface TacticChoice {
  style: RunningStyle;
  label: string;
  hint: string;
}

export const TACTIC_CHOICES: readonly TacticChoice[] = [
  { style: 'front', label: '선행', hint: '처음부터 선두에서 이끕니다' },
  { style: 'prominent', label: '선입', hint: '선두 바로 뒤에서 따라갑니다' },
  { style: 'midfield', label: '중단', hint: '중간에서 아끼다 직선에서 끌어올립니다' },
  { style: 'held_up', label: '추입', hint: '뒤에서 기다리다 마지막에 추월합니다' },
];

export function tacticLabelKo(style: RunningStyle): string {
  return TACTIC_CHOICES.find((c) => c.style === style)?.label ?? style;
}

const PACE_KO: Record<PaceOutlook, string> = {
  fast: '빠른 페이스 예상(선행마가 많음)',
  even: '평균 페이스 예상',
  slow: '느린 페이스 예상(선행마가 적음)',
};

export function paceTextKo(pace: PaceOutlook): string {
  return PACE_KO[pace];
}

/** 출주표 정렬 기준. 기본은 마번. */
export type CardSortKey = 'saddle' | 'draw' | 'or' | 'odds';

export const CARD_SORT_OPTIONS: readonly { key: CardSortKey; label: string }[] = [
  { key: 'saddle', label: '마번' },
  { key: 'draw', label: '게이트' },
  { key: 'or', label: 'OR' },
  { key: 'odds', label: '예상 오즈' },
];

/** 출주표 한 줄(표시용 문자열과 정렬 값을 함께 든다) */
export interface CardRow {
  horseId: HorseId;
  isMine: boolean;
  saddleCloth: number;
  draw: number;
  name: string;
  /** 나이·성별. 예: "4세 수말" */
  ageSexKo: string;
  weightLb: number;
  jockeyName: string;
  trainerName: string;
  ownerName: string;
  or: number | null;
  /** 최근 5전 착순 문자열. 출주가 없으면 '출주 없음' */
  formText: string;
  oddsText: string;
  /** 예상 오즈의 내재 확률(정렬용) */
  impliedProb: number;
  silks: Silks;
}

/** 분수 오즈의 내재 확률 = den / (num + den). 1/1 이면 0.5. */
export function impliedProbability(odds: { num: number; den: number }): number {
  return odds.den / (odds.num + odds.den);
}

/** 출주표 행. state 는 성별의 거세 여부와 마명을 읽는 데만 쓴다. */
export function cardRows(brief: RaceDayBrief, state: GameState): CardRow[] {
  return brief.card.runners.map((runner: RaceCardRunner) => {
    const horse = state.horses[runner.horseId];
    return {
      horseId: runner.horseId,
      isMine: runner.isPlayer,
      saddleCloth: runner.saddleCloth,
      draw: runner.draw,
      name: runner.name,
      ageSexKo: `${runner.age}세 ${sexKo(runner.sex, horse?.gelded ?? false)}`,
      weightLb: runner.weightLb,
      jockeyName: runner.jockeyName,
      trainerName: runner.trainerName ?? '—',
      ownerName: runner.ownerName,
      or: runner.or,
      formText: recentFormKo(state, runner.horseId),
      oddsText: formatOdds(runner.morningOdds),
      impliedProb: impliedProbability(runner.morningOdds),
      silks: runner.silks,
    };
  });
}

/** 정렬. 같은 값이면 마번 오름차순. OR 없는 말은 OR 정렬에서 맨 뒤, 오즈는 낮은 숫자(인기순)부터. */
export function sortCardRows(rows: readonly CardRow[], key: CardSortKey): CardRow[] {
  const bySaddle = (a: CardRow, b: CardRow) => a.saddleCloth - b.saddleCloth;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case 'saddle':
        return bySaddle(a, b);
      case 'draw':
        return a.draw - b.draw || bySaddle(a, b);
      case 'or': {
        if (a.or === null && b.or === null) return bySaddle(a, b);
        if (a.or === null) return 1;
        if (b.or === null) return -1;
        return b.or - a.or || bySaddle(a, b);
      }
      case 'odds':
        return b.impliedProb - a.impliedProb || bySaddle(a, b);
    }
  });
  return sorted;
}

/** 예상 착순. 아침 오즈 기준 인기 순위(동률은 같은 순위). 출주마 목록에 없는 말이면 RangeError. */
export function expectedPosition(brief: RaceDayBrief): number {
  const runners = brief.card.runners;
  const mine = runners.find((r) => r.horseId === brief.horseId);
  if (mine === undefined) throw new RangeError(`expectedPosition: 출주마가 아니다: ${brief.horseId}`);
  const p = impliedProbability(mine.morningOdds);
  return 1 + runners.filter((r) => r.horseId !== brief.horseId && impliedProbability(r.morningOdds) > p).length;
}

/** 사후 평가. 착순이 예상보다 앞이면 기대 이상, 같으면 기대만큼, 뒤면 아쉬움. */
export type PostRaceVerdict = 'above' | 'as_expected' | 'below';

export const POST_RACE_VERDICT_KO: Record<PostRaceVerdict, string> = {
  above: '기대 이상',
  as_expected: '기대만큼',
  below: '아쉬움',
};

const POST_RACE_TEXT: Record<PostRaceVerdict, string> = {
  above: '예상보다 좋은 결과입니다. 이 흐름을 다음 경주로 이어 가겠습니다.',
  as_expected: '예상한 만큼의 결과입니다. 준비한 대로 달려 준 것이 고맙습니다.',
  below: '기대에 못 미쳐 아쉽습니다. 패인을 살펴 다음 준비에 반영하겠습니다.',
};

export function postRaceVerdict(position: number, expected: number): PostRaceVerdict {
  const diff = expected - position;
  if (diff > 0) return 'above';
  if (diff === 0) return 'as_expected';
  return 'below';
}

/** 조교사 사후 코멘트 한 줄. label 은 배지, text 는 문장이다. */
export function postRaceComment(position: number, expected: number): { verdict: PostRaceVerdict; label: string; text: string } {
  const verdict = postRaceVerdict(position, expected);
  return { verdict, label: POST_RACE_VERDICT_KO[verdict], text: POST_RACE_TEXT[verdict] };
}

/** 착차 표기. 레이스 화면과 같은 엔진 표기(예: 4½마신, 짧은 머리). 1착(margin null)은 '—'. */
export function marginTextKo(margin: Margin | null): string {
  if (margin === null) return '—';
  return formatMarginKo(margin);
}

/** 착순표 한 줄 */
export interface FinishRow {
  position: number;
  saddleCloth: number;
  horseId: HorseId;
  isMine: boolean;
  name: string;
  jockeyName: string;
  marginText: string;
  oddsText: string;
}

/** 전체 착순표(착순 오름차순). 결과에 없는 이름은 '—'. */
export function finishRows(result: RaceResult, state: GameState, playerHorseId: HorseId): FinishRow[] {
  return result.runners.map((runner) => ({
    position: runner.position,
    saddleCloth: runner.saddleCloth,
    horseId: runner.horseId,
    isMine: runner.horseId === playerHorseId,
    name: state.horses[runner.horseId]?.name ?? '—',
    jockeyName: state.jockeys[runner.jockeyId]?.name ?? '—',
    marginText: marginTextKo(runner.margin),
    oddsText: runner.odds === null ? '—' : formatOdds(runner.odds),
  }));
}

function sameDate(a: GameDate, b: GameDate): boolean {
  return compareDates(a, b) === 0;
}

/** 이 레이스(같은 레이스 id·같은 날짜)의 저장 결과 */
export function findRaceResult(state: GameState, raceId: RaceId, date: GameDate): RaceResult | undefined {
  return state.raceResults.find((r) => r.raceId === raceId && sameDate(r.date, date));
}

/** 다시보기 항목(같은 개최·같은 레이스). 레이스를 치르지 않았거나 재생 기록이 없으면 undefined */
export function findReplayEntry(state: GameState, meetingId: string, raceId: RaceId) {
  return state.seasonState.replayable.find((r) => r.meetingId === meetingId && r.race.id === raceId);
}

/** 1착부터 n착까지의 상금. 입상이 없으면 null */
export function prizeOfPosition(race: Race, position: number): number | null {
  return race.prizeMoney[position - 1] ?? null;
}

/** 이 레이스로 생긴 말의 OR 변동(없으면 undefined) */
export function ratingChangeOf(state: GameState, horseId: HorseId, raceId: RaceId, date: GameDate): RatingChange | undefined {
  const list = state.seasonState.ratingHistory[horseId] ?? [];
  return [...list].reverse().find((c) => c.raceId === raceId && sameDate(c.date, date));
}

/** OR 변동 한 줄. 예: "+2 (78 → 80)". 첫 부여(from null)는 "첫 OR 80 (없음 → 80)" */
export function ratingChangeText(change: RatingChange): string {
  const from = change.from === null ? '없음' : String(change.from);
  return `${formatRatingChange(change)} (${from} → ${change.to})`;
}

/** 레이스 머리 정보 */
export interface RaceHeader {
  title: string;
  gradeText: string;
  distanceText: string;
  goingText: string;
  courseText: string;
  prizeText: string;
  fieldText: string;
}

export function raceHeaderOf(brief: RaceDayBrief, course: Pick<Racecourse, 'name' | 'country'>): RaceHeader {
  const { card } = brief;
  const prize = prizeOfPosition(card.race, 1);
  return {
    title: card.race.name,
    gradeText: raceGradeKo(card.race),
    distanceText: raceDistanceKo(card.race.distance),
    goingText: goingKo(card.going),
    courseText: `${course.name} (${countryKo(course.country)})`,
    prizeText: prize === null ? '상금 없음' : `1착 ${feeKo(prize)}`,
    fieldText: `${card.runners.length}두`,
  };
}

/** 작전 지시 실패 사유 */
export const RACE_ORDER_ERROR_KO: Record<'not_found' | 'not_player_horse' | 'not_declared' | 'invalid_tactic', string> = {
  not_found: '말을 찾을 수 없습니다.',
  not_player_horse: '내 말이 아니어서 작전을 바꿀 수 없습니다.',
  not_declared: '이번 주 출주 신청이 없어 작전을 바꿀 수 없습니다.',
  invalid_tactic: '알 수 없는 작전입니다.',
};

/** 패독 관찰 한 줄의 색 등급 → 토큰 클래스 */
export function paddockToneClass(tone: 'good' | 'neutral' | 'bad'): string {
  return `rd-tone rd-tone--${tone}`;
}

/** 코멘트 발화자 이름표 */
export function commentSpeakerKo(comment: RaceDayComment): string {
  return comment.speaker === 'trainer' ? '조교사' : '기수';
}
