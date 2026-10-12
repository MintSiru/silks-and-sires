import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import g1Json from '../../data/calendar/g1.json';
import patternGbIeJson from '../../data/calendar/pattern_gb_ie.json';
import patternFrDeItJson from '../../data/calendar/pattern_fr_de_it.json';
import seriesJson from '../../data/calendar/series.json';
import { loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { isInPhase } from '../../src/engine/time/calendar';
import type { Racecourse } from '../../src/engine/types/course';
import type { RaceTemplate, SeriesDefinition } from '../../src/engine/types/season';

/**
 * 패턴 레이스(G2·G3·리스티드·헤리티지 핸디캡) 공통 규칙 테스트.
 * G1(g1.json) + 영·아 패턴(pattern_gb_ie.json) + 프·독·이 패턴(pattern_fr_de_it.json) 을 합쳐 검사한다.
 * 개수 하한은 pattern_gb_ie.json 만 대상이다(A4b2 가 FR·DE·IT 개수를 추가한다).
 */

const courses: Racecourse[] = loadRacecourses(racecoursesJson);
const courseById = new Map(courses.map((c) => [c.id, c]));
const G1 = g1Json as unknown as RaceTemplate[];
const GB_IE = patternGbIeJson as unknown as RaceTemplate[];
const FR_DE_IT = patternFrDeItJson as unknown as RaceTemplate[];
const PATTERN = [...GB_IE, ...FR_DE_IT];
const ALL = [...G1, ...PATTERN];
const series = seriesJson as unknown as SeriesDefinition[];

const PRIZE_SHARES = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015];

/** 국가·등급별 총상금(€). 영·아·프 와 독·이 가 다르다(명세 공통 규칙 7) */
const TOTAL: Record<string, Record<string, number>> = {
  GB: { G2: 150000, G3: 80000, L: 55000 },
  IE: { G2: 150000, G3: 80000, L: 55000 },
  FR: { G2: 150000, G3: 80000, L: 55000 },
  DE: { G2: 100000, G3: 55000, L: 30000 },
  IT: { G2: 100000, G3: 55000, L: 30000 },
};
/** 헤리티지 핸디캡 총상금: 영국 200,000(가장 큰 1개 300,000), 아·프 150,000 */
const HERITAGE_TOTAL: Record<string, number> = { GB: 200000, IE: 150000, FR: 150000 };

/** 실명 금지어(CLAUDE.md 원칙 1). calendar.test.ts 목록 + 명세 추가 목록 */
const FORBIDDEN =
  /epsom|ascot|newmarket|york|goodwood|longchamp|chantilly|deauville|curragh|leopardstown|\barc\b|king george|eclipse|sussex|juddmonte|coronation|queen anne|st james|nunthorpe|haydock|doncaster|marois|vermeille|ganay|ispahan|morny|abbaye|cadran|royal-oak|tattersalls|pretty polly|nassau|falmouth|matron|moyglare|phoenix|dewhurst|middle park|cheveley|lockinge|ribblesdale|hardwicke|king edward|queen mary|norfolk|coventry|windsor castle|jersey|wolferton|duke of cambridge|chesham|queen's vase|gold cup|goodwood cup|lonsdale|yorkshire cup|dante|musidora|chester vase|lingfield|craven|greenham|nell gwyn|fred darling|feilden|prix du jockey|royal hunt|wokingham|stewards|cambridgeshire|cesarewitch|ebor|northumberland|lincoln|irish|curragh|leopardstown|galway|gallinule|derrinstown|ballysax|tetrarch|athasi|blandford|ballyroan|matron|flying five/i;

const countryOf = (t: RaceTemplate): string => courseById.get(t.racecourseId)?.country ?? '?';
const total = (t: RaceTemplate): number => t.prizeMoney.reduce((a, b) => a + b, 0);
const isHeritage = (t: RaceTemplate): boolean => t.tags.includes('heritage_handicap');
const slotKey = (t: RaceTemplate): string => `${t.racecourseId}|${t.schedule.month}|${t.schedule.weekOfMonth}`;
const byName = (name: string): RaceTemplate | undefined => ALL.find((t) => t.name === name);
const expectNear = (actual: number, expected: number, label: string): void => {
  expect(Math.abs(actual - expected), `${label}: ${actual} (기준 ${expected} ±10%)`).toBeLessThanOrEqual(expected * 0.1);
};

