import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import g1Json from '../../data/calendar/g1.json';
import patternGbIeJson from '../../data/calendar/pattern_gb_ie.json';
import patternFrDeItJson from '../../data/calendar/pattern_fr_de_it.json';
import { loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { isInPhase } from '../../src/engine/time/calendar';
import type { Racecourse } from '../../src/engine/types/course';
import type { RaceTemplate } from '../../src/engine/types/season';

const courses: Racecourse[] = loadRacecourses(racecoursesJson);
const courseById = new Map(courses.map((c) => [c.id, c]));
const G1 = g1Json as unknown as RaceTemplate[];
const GB_IE = patternGbIeJson as unknown as RaceTemplate[];
const FDI = patternFrDeItJson as unknown as RaceTemplate[];
const ALL = [...G1, ...GB_IE, ...FDI];

type Country = 'FR' | 'DE' | 'IT';

const countryOf = (t: RaceTemplate): string => courseById.get(t.racecourseId)?.country ?? '?';
const weekOf = (t: RaceTemplate): number => weekOfSlot(t.schedule);
const isHeritage = (t: RaceTemplate): boolean => t.tags.includes('heritage_handicap');

/** 이 파일의 나라·등급별 레코드 수 (헤리티지 핸디캡은 grade 가 null 이므로 따로 센다) */
function countOf(country: Country, grade: 'G2' | 'G3' | 'L' | 'H'): number {
  return FDI.filter((t) => {
    if (countryOf(t) !== country) return false;
    return grade === 'H' ? isHeritage(t) : t.grade === grade;
  }).length;
}

/** 목표값의 ±10% 이내인지 */
function expectWithinTenPercent(actual: number, target: number, label: string): void {
  expect(Math.abs(actual - target), `${label}: ${actual} (목표 ${target})`).toBeLessThanOrEqual(target * 0.1);
}

function g1ById(id: string): RaceTemplate {
  const t = G1.find((x) => x.id === id);
  if (t === undefined) throw new Error(`g1.json 에 없음: ${id}`);
  return t;
}

const PRIZE_SHARES = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015];

describe('(1) 나라·등급별 개수 (이 파일만, ±10%)', () => {
  it('프랑스 G2 12 · G3 16 · L 14, 헤리티지 핸디캡 1', () => {
    expectWithinTenPercent(countOf('FR', 'G2'), 12, '프랑스 G2');
    expectWithinTenPercent(countOf('FR', 'G3'), 16, '프랑스 G3');
    expectWithinTenPercent(countOf('FR', 'L'), 14, '프랑스 L');
    expect(countOf('FR', 'H')).toBe(1);
  });

  it('독일 G2 4 · G3 6 · L 6', () => {
    expectWithinTenPercent(countOf('DE', 'G2'), 4, '독일 G2');
    expectWithinTenPercent(countOf('DE', 'G3'), 6, '독일 G3');
    expectWithinTenPercent(countOf('DE', 'L'), 6, '독일 L');
  });

  it('이탈리아 G2 2 · G3 4 · L 4', () => {
    expectWithinTenPercent(countOf('IT', 'G2'), 2, '이탈리아 G2');
    expectWithinTenPercent(countOf('IT', 'G3'), 4, '이탈리아 G3');
    expectWithinTenPercent(countOf('IT', 'L'), 4, '이탈리아 L');
  });

  it('합 69 (±10%), 독·이 클래식(Guineas·Derby·Oaks·St Leger 본경주)은 이 파일에 없다', () => {
    expectWithinTenPercent(FDI.length, 69, '합');
    const classic = FDI.filter((t) => /Guineas|Derby|Oaks|St Leger/.test(t.name) || t.tags.includes('classic'));
    expect(classic.map((t) => t.name)).toEqual([]);
  });
});

