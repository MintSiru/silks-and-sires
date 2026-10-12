import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import g1Json from '../../data/calendar/g1.json';
import g1ExtraJson from '../../data/calendar/g1_extra.json';
import patternGbIeJson from '../../data/calendar/pattern_gb_ie.json';
import patternFrDeItJson from '../../data/calendar/pattern_fr_de_it.json';
import protectedJson from '../../data/naming/protected.json';
import realPlacesJson from '../../data/naming/real_places.json';
import { loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { isInPhase } from '../../src/engine/time/calendar';
import type { Racecourse } from '../../src/engine/types/course';
import type { RaceTemplate } from '../../src/engine/types/season';

/**
 * 명세 M3-A4c: 2세 · 스프린트/마일 · 암말 한정 · 저위상 중장거리 G1 24개 (data/calendar/g1_extra.json).
 * 레코드 순서가 아니라 조건(국가·연령·성별·거리대·월·총상금)으로 명세 표 24행과 1:1 대응을 검사한다.
 */

const courses: Racecourse[] = loadRacecourses(racecoursesJson);
const courseById = new Map(courses.map((c) => [c.id, c]));
const EXTRA = g1ExtraJson as unknown as RaceTemplate[];
const G1 = g1Json as unknown as RaceTemplate[];
const GB_IE = patternGbIeJson as unknown as RaceTemplate[];
const FR_DE_IT = patternFrDeItJson as unknown as RaceTemplate[];
const OTHERS = [...G1, ...GB_IE, ...FR_DE_IT];
const ALL = [...G1, ...EXTRA, ...GB_IE, ...FR_DE_IT];

const PRIZE_SHARES = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015];

type Country = 'GB' | 'IE' | 'FR' | 'DE' | 'IT';

/** 명세 표 한 행. 거리·월은 닫힌 범위(표의 "1000~1100" 등) */
interface SpecRow {
  no: number;
  country: Country;
  minAge: number;
  maxAge: number | null;
  sex: 'open' | 'fillies_mares';
  distMin: number;
  distMax: number;
  monthMin: number;
  monthMax: number;
  total: number;
}

/**
 * 명세 표 24행. 명세의 "1600" 은 DE·IT 경마장에 1600m 가 없어 1609m(1마일)로,
 * "2000"·"2200"·"2400" 은 각각 2012·2213·2414 로 대응한다(표 범위 안).
 */
