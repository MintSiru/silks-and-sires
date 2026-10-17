import { describe, expect, it } from 'vitest';
import type { GameState, GameSettings, RaceDayBrief } from '../../src/engine/types';
import { RACE_DAY_MODE_OPTIONS, raceDayModeOf } from '../../src/ui/shell/settingsView';
import {
  CARD_SORT_OPTIONS,
  RACE_ORDER_ERROR_KO,
  TACTIC_CHOICES,
  expectedPosition,
  impliedProbability,
  cardRows,
  marginTextKo,
  paceTextKo,
  postRaceComment,
  postRaceVerdict,
  prizeOfPosition,
  ratingChangeText,
  sortCardRows,
  tacticLabelKo,
  type CardRow,
} from '../../src/ui/raceDay/raceDayView';

/** 정렬·비교에 필요한 필드만 가진 출주 행 */
function row(saddleCloth: number, extra: Partial<CardRow> = {}): CardRow {
  return {
    horseId: `h${saddleCloth}`, isMine: false, saddleCloth, draw: saddleCloth, name: `말${saddleCloth}`,
    ageSexKo: '4세 수말', weightLb: 126, jockeyName: '기수', trainerName: '조교사', ownerName: '마주',
    or: null, formText: '출주 없음', oddsText: '5/1', impliedProb: 1 / 6, silks: { primary: '#000000', secondary: '#ffffff', pattern: 'plain' },
    ...extra,
  };
}

/** 예상 착순 계산에 필요한 최소 브리프(card.runners 와 horseId 만 쓴다) */
function briefWith(odds: { horseId: string; num: number; den: number }[], mine: string): RaceDayBrief {
  return {
    horseId: mine,
    card: {
      runners: odds.map((o) => ({ horseId: o.horseId, morningOdds: { num: o.num, den: o.den } })),
    },
  } as unknown as RaceDayBrief;
}

describe('레이스 당일 출주표 정렬', () => {
  const rows = [
    row(3, { draw: 1, or: 70, impliedProb: 0.1 }),
    row(1, { draw: 5, or: null, impliedProb: 0.4 }),
    row(2, { draw: 3, or: 82, impliedProb: 0.25 }),
    row(4, { draw: 3, or: 82, impliedProb: 0.25 }),
  ];

  it('기본 정렬은 마번 오름차순이다', () => {
    expect(sortCardRows(rows, 'saddle').map((r) => r.saddleCloth)).toEqual([1, 2, 3, 4]);
    expect(CARD_SORT_OPTIONS[0]?.key).toBe('saddle');
  });

  it('게이트·OR·예상 오즈 기준으로 정렬하고 같은 값은 마번 순이다', () => {
    expect(sortCardRows(rows, 'draw').map((r) => r.saddleCloth)).toEqual([3, 2, 4, 1]);
    expect(sortCardRows(rows, 'or').map((r) => r.saddleCloth)).toEqual([2, 4, 3, 1]);
    expect(sortCardRows(rows, 'odds').map((r) => r.saddleCloth)).toEqual([1, 2, 4, 3]);
  });

  it('정렬은 입력 배열을 바꾸지 않는다', () => {
    const before = rows.map((r) => r.saddleCloth);
    sortCardRows(rows, 'or');
    expect(rows.map((r) => r.saddleCloth)).toEqual(before);
  });
});

describe('최근 전적 표기', () => {
  /** 출주표 한 줄을 만들 최소 브리프. 말 기록은 state.horses 로 준다. */
  function oneRunnerBrief(): RaceDayBrief {
    return {
      horseId: 'h1',
      card: {
        runners: [{
          horseId: 'h1', saddleCloth: 1, draw: 1, name: '말', age: 3, sex: 'male', weightLb: 120,
          jockeyName: '기수', trainerId: null, trainerName: null, ownerName: '마주', or: 80, recentForm: [],
          morningOdds: { num: 2, den: 1 }, silks: { primary: '#000000', secondary: '#ffffff', pattern: 'plain' }, isPlayer: true,
        }],
      },
    } as unknown as RaceDayBrief;
  }

  it('보관 결과가 없으면 통산 기록으로, 출주가 없으면 안내 문구로 보인다', () => {
    const state = {
      raceResults: [],
      horses: { h1: { gelded: false, record: { starts: 4, wins: 1, groupWins: 0, blackTypePlacings: 0 } } },
    } as unknown as GameState;
    expect(cardRows(oneRunnerBrief(), state)[0]?.formText).toBe('통산 4전 1승');
    (state.horses.h1 as { record: { starts: number } }).record.starts = 0;
    expect(cardRows(oneRunnerBrief(), state)[0]?.formText).toBe('최근 출주 기록 없음');
  });
});