describe('(2) 필수 레이스', () => {
  it('Saint-Ourens 9월 2주 트라이얼 3개: G2 · 2,400m · 3세 open, 4+ open, 3세 이상 암말', () => {
    const trials = FDI.filter((t) => t.racecourseId === 'saint_ourens' && t.schedule.month === 9
      && t.schedule.weekOfMonth === 2 && t.tags.includes('trial'));
    expect(trials).toHaveLength(3);
    for (const t of trials) {
      expect(t.grade, t.name).toBe('G2');
      expect(t.distance, t.name).toBe(2400);
    }
    const shapes = trials.map((t) => `${t.conditions.minAge}-${t.conditions.maxAge ?? 'null'}-${t.conditions.sex}`).sort();
    expect(shapes).toEqual(['3-3-open', '3-null-fillies_mares', '4-null-open']);
  });

  it('Saint-Ourens 2000 Guineas 의 3~5주 전 트라이얼(3세 open), 1000 Guineas 의 3~5주 전 트라이얼(3세 암말)', () => {
    const g2000 = weekOf(g1ById('saint_ourens_2000_guineas'));
    const g1000 = weekOf(g1ById('saint_ourens_1000_guineas'));
    const so = FDI.filter((t) => t.racecourseId === 'saint_ourens' && t.tags.includes('trial'));
    const colt = so.filter((t) => t.conditions.minAge === 3 && t.conditions.maxAge === 3 && t.conditions.sex === 'open');
    const filly = so.filter((t) => t.conditions.minAge === 3 && t.conditions.maxAge === 3 && t.conditions.sex === 'fillies_mares');
    expect(colt.some((t) => g2000 - weekOf(t) >= 3 && g2000 - weekOf(t) <= 5)).toBe(true);
    expect(filly.some((t) => g1000 - weekOf(t) >= 3 && g1000 - weekOf(t) <= 5)).toBe(true);
  });

  it('Vallenaire Derby·Oaks 트라이얼: 5월에 각 1개 이상 (3세 open / 3세 암말)', () => {
    const may = FDI.filter((t) => t.racecourseId === 'vallenaire' && t.schedule.month === 5 && t.tags.includes('trial'));
    expect(may.some((t) => t.conditions.minAge === 3 && t.conditions.maxAge === 3 && t.conditions.sex === 'open')).toBe(true);
    expect(may.some((t) => t.conditions.minAge === 3 && t.conditions.maxAge === 3 && t.conditions.sex === 'fillies_mares')).toBe(true);
    for (const t of may) expect(weekOf(t), t.name).toBeLessThan(weekOf(g1ById('vallenaire_derby')));
  });

  it('Hohenmoor Derby 트라이얼: 5~6월 1개 이상, Derby 보다 앞', () => {
    const derby = g1ById('hohenmoor_derby');
    const trials = FDI.filter((t) => t.racecourseId === 'hohenmoor' && t.tags.includes('trial')
      && (t.schedule.month === 5 || t.schedule.month === 6));
    expect(trials.length).toBeGreaterThanOrEqual(1);
    expect(trials.some((t) => weekOf(t) < weekOf(derby))).toBe(true);
  });

  it('Torreverde Derby 트라이얼: 4~5월 1개 이상, Derby 보다 앞', () => {
    const derby = g1ById('torreverde_derby');
    const trials = FDI.filter((t) => t.racecourseId === 'torreverde' && t.tags.includes('trial')
      && (t.schedule.month === 4 || t.schedule.month === 5));
    expect(trials.length).toBeGreaterThanOrEqual(1);
    expect(trials.some((t) => weekOf(t) < weekOf(derby))).toBe(true);
  });

  it('프랑스 2세 G2·G3 각 3개 이상, 여름 Port-Aubray · 가을 Saint-Ourens · Clairval 포함', () => {
    const fr2 = FDI.filter((t) => countryOf(t) === 'FR' && t.conditions.minAge === 2 && t.conditions.maxAge === 2);
    expect(fr2.filter((t) => t.grade === 'G2').length).toBeGreaterThanOrEqual(3);
    expect(fr2.filter((t) => t.grade === 'G3').length).toBeGreaterThanOrEqual(3);
    expect(fr2.some((t) => t.racecourseId === 'port_aubray' && t.schedule.month === 8)).toBe(true);
    expect(fr2.some((t) => t.racecourseId === 'saint_ourens' && t.schedule.month === 10)).toBe(true);
    expect(fr2.some((t) => t.racecourseId === 'clairval' && (t.schedule.month === 10 || t.schedule.month === 11))).toBe(true);
  });

  it('Montvigne · Bellerive-le-Bois 에 G3 또는 L 각 2개 이상', () => {
    for (const course of ['montvigne', 'bellerive_le_bois']) {
      const n = FDI.filter((t) => t.racecourseId === course && (t.grade === 'G3' || t.grade === 'L')).length;
      expect(n, course).toBeGreaterThanOrEqual(2);
    }
  });

  it('헤리티지 핸디캡(프랑스): kind handicap, 클래스 2, OR 80~110, 최대 20두', () => {
    const h = FDI.filter(isHeritage);
    expect(h).toHaveLength(1);
    const [t] = h;
    expect(t?.kind).toBe('handicap');
    expect(t?.grade).toBeNull();
    expect(t?.raceClass).toBe(2);
    expect(t?.conditions).toMatchObject({ ratingMin: 80, ratingMax: 110, weightSystem: 'handicap', baseWeightLb: 140 });
    expect(t?.maxRunners).toBe(20);
    expect(t && countryOf(t)).toBe('FR');
  });
});

