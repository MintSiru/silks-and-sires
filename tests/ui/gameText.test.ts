import { describe, expect, it } from 'vitest';
import commentsJson from '../../data/text/comments.ko.json';
import { formatDateKo } from '../../src/engine/time/calendar';
import type { BookingError } from '../../src/engine/breeding/season';
import {
  COMMENT_KEYS,
  type AssessmentComment,
  type CountryCode,
  type GameEvent,
  type HorseStatus,
} from '../../src/engine/types';
import {
  bookingErrorKo,
  commentText,
  complementKo,
  conformationLabelKo,
  countryKo,
  distanceHintKo,
  eventKo,
  feeKo,
  gradeColor,
  growthKo,
  matingRoleKo,
  nickLabelKo,
  phaseKo,
  sexKo,
  stageKo,
  statusKo,
  type ConformationKey,
} from '../../src/ui/game/text';

const nameOf = (id: string): string => `말-${id}`;

describe('matingRoleKo', () => {
  it('배합 역할 값마다 정해진 한국어 문구를 돌려준다', () => {
    expect(matingRoleKo('speed')).toBe('스피드 담당');
    expect(matingRoleKo('balanced')).toBe('균형형');
    expect(matingRoleKo('stamina')).toBe('스태미나 담당');
    expect(matingRoleKo('unknown')).toBe('미상');
  });

  it('모든 역할 값에 서로 다른 문구를 준다', () => {
    const texts = (['speed', 'balanced', 'stamina', 'unknown'] as const).map((r) => matingRoleKo(r));
    expect(new Set(texts).size).toBe(4);
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

describe('complementKo', () => {
  it('보완형 가능성 값마다 정해진 한국어 문구를 돌려준다', () => {
    expect(complementKo('likely')).toBe('보완형 배합 (부마 스피드 + 모계 스태미나)');
    expect(complementKo('unlikely')).toBe('보완형 아님');
    expect(complementKo('unknown')).toBe('판단 불가 (외조부 미상)');
  });

  it('모든 보완형 값에 서로 다른 문구를 준다', () => {
    const texts = (['likely', 'unlikely', 'unknown'] as const).map((c) => complementKo(c));
    expect(new Set(texts).size).toBe(3);
  });
});

describe('commentText', () => {
  it('같은 seedKey 는 항상 같은 문장을 고른다', () => {
    const c: AssessmentComment = { key: 'speed_good', tone: 'positive' };
    const first = commentText(c, 'h-000001:2026:7');
    for (let i = 0; i < 5; i++) {
      expect(commentText(c, 'h-000001:2026:7')).toBe(first);
    }
  });

  it('모든 COMMENT_KEYS 에 대해 데이터 표의 문장 중 하나를 돌려준다', () => {
    const table = commentsJson as Record<string, string[]>;
    for (const key of COMMENT_KEYS) {
      const sentence = commentText({ key, tone: 'neutral' }, `seed-${key}`);
      expect(typeof sentence).toBe('string');
      expect(sentence.length).toBeGreaterThan(0);
      expect(table[key]).toContain(sentence);
    }
  });

  it('seedKey 가 다르면 여러 문장 중에서 골라질 수 있다', () => {
    const c: AssessmentComment = { key: 'overall_star', tone: 'positive' };
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seen.add(commentText(c, `horse-${i}`));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('distanceHintKo', () => {
  it('1,400m ~ 2,000m 을 펄롱과 함께 표기한다', () => {
    expect(distanceHintKo({ min: 1400, max: 2000 })).toBe('1,400m ~ 2,000m (7f ~ 10f)');
  });

  it('펄롱 반 단위는 ½ 로 표기한다', () => {
    expect(distanceHintKo({ min: 1300, max: 1300 })).toBe('1,300m ~ 1,300m (6½f ~ 6½f)');
  });

  it('잘못된 범위는 RangeError 를 던진다', () => {
    expect(() => distanceHintKo({ min: 2000, max: 1400 })).toThrow(RangeError);
  });
});

describe('feeKo', () => {
  it('유로 기호와 천 단위 쉼표를 붙인다', () => {
    expect(feeKo(60000)).toBe('€60,000');
    expect(feeKo(500000)).toBe('€500,000');
    expect(feeKo(999)).toBe('€999');
    expect(feeKo(0)).toBe('€0');
  });
});

describe('gradeColor', () => {
  it('등급별 hex 색을 돌려준다', () => {
    expect(gradeColor('S')).toBe('#d4af37');
    expect(gradeColor('A')).toBe('#2e8b57');
    expect(gradeColor('B')).toBe('#20b2aa');
    expect(gradeColor('C')).toBe('#808080');
    expect(gradeColor('D')).toBe('#ff8c00');
    expect(gradeColor('E')).toBe('#d62828');
    for (const g of ['S', 'A', 'B', 'C', 'D', 'E'] as const) {
      expect(gradeColor(g)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('라벨 표', () => {
  it('닉스 라벨 한국어', () => {
    expect(nickLabelKo('excellent')).toBe('최상');
    expect(nickLabelKo('good')).toBe('좋음');
    expect(nickLabelKo('neutral')).toBe('보통');
    expect(nickLabelKo('poor')).toBe('나쁨');
    expect(nickLabelKo('unknown')).toBe('미확인');
  });

  it('성장형 한국어', () => {
    expect(growthKo('precocious')).toBe('조숙');
    expect(growthKo('normal')).toBe('보통');
    expect(growthKo('late')).toBe('만성');
    expect(growthKo('unknown')).toBe('미상');
  });

  it('평가 단계 한국어', () => {
    expect(stageKo('foal')).toBe('망아지');
    expect(stageKo('yearling')).toBe('1세');
    expect(stageKo('two_year_old')).toBe('2세');
    expect(stageKo('in_training')).toBe('조교 중');
  });

  it('말 상태 한국어는 모든 상태에 대해 비어 있지 않다', () => {
    const all: HorseStatus[] = [
      'foal', 'weanling', 'yearling', 'in_training', 'resting',
      'retired', 'stud', 'broodmare', 'dead', 'historical',
    ];
    for (const s of all) {
      expect(statusKo(s).length).toBeGreaterThan(0);
    }
    expect(statusKo('broodmare')).toBe('번식 암말');
  });
});

describe('phaseKo', () => {
  it('달력 단계 한국어 이름을 돌려준다', () => {
    expect(phaseKo('foaling')).toBe('출산 시기');
    expect(phaseKo('breeding')).toBe('교배 시기');
    expect(phaseKo('turf_flat')).toBe('잔디 평지 시즌');
    expect(phaseKo('aw_winter')).toBe('올웨더 겨울 시즌');
  });
});

describe('eventKo', () => {
  const date = { year: 2026, week: 7 };

  it('교배 예약 이벤트에 두 말 이름과 종부료를 넣는다', () => {
    const e: GameEvent = {
      type: 'covering_booked',
      mareId: 'h-000001',
      stallionId: 'h-000002',
      fee: 60000,
      date,
    };
    expect(eventKo(e, nameOf)).toBe(
      `${formatDateKo(date)} · 말-h-000001 교배 예약 (말-h-000002, 종부료 €60,000)`,
    );
  });

  it('수태 성공·실패를 구분한다', () => {
    const ok: GameEvent = {
      type: 'conception', mareId: 'm', stallionId: 's', success: true, date,
    };
    const ng: GameEvent = {
      type: 'conception', mareId: 'm', stallionId: 's', success: false, date,
    };
    expect(eventKo(ok, nameOf)).toContain('수태 성공');
    expect(eventKo(ng, nameOf)).toContain('수태 실패');
  });

  it('출산·상태 변화·새해·단계 이벤트를 한 줄로 요약한다', () => {
    const events: GameEvent[] = [
      { type: 'foal_born', foalId: 'f', mareId: 'm', stallionId: 's', date },
      { type: 'horse_status_changed', horseId: 'h', from: 'yearling', to: 'in_training', date },
      { type: 'new_year', year: 2027 },
      { type: 'phase_started', phase: 'breeding', date },
      { type: 'phase_ended', phase: 'foaling', date },
      { type: 'week_started', date },
    ];
    for (const e of events) {
      const line = eventKo(e, nameOf);
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('\n');
    }
    expect(eventKo({ type: 'new_year', year: 2027 }, nameOf)).toBe('2027년이 시작되었습니다');
    expect(eventKo(events[1] as GameEvent, nameOf)).toBe('말-h: 1세 → 조교 중');
  });

  it('출력에 숫자 능력치를 포함하지 않는다(종부료·날짜 숫자만 허용)', () => {
    const e: GameEvent = {
      type: 'foal_born', foalId: 'f', mareId: 'm', stallionId: 's', date,
    };
    const line = eventKo(e, nameOf);
    expect(line).not.toMatch(/능력|레이팅|rating|speed|stamina/i);
  });
});

describe('sexKo', () => {
  it('암말, 수말, 거세마를 구분한다', () => {
    expect(sexKo('female', false)).toBe('암말');
    expect(sexKo('male', false)).toBe('수말');
    expect(sexKo('male', true)).toBe('거세마');
  });
});

describe('conformationLabelKo', () => {
  it('마체 평가 6항목 라벨을 모두 돌려준다', () => {
    const keys: ConformationKey[] = ['overall', 'frame', 'hindquarters', 'legs', 'action', 'temperament'];
    const labels = keys.map((k) => conformationLabelKo(k));
    expect(labels).toEqual(['종합', '체격', '후구', '다리', '걸음', '기질']);
  });
});

describe('bookingErrorKo', () => {
  it('BookingError 의 모든 종류를 매핑하고 서로 다른 문장을 준다', () => {
    const all: BookingError[] = [
      'not_breeding_season',
      'not_your_mare',
      'not_a_broodmare',
      'mare_too_young',
      'already_pregnant',
      'already_covered',
      'stallion_not_available',
      'book_full',
      'insufficient_funds',
    ];
    const texts = all.map((e) => bookingErrorKo(e));
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(0);
    }
    expect(new Set(texts).size).toBe(all.length);
  });
});

describe('countryKo', () => {
  it('CountryCode 전부에 한국어 국가명을 준다', () => {
    const all: CountryCode[] = ['GB', 'IE', 'FR', 'DE', 'IT', 'JP', 'US', 'AU', 'HK', 'AE', 'CA', 'AR', 'NZ'];
    for (const c of all) {
      expect(countryKo(c).length).toBeGreaterThan(0);
    }
    expect(countryKo('GB')).toBe('영국');
    expect(countryKo('IE')).toBe('아일랜드');
    expect(countryKo('FR')).toBe('프랑스');
  });
});