const SPEC_ROWS: SpecRow[] = [
  { no: 1, country: 'GB', minAge: 2, maxAge: 2, sex: 'open', distMin: 1000, distMax: 1100, monthMin: 6, monthMax: 7, total: 300000 },
  { no: 2, country: 'IE', minAge: 2, maxAge: 2, sex: 'fillies_mares', distMin: 1200, distMax: 1210, monthMin: 8, monthMax: 8, total: 300000 },
  { no: 3, country: 'IE', minAge: 2, maxAge: 2, sex: 'open', distMin: 2000, distMax: 2012, monthMin: 10, monthMax: 10, total: 300000 },
  { no: 4, country: 'FR', minAge: 2, maxAge: 2, sex: 'fillies_mares', distMin: 1400, distMax: 1400, monthMin: 9, monthMax: 9, total: 300000 },
  { no: 5, country: 'DE', minAge: 2, maxAge: 2, sex: 'open', distMin: 1609, distMax: 1609, monthMin: 9, monthMax: 10, total: 200000 },
  { no: 6, country: 'IT', minAge: 2, maxAge: 2, sex: 'open', distMin: 1609, distMax: 1609, monthMin: 10, monthMax: 10, total: 200000 },
  { no: 7, country: 'IE', minAge: 3, maxAge: null, sex: 'open', distMin: 1000, distMax: 1006, monthMin: 6, monthMax: 7, total: 400000 },
  { no: 8, country: 'IE', minAge: 3, maxAge: null, sex: 'open', distMin: 1609, distMax: 1609, monthMin: 8, monthMax: 8, total: 400000 },
  { no: 9, country: 'FR', minAge: 3, maxAge: 3, sex: 'open', distMin: 1200, distMax: 1200, monthMin: 7, monthMax: 7, total: 300000 },
  { no: 10, country: 'FR', minAge: 3, maxAge: null, sex: 'open', distMin: 1400, distMax: 1400, monthMin: 7, monthMax: 8, total: 400000 },
  { no: 11, country: 'DE', minAge: 3, maxAge: null, sex: 'open', distMin: 1609, distMax: 1609, monthMin: 8, monthMax: 8, total: 250000 },
  { no: 12, country: 'IT', minAge: 3, maxAge: null, sex: 'open', distMin: 1609, distMax: 1609, monthMin: 10, monthMax: 10, total: 250000 },
  { no: 13, country: 'IT', minAge: 3, maxAge: null, sex: 'open', distMin: 1207, distMax: 1207, monthMin: 5, monthMax: 6, total: 200000 },
  { no: 14, country: 'GB', minAge: 3, maxAge: null, sex: 'fillies_mares', distMin: 1200, distMax: 1207, monthMin: 8, monthMax: 8, total: 400000 },
  { no: 15, country: 'IE', minAge: 3, maxAge: null, sex: 'fillies_mares', distMin: 1200, distMax: 1207, monthMin: 9, monthMax: 9, total: 300000 },
  { no: 16, country: 'FR', minAge: 3, maxAge: null, sex: 'fillies_mares', distMin: 2400, distMax: 2400, monthMin: 10, monthMax: 10, total: 250000 },
  { no: 17, country: 'DE', minAge: 3, maxAge: null, sex: 'fillies_mares', distMin: 2213, distMax: 2213, monthMin: 8, monthMax: 8, total: 200000 },
  { no: 18, country: 'IT', minAge: 3, maxAge: null, sex: 'fillies_mares', distMin: 1609, distMax: 1609, monthMin: 5, monthMax: 5, total: 200000 },
  { no: 19, country: 'DE', minAge: 3, maxAge: null, sex: 'open', distMin: 2012, distMax: 2012, monthMin: 6, monthMax: 6, total: 200000 },
  { no: 20, country: 'DE', minAge: 3, maxAge: null, sex: 'open', distMin: 2213, distMax: 2213, monthMin: 10, monthMax: 10, total: 200000 },
  { no: 21, country: 'DE', minAge: 4, maxAge: null, sex: 'open', distMin: 2414, distMax: 2414, monthMin: 7, monthMax: 7, total: 200000 },
  { no: 22, country: 'IT', minAge: 3, maxAge: null, sex: 'open', distMin: 2012, distMax: 2012, monthMin: 10, monthMax: 11, total: 200000 },
  { no: 23, country: 'FR', minAge: 3, maxAge: null, sex: 'open', distMin: 2400, distMax: 2400, monthMin: 6, monthMax: 6, total: 250000 },
  { no: 24, country: 'GB', minAge: 3, maxAge: null, sex: 'open', distMin: 2414, distMax: 2414, monthMin: 9, monthMax: 9, total: 250000 },
];

const countryOf = (t: RaceTemplate): string => courseById.get(t.racecourseId)?.country ?? '?';
const total = (t: RaceTemplate): number => t.prizeMoney.reduce((a, b) => a + b, 0);
const slotKey = (t: RaceTemplate): string => `${t.racecourseId}|${t.schedule.month}|${t.schedule.weekOfMonth}`;

/** 레코드가 표 한 행의 조건을 모두 만족하는지 */
function fits(t: RaceTemplate, row: SpecRow): boolean {
  const c = t.conditions;
  return countryOf(t) === row.country
    && c.minAge === row.minAge
    && c.maxAge === row.maxAge
    && c.sex === row.sex
    && t.distance >= row.distMin && t.distance <= row.distMax
    && t.schedule.month >= row.monthMin && t.schedule.month <= row.monthMax
    && total(t) === row.total;
}

/** 레코드 ↔ 표 행 이분 매칭(Kuhn). 모든 행과 모든 레코드가 1:1 로 대응해야 한다 */
function perfectMatching(records: RaceTemplate[], rows: SpecRow[]): number {
  const matchOfRecord: number[] = records.map(() => -1);
  const adj = rows.map((row) => records.flatMap((t, j) => (fits(t, row) ? [j] : [])));
  const tryRow = (i: number, seen: boolean[]): boolean => {
    for (const j of adj[i] ?? []) {
      if (seen[j]) continue;
      seen[j] = true;
      const prev = matchOfRecord[j] ?? -1;
      if (prev === -1 || tryRow(prev, seen)) {
        matchOfRecord[j] = i;
        return true;
      }
    }
    return false;
  };
  let matched = 0;
  rows.forEach((_, i) => {
    if (tryRow(i, records.map(() => false))) matched += 1;
  });
  return matched;
}