describe('(3) 이름·id 중복 (다른 캘린더 파일과)', () => {
  it('이 파일의 id·이름이 g1.json · pattern_gb_ie.json 과 겹치지 않고, 이 파일 안에서도 유일하다', () => {
    const others = [...G1, ...GB_IE];
    const otherIds = new Set(others.map((t) => t.id));
    const otherNames = new Set(others.map((t) => t.name));
    for (const t of FDI) {
      expect(otherIds.has(t.id), `id 중복: ${t.id}`).toBe(false);
      expect(otherNames.has(t.name), `이름 중복: ${t.name}`).toBe(false);
    }
    expect(new Set(FDI.map((t) => t.id)).size).toBe(FDI.length);
    expect(new Set(FDI.map((t) => t.name)).size).toBe(FDI.length);
  });

  it('이름 형식: 프랑스 Prix …, 독일 Preis von … 또는 …-Rennen, 이탈리아 Premio …', () => {
    for (const t of FDI) {
      const c = countryOf(t);
      if (c === 'FR') expect(t.name.startsWith('Prix '), t.name).toBe(true);
      if (c === 'DE') expect(t.name.startsWith('Preis von ') || t.name.endsWith('-Rennen'), t.name).toBe(true);
      if (c === 'IT') expect(t.name.startsWith('Premio '), t.name).toBe(true);
    }
  });
});