describe('예상 착순과 사후 코멘트', () => {
  it('내재 확률은 den / (num + den) 이다', () => {
    expect(impliedProbability({ num: 1, den: 1 })).toBe(0.5);
    expect(impliedProbability({ num: 3, den: 1 })).toBe(0.25);
  });

  it('아침 오즈 인기 순위가 예상 착순이다(동률은 같은 순위)', () => {
    // 2/1 은 1/3, 나는 3/1(0.25), 9/2 는 0.18 — 나보다 인기 있는 말은 1두
    const brief = briefWith([
      { horseId: 'a', num: 2, den: 1 }, { horseId: 'me', num: 3, den: 1 }, { horseId: 'c', num: 9, den: 2 },
    ], 'me');
    expect(expectedPosition(brief)).toBe(2);
    expect(() => expectedPosition(briefWith([{ horseId: 'a', num: 2, den: 1 }], 'me'))).toThrow(RangeError);
  });

  it('착순이 예상보다 앞이면 기대 이상, 같으면 기대만큼, 뒤면 아쉬움이다', () => {
    expect(postRaceVerdict(1, 3)).toBe('above');
    expect(postRaceVerdict(3, 3)).toBe('as_expected');
    expect(postRaceVerdict(5, 3)).toBe('below');
    expect(postRaceComment(1, 3)).toMatchObject({ verdict: 'above', label: '기대 이상' });
    expect(postRaceComment(3, 3)).toMatchObject({ verdict: 'as_expected', label: '기대만큼' });
    expect(postRaceComment(6, 3)).toMatchObject({ verdict: 'below', label: '아쉬움' });
    expect(postRaceComment(6, 3).text.length).toBeGreaterThan(0);
  });
});

describe('표기 보조', () => {
  it('작전 선택지는 선행·선입·중단·추입 순서이고 한국어 이름을 쓴다', () => {
    expect(TACTIC_CHOICES.map((c) => c.style)).toEqual(['front', 'prominent', 'midfield', 'held_up']);
    expect(TACTIC_CHOICES.map((c) => c.label)).toEqual(['선행', '선입', '중단', '추입']);
    expect(tacticLabelKo('held_up')).toBe('추입');
  });

  it('착차와 상금 표기', () => {
    expect(marginTextKo(null)).toBe('—');
    // 레이스 화면과 같은 엔진 표기(분수는 ½ 기호)
    expect(marginTextKo({ label: 'lengths', lengths: 1.5 })).toBe('1½마신');
    expect(marginTextKo({ label: 'lengths', lengths: 4.5 })).toBe('4½마신');
    expect(marginTextKo({ label: 'lengths', lengths: 1.75 })).toBe('1¾마신');
    expect(marginTextKo({ label: 'short_head', lengths: 0 })).toBe('짧은 머리');
    expect(prizeOfPosition({ prizeMoney: [50000, 20000] } as never, 2)).toBe(20000);
    expect(prizeOfPosition({ prizeMoney: [50000] } as never, 3)).toBeNull();
  });

  it('OR 변동 한 줄과 첫 부여 표기', () => {
    expect(ratingChangeText({ from: 78, to: 80, date: { year: 1, week: 1 }, raceId: 'r' })).toBe('+2 (78 → 80)');
    expect(ratingChangeText({ from: null, to: 80, date: { year: 1, week: 1 }, raceId: 'r' })).toBe('첫 OR 80 (없음 → 80)');
  });

  it('레이스 당일 진행 방식은 없으면 brief 이고 skip 만 멈추지 않는다', () => {
    expect(raceDayModeOf({} as GameSettings)).toBe('brief');
    expect(raceDayModeOf({ raceDayMode: 'brief' } as GameSettings)).toBe('brief');
    expect(raceDayModeOf({ raceDayMode: 'skip' } as GameSettings)).toBe('skip');
    expect(RACE_DAY_MODE_OPTIONS.map((o) => o.mode)).toEqual(['brief', 'skip']);
  });

  it('예상 페이스와 작전 실패 사유 문구', () => {
    expect(paceTextKo('fast')).toContain('빠른');
    expect(RACE_ORDER_ERROR_KO.not_declared).toContain('출주');
  });
});