describe('(1) 레코드 기본 형식 (data/calendar/g1_extra.json)', () => {
  it('24개, 모두 G1 · group · raceClass 1 · wfa · 기준 126lb · OR 범위 null', () => {
    expect(EXTRA).toHaveLength(24);
    for (const t of EXTRA) {
      expect(t.grade, t.name).toBe('G1');
      expect(t.kind, t.name).toBe('group');
      expect(t.raceClass, t.name).toBe(1);
      expect(t.conditions, t.name).toMatchObject({
        weightSystem: 'wfa', baseWeightLb: 126, ratingMin: null, ratingMax: null,
      });
    }
  });

  it('getRaceTemplates() 의 G1 은 80 + 24 = 104 이고, 추가 레코드가 모두 들어 있다', () => {
    const templates = getRaceTemplates();
    expect(templates.filter((t) => t.grade === 'G1')).toHaveLength(104);
    const ids = new Set(templates.map((t) => t.id));
    for (const t of EXTRA) expect(ids.has(t.id), t.name).toBe(true);
  });

  it('maxRunners: 2세 14~16, 2세 제외 1,207m 이하 18~20, 나머지 14~16', () => {
    for (const t of EXTRA) {
      const sprint = t.distance <= 1207;
      if (t.conditions.minAge === 2) {
        expect([14, 16], t.name).toContain(t.maxRunners);
      } else if (sprint) {
        expect([18, 20], t.name).toContain(t.maxRunners);
      } else {
        expect([14, 16], t.name).toContain(t.maxRunners);
      }
    }
  });
});

describe('(2) 명세 표 24행과 1:1 대응 (조건별 검사, 순서 무관)', () => {
  it('국가·연령·성별·거리대·월·총상금이 표 24행과 모두 1:1 로 맞는다', () => {
    expect(perfectMatching(EXTRA, SPEC_ROWS)).toBe(24);
  });

  it('조건별 개수: GB 3 · IE 5 · FR 5 · DE 6 · IT 5', () => {
    const count = (c: Country) => EXTRA.filter((t) => countryOf(t) === c).length;
    expect({ GB: count('GB'), IE: count('IE'), FR: count('FR'), DE: count('DE'), IT: count('IT') })
      .toEqual({ GB: 3, IE: 5, FR: 5, DE: 6, IT: 5 });
  });

  it('조건별 개수: 2세 6 · 암말 한정 7 · 1,400m 이하 9 · 3세 한정 1 · 4세 이상 1', () => {
    const twoYo = EXTRA.filter((t) => t.conditions.minAge === 2 && t.conditions.maxAge === 2);
    const fillies = EXTRA.filter((t) => t.conditions.sex === 'fillies_mares');
    // 명세 본문은 "1,400m 이하 8" 이라 적었으나 표 행을 세면 9 다(#1·2·4·7·9·10·13·14·15). 보고 참조.
    const short = EXTRA.filter((t) => t.distance <= 1400);
    const three = EXTRA.filter((t) => t.conditions.minAge === 3 && t.conditions.maxAge === 3);
    const four = EXTRA.filter((t) => t.conditions.minAge === 4);
    expect(twoYo).toHaveLength(6);
    expect(fillies).toHaveLength(7);
    expect(short).toHaveLength(9);
    expect(three).toHaveLength(1);
    expect(four).toHaveLength(1);
  });
});