describe('(4) 공통 검사 (이 파일 대상, pattern.test.ts 가 생기면 같은 검사가 중복된다)', () => {
  it('모든 레이스가 경마장 distances 목록에 있고 buildRacePath 가 성공하며 잔디다', () => {
    for (const t of FDI) {
      const course = courseById.get(t.racecourseId);
      expect(course, t.name).toBeDefined();
      if (course === undefined) continue;
      expect(course.surface, t.name).toBe('turf');
      expect(Number.isInteger(t.distance), t.name).toBe(true);
      const listed = course.distances.some((d) => d.distance === t.distance && d.layoutId === t.layoutId);
      expect(listed, `${t.name}: distances 목록에 없음`).toBe(true);
      expect(() => buildRacePath(course, t.distance, t.layoutId), t.name).not.toThrow();
    }
  });

  it('일정은 잔디 시즌 안(4월 1주 ~ 11월 4주, turf_flat, aw_winter 아님)', () => {
    const first = weekOfSlot({ month: 4, weekOfMonth: 1 });
    const last = weekOfSlot({ month: 11, weekOfMonth: 4 });
    for (const t of FDI) {
      const w = weekOf(t);
      expect(w, t.name).toBeGreaterThanOrEqual(first);
      expect(w, t.name).toBeLessThanOrEqual(last);
      expect(isInPhase(w, 'turf_flat'), t.name).toBe(true);
      expect(isInPhase(w, 'aw_winter'), t.name).toBe(false);
    }
  });

  it('cardOrder: 같은 (경마장, 월, 주) 안에서 모든 캘린더 파일을 합쳐 서로 다르고, 개최일당 10개 이하', () => {
    const groups = new Map<string, RaceTemplate[]>();
    for (const t of ALL) {
      const key = `${t.racecourseId}|${t.schedule.month}|${t.schedule.weekOfMonth}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    for (const [key, list] of groups) {
      expect(new Set(list.map((t) => t.cardOrder)).size, key).toBe(list.length);
      expect(list.length, key).toBeLessThanOrEqual(10);
      for (const t of list) expect(Number.isInteger(t.cardOrder), t.name).toBe(true);
    }
  });

  it('G1 이 있는 개최일의 이 파일 레코드는 cardOrder 가 10 의 배수가 아니고, 국가 최고 위상은 그 개최일의 최대', () => {
    for (const t of FDI) {
      const group = ALL.filter((x) => x.racecourseId === t.racecourseId
        && x.schedule.month === t.schedule.month && x.schedule.weekOfMonth === t.schedule.weekOfMonth);
      if (!group.some((x) => x.grade === 'G1')) continue;
      expect(t.cardOrder % 10, t.name).not.toBe(0);
    }
    for (const t of ALL) {
      if (!t.tags.includes('national_flagship')) continue;
      const group = ALL.filter((x) => x.racecourseId === t.racecourseId
        && x.schedule.month === t.schedule.month && x.schedule.weekOfMonth === t.schedule.weekOfMonth);
      expect(t.cardOrder, t.name).toBe(Math.max(...group.map((x) => x.cardOrder)));
    }
  });

  it('상금: 6착까지 정수, 합 = 총상금, 배분 비율, 총상금은 국가·등급별 계획값', () => {
    const TOTAL: Record<string, number> = {
      'FR G2': 150000, 'FR G3': 80000, 'FR L': 55000, 'FR H': 150000,
      'DE G2': 100000, 'DE G3': 55000, 'DE L': 30000,
      'IT G2': 100000, 'IT G3': 55000, 'IT L': 30000,
    };
    for (const t of FDI) {
      const key = `${countryOf(t)} ${isHeritage(t) ? 'H' : t.grade}`;
      const total = TOTAL[key];
      expect(total, t.name).toBeDefined();
      expect(t.prizeMoney, t.name).toHaveLength(6);
      for (const p of t.prizeMoney) expect(Number.isInteger(p), t.name).toBe(true);
      expect(t.prizeMoney.reduce((a, b) => a + b, 0), t.name).toBe(total);
      t.prizeMoney.forEach((p, i) => {
        expect(Math.abs(p - (total ?? 0) * (PRIZE_SHARES[i] ?? 0)), `${t.name} #${i + 1}`).toBeLessThan(1);
      });
    }
  });

  it('등급·kind·raceClass·조건 규칙: G2/G3 는 group, L 은 listed, wfa·126lb·OR null', () => {
    for (const t of FDI) {
      if (isHeritage(t)) continue;
      expect(t.kind, t.name).toBe(t.grade === 'L' ? 'listed' : 'group');
      expect(['G2', 'G3', 'L'], t.name).toContain(t.grade);
      expect(t.raceClass, t.name).toBe(1);
      expect(t.conditions, t.name).toMatchObject({ weightSystem: 'wfa', baseWeightLb: 126, ratingMin: null, ratingMax: null });
    }
  });

  it('태그 일관성: stayers ≥ 2,800m, sprint ≤ 1,207m, two_year_old = 2세 전용, fillies_mares = 암말 한정, 금지 태그 없음', () => {
    for (const t of FDI) {
      expect(t.tags.includes('stayers'), t.name).toBe(t.distance >= 2800);
      expect(t.tags.includes('sprint'), t.name).toBe(t.distance <= 1207);
      expect(t.tags.includes('two_year_old'), t.name).toBe(t.conditions.minAge === 2 && t.conditions.maxAge === 2);
      expect(t.tags.includes('fillies_mares'), t.name).toBe(t.conditions.sex === 'fillies_mares');
      expect(t.tags.includes('classic'), t.name).toBe(false);
      expect(t.tags.includes('national_flagship'), t.name).toBe(false);
    }
  });

  it('maxRunners: 헤리티지 20, 2세 12, 1,207m 이하(2세 제외) 16, 나머지 14', () => {
    for (const t of FDI) {
      let want = 14;
      if (isHeritage(t)) want = 20;
      else if (t.conditions.minAge === 2) want = 12;
      else if (t.distance <= 1207) want = 16;
      expect(t.maxRunners, t.name).toBe(want);
    }
  });

  it('조건 약어 규칙: 3세 이상·4세 이상은 maxAge null, 2세 경주는 minAge = maxAge = 2', () => {
    for (const t of FDI) {
      expect(t.conditions.minAge, t.name).toBeGreaterThanOrEqual(2);
      if (t.conditions.maxAge !== null) expect(t.conditions.maxAge, t.name).toBeGreaterThanOrEqual(t.conditions.minAge);
    }
  });
});