describe('(1) id·이름 유일, 경로 유효 (전체 캘린더 파일)', () => {
  it('id 가 전체 파일에서 중복 없다', () => {
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('이름이 전체 파일에서 중복 없다', () => {
    const names = ALL.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('모든 레이스: 경마장이 있고 잔디이며, distances 목록에 (거리, layoutId) 가 있고 buildRacePath 가 성공한다', () => {
    for (const t of ALL) {
      const course = courseById.get(t.racecourseId);
      expect(course, `경마장 없음: ${t.name}`).toBeDefined();
      if (course === undefined) continue;
      expect(course.surface, t.name).toBe('turf');
      const listed = course.distances.some((d) => d.distance === t.distance && d.layoutId === t.layoutId);
      expect(listed, `${t.name}: distances 목록에 없음 (${t.distance}, ${t.layoutId})`).toBe(true);
      expect(() => buildRacePath(course, t.distance, t.layoutId), t.name).not.toThrow();
    }
  });
});

describe('(2) 잔디 시즌', () => {
  it('모든 슬롯이 weekOfSlot 으로 변환되고 잔디 시즌(turf_flat) 안이며 올웨더 겨울 주가 아니다', () => {
    for (const t of ALL) {
      const week = weekOfSlot(t.schedule);
      expect(isInPhase(week, 'turf_flat'), t.name).toBe(true);
      expect(isInPhase(week, 'aw_winter'), t.name).toBe(false);
    }
  });
});

describe('(3) 고정 일정: 경마장·월·주 그룹', () => {
  const groups = new Map<string, RaceTemplate[]>();
  for (const t of ALL) {
    const list = groups.get(slotKey(t)) ?? [];
    list.push(t);
    groups.set(slotKey(t), list);
  }

  it('그룹당 고정 일정 레이스는 최대 10개(G1 포함)', () => {
    for (const [key, list] of groups) {
      expect(list.length, key).toBeLessThanOrEqual(10);
    }
  });

  it('cardOrder 는 같은 그룹 안에서 서로 다르고 양의 정수다', () => {
    for (const [key, list] of groups) {
      const orders = list.map((t) => t.cardOrder);
      expect(new Set(orders).size, key).toBe(orders.length);
      for (const o of orders) {
        expect(Number.isInteger(o) && o > 0, key).toBe(true);
      }
    }
  });

  it('국가 최고 위상(national_flagship) G1 은 같은 그룹에서 cardOrder 가 가장 크다', () => {
    for (const t of ALL) {
      if (!t.tags.includes('national_flagship')) continue;
      const list = groups.get(slotKey(t)) ?? [];
      expect(t.cardOrder, t.name).toBe(Math.max(...list.map((x) => x.cardOrder)));
    }
  });
});

describe('(4) 상금과 등급·kind·raceClass·weightSystem 조합', () => {
  it('상금: 6착까지 정수, 6개, 1착부터 배분 비율 대로(±1 이내), 합 = 총상금', () => {
    for (const t of PATTERN) {
      expect(t.prizeMoney, t.name).toHaveLength(6);
      for (const p of t.prizeMoney) {
        expect(Number.isInteger(p), t.name).toBe(true);
      }
      const sum = total(t);
      t.prizeMoney.forEach((p, i) => {
        expect(Math.abs(p - sum * (PRIZE_SHARES[i] ?? 0)), `${t.name} #${i + 1}`).toBeLessThan(1);
      });
    }
  });

  it('상금 총액: 국가·등급별 표와 같다(헤리티지 영국은 300,000 이 1개뿐)', () => {
    for (const t of PATTERN) {
      const country = countryOf(t);
      if (isHeritage(t)) {
        if (country === 'GB') {
          expect([200000, 300000], t.name).toContain(total(t));
        } else if (HERITAGE_TOTAL[country] !== undefined) {
          expect(total(t), t.name).toBe(HERITAGE_TOTAL[country]);
        }
        continue;
      }
      const expected = TOTAL[country]?.[t.grade ?? ''];
      expect(expected, `${t.name}: 상금 표 없음`).toBeDefined();
      expect(total(t), t.name).toBe(expected);
    }
    const gbHeritage = PATTERN.filter((t) => isHeritage(t) && countryOf(t) === 'GB');
    expect(gbHeritage.filter((t) => total(t) === 300000)).toHaveLength(1);
  });

  it('G2·G3: kind group, raceClass 1, wfa, 기준 126lb, OR 범위 null', () => {
    for (const t of PATTERN.filter((x) => x.grade === 'G2' || x.grade === 'G3')) {
      expect(t.kind, t.name).toBe('group');
      expect(t.raceClass, t.name).toBe(1);
      expect(t.conditions.weightSystem, t.name).toBe('wfa');
      expect(t.conditions.baseWeightLb, t.name).toBe(126);
      expect(t.conditions.ratingMin, t.name).toBeNull();
      expect(t.conditions.ratingMax, t.name).toBeNull();
    }
  });

  it('리스티드(L): kind listed, grade L, raceClass 1, wfa, 기준 126lb', () => {
    for (const t of PATTERN.filter((x) => x.grade === 'L')) {
      expect(t.kind, t.name).toBe('listed');
      expect(t.raceClass, t.name).toBe(1);
      expect(t.conditions.weightSystem, t.name).toBe('wfa');
      expect(t.conditions.baseWeightLb, t.name).toBe(126);
    }
  });

  it('헤리티지 핸디캡: kind handicap, grade null, raceClass 2, handicap, 기준 140lb, OR 80~110, maxRunners 20', () => {
    const heritage = PATTERN.filter(isHeritage);
    expect(heritage.length).toBeGreaterThan(0);
    for (const t of heritage) {
      expect(t.kind, t.name).toBe('handicap');
      expect(t.grade, t.name).toBeNull();
      expect(t.raceClass, t.name).toBe(2);
      expect(t.conditions.weightSystem, t.name).toBe('handicap');
      expect(t.conditions.baseWeightLb, t.name).toBe(140);
      expect(t.conditions.ratingMin, t.name).toBe(80);
      expect(t.conditions.ratingMax, t.name).toBe(110);
      expect(t.maxRunners, t.name).toBe(20);
    }
  });

  it('패턴 레이스는 classic·national_flagship 태그를 쓰지 않고, 핸디캡 아닌 레이스는 grade 가 있다', () => {
    for (const t of PATTERN) {
      expect(t.tags, t.name).not.toContain('classic');
      expect(t.tags, t.name).not.toContain('national_flagship');
      if (!isHeritage(t)) expect(t.grade, t.name).not.toBeNull();
    }
  });
});

describe('(5) 태그 일관성 (패턴 레이스)', () => {
  it('stayers ↔ 2,800m 이상, sprint ↔ 1,207m 이하', () => {
    for (const t of PATTERN) {
      expect(t.tags.includes('stayers'), t.name).toBe(t.distance >= 2800);
      expect(t.tags.includes('sprint'), t.name).toBe(t.distance <= 1207);
    }
  });

  it('two_year_old ↔ 2세 전용(minAge 2, maxAge 2), fillies_mares ↔ 암말 한정', () => {
    for (const t of PATTERN) {
      const twoYo = t.conditions.minAge === 2 && t.conditions.maxAge === 2;
      expect(t.tags.includes('two_year_old'), t.name).toBe(twoYo);
      expect(t.tags.includes('fillies_mares'), t.name).toBe(t.conditions.sex === 'fillies_mares');
    }
  });
});

describe('(6) 시리즈 (data/calendar/series.json)', () => {
  const ids = new Set(ALL.map((t) => t.id));

  it('모든 legs·requiredLegs 의 id 가 전체 캘린더 파일에 있다', () => {
    for (const s of series) {
      for (const leg of s.legs) {
        expect(ids.has(leg), `${s.id}: ${leg}`).toBe(true);
      }
      for (const leg of s.requiredLegs ?? []) {
        expect(s.legs, s.id).toContain(leg);
      }
    }
  });

  it('legs 는 중복 없고, crown 의 winsRequired 는 legs 수 이하다', () => {
    for (const s of series) {
      expect(new Set(s.legs).size, s.id).toBe(s.legs.length);
      if (s.kind === 'crown') {
        expect(s.winsRequired ?? s.legs.length, s.id).toBeLessThanOrEqual(s.legs.length);
      }
    }
  });

  it('영국 오크스 3관: Ashcombe Oaks · Ladysmock Stakes · Northern Oaks, 3승', () => {
    const s = series.find((x) => x.id === 'british_oaks_triple');
    expect(s).toMatchObject({ legs: ['ashcombe_oaks', 'primrose_stakes', 'northern_oaks'], winsRequired: 3 });
  });

  it('유러피언 스테이어 시리즈: 5레그, 3승, Kingsmere Cup 필수', () => {
    const s = series.find((x) => x.id === 'european_stayers_series');
    expect(s).toMatchObject({
      legs: ['easterholm_spring_cup', 'kingsmere_cup', 'selsworth_cup', 'easterholm_cup', 'prix_du_long_chemin'],
      winsRequired: 3,
      requiredLegs: ['kingsmere_cup'],
    });
  });
});

describe('(7) 실명 금지 (전체 캘린더 파일 + 시리즈)', () => {
  const text = JSON.stringify([G1, GB_IE, FR_DE_IT, series]);

  it('금지 실명 정규식에 걸리는 문자열이 없다', () => {
    expect(text.match(FORBIDDEN)).toBeNull();
  });

  it('실제 레이스 전체 이름(Epsom Derby 등)이 없다', () => {
    for (const word of ['Epsom Derby', 'Irish Derby', 'Kentucky Derby', 'Irish Oaks', 'Irish St Leger', 'Derby Italiano']) {
      expect(text.includes(word), word).toBe(false);
    }
  });
});

describe('(8) pattern_gb_ie.json 개수 하한·필수 레이스 (영·아)', () => {
  const gb = GB_IE.filter((t) => countryOf(t) === 'GB');
  const ie = GB_IE.filter((t) => countryOf(t) === 'IE');
  const count = (list: RaceTemplate[], grade: string) => list.filter((t) => t.grade === grade).length;

  it('영국 G2 14 · G3 22 · L 22 · 헤리티지 핸디캡 6 (±10%)', () => {
    expectNear(count(gb, 'G2'), 14, 'GB G2');
    expectNear(count(gb, 'G3'), 22, 'GB G3');
    expectNear(count(gb, 'L'), 22, 'GB L');
    expectNear(gb.filter(isHeritage).length, 6, 'GB 헤리티지');
  });

  it('아일랜드 G2 5 · G3 10 · L 10 · 헤리티지 핸디캡 1 (±10%)', () => {
    expectNear(count(ie, 'G2'), 5, 'IE G2');
    expectNear(count(ie, 'G3'), 10, 'IE G3');
    expectNear(count(ie, 'L'), 10, 'IE L');
    expectNear(ie.filter(isHeritage).length, 1, 'IE 헤리티지');
  });

  it('2세 G2 ≥ 4, 2세 G3 ≥ 4 (영·아 패턴)', () => {
    const twoYo = (grade: string) => GB_IE.filter((t) => t.grade === grade && t.tags.includes('two_year_old')).length;
    expect(twoYo('G2')).toBeGreaterThanOrEqual(4);
    expect(twoYo('G3')).toBeGreaterThanOrEqual(4);
  });

  it('필수 레이스: Ladysmock Stakes · Easterholm Spring Cup · Easterholm Cup 의 경마장·일정·조건', () => {
    expect(byName('Ladysmock Stakes')).toMatchObject({
      racecourseId: 'kingsmere_heath', distance: 2414, layoutId: 'kingsmere_triangle', grade: 'G2',
      schedule: { month: 6, weekOfMonth: 3 }, conditions: { minAge: 3, maxAge: 3, sex: 'fillies_mares' },
    });
    expect(byName('Easterholm Spring Cup')).toMatchObject({
      racecourseId: 'easterholm', distance: 2816, grade: 'G2',
      schedule: { month: 5, weekOfMonth: 2 }, conditions: { minAge: 4, maxAge: null },
    });
    expect(byName('Easterholm Cup')).toMatchObject({
      racecourseId: 'easterholm', distance: 3319, grade: 'G2',
      schedule: { month: 8, weekOfMonth: 3 }, conditions: { minAge: 3, maxAge: null },
    });
  });

  it('Kingsmere 6월 3주 고정 일정은 10개(G1 8 + Ladysmock + 2세 1)', () => {
    const list = ALL.filter((t) => t.racecourseId === 'kingsmere_heath' && t.schedule.month === 6 && t.schedule.weekOfMonth === 3);
    expect(list).toHaveLength(10);
  });

  it('클래식 트라이얼: 2000/1000 Guineas 각 2개(영·아), 더비·오크스 트라이얼 2개 이상, 세인트레저 트라이얼 8월 1개 이상', () => {
    const trials = GB_IE.filter((t) => t.tags.includes('trial'));
    const guineas2000 = trials.filter((t) => t.name.includes('Guineas Trial') && !t.name.includes('Fillies'));
    const guineas1000 = trials.filter((t) => t.name.includes('Fillies Guineas Trial'));
    expect(guineas2000).toHaveLength(4);
    expect(guineas1000).toHaveLength(4);
    expect(trials.filter((t) => t.name.includes('Derby Trial')).length).toBeGreaterThanOrEqual(2);
    expect(trials.filter((t) => t.name.includes('Oaks Trial')).length).toBeGreaterThanOrEqual(2);
    const stLeger = trials.filter((t) => t.name.includes('St Leger Trial'));
    expect(stLeger.length).toBeGreaterThanOrEqual(1);
    expect(stLeger.every((t) => t.schedule.month === 8)).toBe(true);
  });

  it('클래식 트라이얼은 짝이 되는 G1 보다 3~5주 앞이다', () => {
    const pairs: [RaceTemplate, string][] = [];
    for (const t of trialsWithClassic()) {
      pairs.push([t.trial, t.classic]);
    }
    expect(pairs.length).toBeGreaterThan(0);
    for (const [trial, classicName] of pairs) {
      const classic = byName(classicName);
      expect(classic, classicName).toBeDefined();
      if (classic === undefined) continue;
      const gap = weekOfSlot(classic.schedule) - weekOfSlot(trial.schedule);
      expect(gap, `${trial.name} → ${classicName}`).toBeGreaterThanOrEqual(3);
      expect(gap, `${trial.name} → ${classicName}`).toBeLessThanOrEqual(5);
    }
  });
});

/** 트라이얼 이름 → 짝이 되는 클래식 G1 이름. 영국은 Marlow·Ashcombe·Dunholme, 아일랜드는 Kilcarrow 기준 */
function trialsWithClassic(): { trial: RaceTemplate; classic: string }[] {
  const out: { trial: RaceTemplate; classic: string }[] = [];
  for (const t of GB_IE.filter((x) => x.tags.includes('trial'))) {
    const gb = countryOf(t) === 'GB';
    let classic: string | null = null;
    if (t.name.includes('Fillies Guineas Trial')) classic = gb ? 'Marlow 1000 Guineas' : 'Kilcarrow 1000 Guineas';
    else if (t.name.includes('Guineas Trial')) classic = gb ? 'Marlow 2000 Guineas' : 'Kilcarrow 2000 Guineas';
    else if (t.name.includes('Derby Trial')) classic = gb ? 'Ashcombe Derby' : 'Kilcarrow Derby';
    else if (t.name.includes('Oaks Trial')) classic = gb ? 'Ashcombe Oaks' : 'Kilcarrow Oaks';
    else if (t.name.includes('St Leger Trial')) classic = 'Dunholme St Leger';
    if (classic !== null) out.push({ trial: t, classic });
  }
  return out;
}