describe('(3) 경마장·거리·레이아웃·잔디', () => {
  it('경마장이 있고 잔디이며, distances 목록에 (거리, layoutId) 가 있고 buildRacePath 가 성공한다', () => {
    for (const t of EXTRA) {
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

describe('(4) 일정: 잔디 시즌(turf_flat), 올웨더 겨울 주 아님, weekOfMonth 1~4', () => {
  it('모든 슬롯이 weekOfSlot 으로 변환되고 turf_flat 안이며 aw_winter 가 아니다', () => {
    for (const t of EXTRA) {
      expect([1, 2, 3, 4], t.name).toContain(t.schedule.weekOfMonth);
      const week = weekOfSlot(t.schedule);
      expect(isInPhase(week, 'turf_flat'), t.name).toBe(true);
      expect(isInPhase(week, 'aw_winter'), t.name).toBe(false);
    }
  });
});

describe('(5) 상금', () => {
  it('6착까지 정수, 합 = 총상금, 1착부터 배분 비율 대로(±1 이내)', () => {
    for (const t of EXTRA) {
      expect(t.prizeMoney, t.name).toHaveLength(6);
      for (const p of t.prizeMoney) expect(Number.isInteger(p), t.name).toBe(true);
      const sum = total(t);
      expect([200000, 250000, 300000, 400000], t.name).toContain(sum);
      t.prizeMoney.forEach((p, i) => {
        expect(Math.abs(p - sum * (PRIZE_SHARES[i] ?? 0)), `${t.name} #${i + 1}`).toBeLessThan(1);
      });
    }
  });
});

describe('(6) 태그 규칙 (기존 g1.json 의 태그 이름만 사용)', () => {
  it('two_year_old ↔ 2세 전용, fillies_mares ↔ 암말 한정, sprint ↔ 1,207m 이하, stayers ↔ 2,800m 이상', () => {
    for (const t of EXTRA) {
      expect(t.tags.includes('two_year_old'), t.name).toBe(t.conditions.minAge === 2 && t.conditions.maxAge === 2);
      expect(t.tags.includes('fillies_mares'), t.name).toBe(t.conditions.sex === 'fillies_mares');
      expect(t.tags.includes('sprint'), t.name).toBe(t.distance <= 1207);
      expect(t.tags.includes('stayers'), t.name).toBe(t.distance >= 2800);
    }
  });

  it('classic · national_flagship · champions_day 태그를 쓰지 않는다', () => {
    for (const t of EXTRA) {
      expect(t.tags, t.name).not.toContain('classic');
      expect(t.tags, t.name).not.toContain('national_flagship');
      expect(t.tags, t.name).not.toContain('champions_day');
    }
  });
});

describe('(7) cardOrder · 개최일 (전체 캘린더 파일과 함께)', () => {
  it('cardOrder 는 10 의 배수이고, 같은 (경마장, 월, 주) 안에서 g1·g1_extra·pattern_* 전체와 겹치지 않는다', () => {
    for (const t of EXTRA) {
      expect(t.cardOrder % 10, t.name).toBe(0);
      const group = ALL.filter((x) => slotKey(x) === slotKey(t));
      expect(group.filter((x) => x.cardOrder === t.cardOrder).length, t.name).toBe(1);
    }
  });

  it('신규 G1 은 같은 개최일에 다른 G1 이 없다(한 개최일 G1 1개)', () => {
    for (const t of EXTRA) {
      const g1Here = ALL.filter((x) => x.grade === 'G1' && slotKey(x) === slotKey(t));
      expect(g1Here.map((x) => x.name), t.name).toEqual([t.name]);
    }
  });

  it('그룹당 고정 일정 레이스는 최대 10개', () => {
    for (const t of EXTRA) {
      expect(ALL.filter((x) => slotKey(x) === slotKey(t)).length, slotKey(t)).toBeLessThanOrEqual(10);
    }
  });

  it('국가 최고 위상(national_flagship)은 같은 개최일에서 cardOrder 가 가장 크다', () => {
    for (const t of ALL) {
      if (!t.tags.includes('national_flagship')) continue;
      const group = ALL.filter((x) => slotKey(x) === slotKey(t));
      expect(t.cardOrder, t.name).toBe(Math.max(...group.map((x) => x.cardOrder)));
    }
  });
});

describe('(8) id·이름 중복 (다른 캘린더 파일과)', () => {
  it('id·이름이 g1.json · pattern_*.json 과 겹치지 않고, 이 파일 안에서도 유일하다', () => {
    const otherIds = new Set(OTHERS.map((t) => t.id));
    const otherNames = new Set(OTHERS.map((t) => t.name));
    for (const t of EXTRA) {
      expect(otherIds.has(t.id), `id 중복: ${t.id}`).toBe(false);
      expect(otherNames.has(t.name), `이름 중복: ${t.name}`).toBe(false);
    }
    expect(new Set(EXTRA.map((t) => t.id)).size).toBe(EXTRA.length);
    expect(new Set(EXTRA.map((t) => t.name)).size).toBe(EXTRA.length);
  });

  it('이름 형식: 프랑스 Prix …, 독일 Preis von … 또는 …-Rennen, 이탈리아 Premio …', () => {
    for (const t of EXTRA) {
      const c = countryOf(t);
      if (c === 'FR') expect(t.name.startsWith('Prix '), t.name).toBe(true);
      if (c === 'DE') expect(t.name.startsWith('Preis von ') || t.name.endsWith('-Rennen'), t.name).toBe(true);
      if (c === 'IT') expect(t.name.startsWith('Premio '), t.name).toBe(true);
    }
  });
});

describe('(9) 실명·보호 목록 (이 파일의 텍스트)', () => {
  const text = JSON.stringify(g1ExtraJson);
  // tests/data/calendar.test.ts 금지 목록
  const FORBIDDEN_CALENDAR =
    /epsom|ascot|newmarket|york|goodwood|longchamp|chantilly|deauville|curragh|leopardstown|\barc\b|king george|eclipse|sussex|juddmonte|coronation|queen anne|st james|nunthorpe|haydock|doncaster|marois|vermeille|ganay|ispahan|morny|abbaye|cadran|royal-oak|tattersalls|pretty polly|nassau|falmouth|matron|moyglare|phoenix|dewhurst|middle park|cheveley|lockinge/i;
  // tests/data/pattern_fr_de_it.test.ts 금지 목록
  const FORBIDDEN_FDI =
    /longchamp|chantilly|deauville|saint-cloud|maisons|laffitte|lyon|marseille|diane|jockey club|ganay|ispahan|lupin|greffulhe|hocquart|noailles|niel|\bfoy\b|vermeille|royallieu|chaudenay|wildenstein|dollar|\bforet\b|forêt|abbaye|gheest|marois|rothschild|morny|salamandre|boussac|lagard|saint-alary|harcourt|gladiateur|kergorlay|gontaut|guiche|cadran|royal-oak|calvados|\bdu pin\b|europa|bayerisch|dallmayr|union-rennen|baden|hamburg|köln|koln|düsseldorf|dusseldorf|hoppegarten|münchen|munchen|presidente|tesio|roma|milano|ribot|capua|capannelle|san siro|italiano|deutsch|german|french|italian|derby italiano/i;
  // 명세 추가 금지어
  const FORBIDDEN_SPEC =
    /phoenix|railway|futurity|national stakes|flying five|cheveley|sun chariot|prix de la foret|jean-luc|criterium international|marcel boussac|preis der diana|grosser preis von baden|bayerisches|premio vittorio|lydia tesio|jockey club|gran criterio/i;

  it('금지어 목록(calendar · pattern_fr_de_it · 명세 추가)에 걸리는 텍스트가 없다', () => {
    expect(text.match(FORBIDDEN_CALENDAR)).toBeNull();
    expect(text.match(FORBIDDEN_FDI)).toBeNull();
    expect(text.match(FORBIDDEN_SPEC)).toBeNull();
  });

  it('실제 레이스 전체 이름(Epsom Derby 등)이 없다', () => {
    for (const word of ['Epsom Derby', 'Irish Derby', 'Kentucky Derby', 'Irish Oaks', 'Irish St Leger', 'Derby Italiano']) {
      expect(text.includes(word), word).toBe(false);
    }
  });

  it('보호 목록(data/naming/protected.json)과 같은 이름이 없고, 차단 지명 토큰(real_places blockedTokens)을 포함하지 않는다', () => {
    const protectedNames = new Set(protectedJson.names.map((s) => s.toLowerCase()));
    const blocked = realPlacesJson.blockedTokens.map((s) => s.toLowerCase());
    for (const t of EXTRA) {
      const low = t.name.toLowerCase();
      expect(protectedNames.has(low), `보호 목록: ${t.name}`).toBe(false);
      for (const b of blocked) {
        if (b.length === 0) continue;
        expect(low.includes(b), `차단 지명 "${b}": ${t.name}`).toBe(false);
      }
    }
  });
});