describe('(5) 실명 금지 (이 파일의 텍스트)', () => {
  const text = JSON.stringify(patternFrDeItJson);
  const FORBIDDEN_FDI =
    /longchamp|chantilly|deauville|saint-cloud|maisons|laffitte|lyon|marseille|diane|jockey club|ganay|ispahan|lupin|greffulhe|hocquart|noailles|niel|\bfoy\b|vermeille|royallieu|chaudenay|wildenstein|dollar|\bforet\b|forêt|abbaye|gheest|marois|rothschild|morny|salamandre|boussac|lagard|saint-alary|harcourt|gladiateur|kergorlay|gontaut|guiche|cadran|royal-oak|calvados|\bdu pin\b|europa|bayerisch|dallmayr|union-rennen|baden|hamburg|köln|koln|düsseldorf|dusseldorf|hoppegarten|münchen|munchen|presidente|tesio|roma|milano|ribot|capua|capannelle|san siro|italiano|deutsch|german|french|italian|derby italiano/i;
  // tests/data/calendar.test.ts 의 금지 목록 (같은 파일 대상)
  const FORBIDDEN_CALENDAR =
    /epsom|ascot|newmarket|york|goodwood|longchamp|chantilly|deauville|curragh|leopardstown|\barc\b|king george|eclipse|sussex|juddmonte|coronation|queen anne|st james|nunthorpe|haydock|doncaster|marois|vermeille|ganay|ispahan|morny|abbaye|cadran|royal-oak|tattersalls|pretty polly|nassau|falmouth|matron|moyglare|phoenix|dewhurst|middle park|cheveley|lockinge/i;

  it('spec 금지어 목록에 걸리는 텍스트가 없다', () => {
    expect(text.match(FORBIDDEN_FDI)).toBeNull();
  });

  it('calendar.test.ts 금지어 목록에 걸리는 텍스트가 없다', () => {
    expect(text.match(FORBIDDEN_CALENDAR)).toBeNull();
  });

  it('실제 레이스 전체 이름(Derby Italiano, Preis der Diana 등)이 없다', () => {
    for (const word of ['Derby Italiano', 'Preis der Diana', 'Grosser Preis von Baden', 'Epsom Derby', 'Irish Derby']) {
      expect(text.includes(word), word).toBe(false);
    }
  });
});
