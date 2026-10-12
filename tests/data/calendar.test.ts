import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import g1Json from '../../data/calendar/g1.json';
import seriesJson from '../../data/calendar/series.json';
import { loadRacecourses } from '../../src/engine/course/load';
import { buildRacePath } from '../../src/engine/course/path';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { isInPhase } from '../../src/engine/time/calendar';
import type { Racecourse } from '../../src/engine/types/course';
import type { RaceTemplate, SeriesDefinition } from '../../src/engine/types/season';

const courses: Racecourse[] = loadRacecourses(racecoursesJson);
const templates = g1Json as unknown as RaceTemplate[];
const series = seriesJson as unknown as SeriesDefinition[];

/** docs/race-calendar-plan.md 4장 표의 가상 이름 (Cedar Ridge·Yarrabend 원정 제외) */
const PLAN_NAMES = [
  'Torreverde 2000 Guineas', 'Torreverde 1000 Guineas', 'Prix des Tilleuls',
  'Marlow 2000 Guineas', 'Marlow 1000 Guineas', 'Saint-Ourens 2000 Guineas', 'Saint-Ourens 1000 Guineas',
  'Wexborough Mile', 'Torreverde Derby', 'Kilcarrow 2000 Guineas', 'Kilcarrow 1000 Guineas',
  'Kilcarrow Spring Crown', 'Prix des Ormes', 'Wesselfeld 2000 Guineas', 'Valmerano Oaks',
  'Ashcombe Derby', 'Ashcombe Oaks', 'Ashcombe Coronet', 'Wesselfeld 1000 Guineas', 'Vallenaire Derby',
  'Prix de Morvenne', 'Gran Premio di Valmerano', 'Vallenaire Oaks', 'Sovereign Mile', 'Crown Sprint',
  'Heathland Mile', 'Kingsmere Midsummer Stakes', 'Bluebell Stakes', 'Kingsmere Cup', 'Hawthorn Sprint',
  'Highcourt Sprint', 'Kilcarrow Derby', 'Meadowsweet Stakes', 'Ravensbridge Summer Cup', 'Hohenmoor Derby',
  'Grand Prix de Clairval', 'Midsummer Sprint', 'Linden Stakes', 'Prix de Vallenaire', 'Kilcarrow Oaks',
  'Grand Prix de Saint-Ourens', 'Kingsmere Summer Crown', 'Selsworth Mile', 'Selsworth Cup', 'Downland Stakes',
  'Prix de la Plage', 'Prix des Dunes', 'Wesselfeld Oaks', 'Prix du Grand Phare', 'Kilcarrow Juvenile Sprint',
  'Easterholm Grand Stakes', 'Northern Oaks', 'Easterholm Dash', 'Prix des Embruns', 'Prix des Mouettes',
  'Aldermoor Sprint', 'Prix de la Butte', 'Großer Preis von Lichtenau', 'Ballinvar Crown', 'Hollyhock Stakes',
  'Kilcarrow St Leger', 'Kilcarrow Juvenile Stakes', "Kilcarrow Fillies' Stakes", 'Dunholme St Leger',
  'Prix des Glycines', 'Lichtenau St Leger', 'Marlow Juvenile Cup', "Marlow Fillies' Sprint",
  'Silverbirch Stakes', 'Valmerano St Leger', "Prix de l'Étoile d'Automne", 'Prix de la Rotonde',
  'Prix de la Cascade', 'Prix des Jeunes Espoirs', 'Prix des Demoiselles', 'Prix du Bois-Doré',
  'Prix du Long Chemin', 'Chalkpit Stakes', "Bramblewood Fillies' Stakes", 'Premio Dama di Torreverde',
  'Kingsmere Autumn Crown', 'Kingsmere Autumn Mile', "Kingsmere Ladies' Crown", 'Kingsmere Autumn Sprint',
  'Dunholme Futurity', "Critérium d'Automne", 'Saint-Ourens St Leger', "Critérium de Clairval",
];

/** 독·이 클래식 하위 등급(G2·G3) 레코드 이름 */
const LOWER_GRADE: Record<string, 'G2' | 'G3'> = {
  'Torreverde 2000 Guineas': 'G3',
  'Torreverde 1000 Guineas': 'G3',
  'Torreverde Derby': 'G2',
  'Wesselfeld 2000 Guineas': 'G2',
  'Wesselfeld 1000 Guineas': 'G2',
  'Valmerano Oaks': 'G2',
  'Lichtenau St Leger': 'G3',
  'Valmerano St Leger': 'G3',
};

/** 원안 등급 레이스 중 G1 이 아닌 것을 제외한 나머지가 G1 */
const expectedGrade = (name: string): 'G1' | 'G2' | 'G3' => LOWER_GRADE[name] ?? 'G1';

/** 국가 최고 위상 G1 과 그 상금 (총상금 €) */
const FLAGSHIP_TOTAL: Record<string, number> = {
  'Kingsmere Summer Crown': 1500000,
  "Prix de l'Étoile d'Automne": 5000000,
  'Ballinvar Crown': 1500000,
  'Großer Preis von Lichtenau': 250000,
  'Gran Premio di Valmerano': 250000,
};

const PRIZE_SHARES = [0.57, 0.22, 0.11, 0.055, 0.03, 0.015];

const courseById = new Map(courses.map((c) => [c.id, c]));

describe('G1 캘린더 레코드 (data/calendar/g1.json)', () => {
  it('88개 레코드: G1 80개 + 독·이 클래식 하위 등급 8개 (명세 89 와 차이는 _review.md)', () => {
    expect(templates).toHaveLength(88);
    const g1 = templates.filter((t) => t.grade === 'G1');
    expect(g1).toHaveLength(80);
    expect(templates.length - g1.length).toBe(8);
  });

  it('계획 4장의 모든 레이스 이름이 있고, 중복 이름·중복 id 가 없다', () => {
    const names = templates.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...PLAN_NAMES].sort());
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('등급은 계획의 등급 결정(독일·이탈리아 하위 등급)과 같다', () => {
    for (const t of templates) {
      expect(t.grade, t.name).toBe(expectedGrade(t.name));
      expect(t.kind, t.name).toBe('group');
      expect(t.raceClass, t.name).toBe(1);
    }
  });

  it('국가별 G1 수는 GB 36 · FR 27 · IE 12 · DE 3 · IT 2', () => {
    const count: Record<string, number> = {};
    for (const t of templates) {
      if (t.grade !== 'G1') continue;
      const country = courseById.get(t.racecourseId)?.country ?? '?';
      count[country] = (count[country] ?? 0) + 1;
    }
    expect(count).toEqual({ GB: 36, FR: 27, IE: 12, DE: 3, IT: 2 });
  });

  it('조건: wfa, 기준 126lb, OR 범위 null, 나이·성별 약어 매핑', () => {
    for (const t of templates) {
      expect(t.conditions.weightSystem, t.name).toBe('wfa');
      expect(t.conditions.baseWeightLb, t.name).toBe(126);
      expect(t.conditions.ratingMin, t.name).toBeNull();
      expect(t.conditions.ratingMax, t.name).toBeNull();
      expect(t.conditions.minAge, t.name).toBeGreaterThanOrEqual(2);
    }
    const byName = (n: string) => templates.find((t) => t.name === n);
    expect(byName("Marlow 1000 Guineas")?.conditions).toMatchObject({ minAge: 3, maxAge: 3, sex: 'fillies_mares' });
    expect(byName('Marlow 2000 Guineas')?.conditions).toMatchObject({ minAge: 3, maxAge: 3, sex: 'open' });
    expect(byName('Kilcarrow Juvenile Stakes')?.conditions).toMatchObject({ minAge: 2, maxAge: 2, sex: 'open' });
    expect(byName("Kilcarrow Fillies' Stakes")?.conditions).toMatchObject({ minAge: 2, maxAge: 2, sex: 'fillies_mares' });
    expect(byName('Wexborough Mile')?.conditions).toMatchObject({ minAge: 4, maxAge: null, sex: 'open' });
    expect(byName('Meadowsweet Stakes')?.conditions).toMatchObject({ minAge: 3, maxAge: null, sex: 'fillies_mares' });
  });
});

describe('(2) 경마장·거리·레이아웃 유효성 (loadRacecourses + buildRacePath)', () => {
  it('모든 레이스가 경마장 목록에 있고 buildRacePath 가 성공한다', () => {
    for (const t of templates) {
      const course = courseById.get(t.racecourseId);
      expect(course, `경마장 없음: ${t.racecourseId}`).toBeDefined();
      if (course === undefined) continue;
      expect(typeof t.layoutId, t.name).toBe('string');
      const listed = course.distances.some((d) => d.distance === t.distance && d.layoutId === t.layoutId);
      expect(listed, `${t.name}: distances 목록에 없음`).toBe(true);
      expect(course.surface, t.name).toBe('turf');
      expect(() => buildRacePath(course, t.distance, t.layoutId), t.name).not.toThrow();
    }
  });
});

describe('(3) 일정: 잔디 시즌 4월 1주 ~ 11월 4주, 올웨더 주 제외', () => {
  const first = weekOfSlot({ month: 4, weekOfMonth: 1 });
  const last = weekOfSlot({ month: 11, weekOfMonth: 4 });

  it('모든 슬롯이 weekOfSlot 으로 변환되고 4월 1주 ~ 11월 4주 사이다', () => {
    for (const t of templates) {
      const week = weekOfSlot(t.schedule);
      expect(week, t.name).toBeGreaterThanOrEqual(first);
      expect(week, t.name).toBeLessThanOrEqual(last);
    }
  });

  it('모든 레이스 주는 잔디 시즌(turf_flat) 안이고 올웨더 겨울 주(aw_winter)가 아니다', () => {
    for (const t of templates) {
      const week = weekOfSlot(t.schedule);
      expect(isInPhase(week, 'turf_flat'), t.name).toBe(true);
      expect(isInPhase(week, 'aw_winter'), t.name).toBe(false);
    }
  });
});

describe('(4) cardOrder: 같은 경마장·같은 주 안에서 겹치지 않는 정렬 키(G1 은 10 단위)', () => {
  it('그룹별 cardOrder 가 10 의 배수이고 서로 다르다', () => {
    const groups = new Map<string, number[]>();
    for (const t of templates) {
      const key = `${t.racecourseId}|${t.schedule.month}|${t.schedule.weekOfMonth}`;
      const list = groups.get(key) ?? [];
      list.push(t.cardOrder);
      groups.set(key, list);
    }
    for (const [key, orders] of groups) {
      expect(new Set(orders).size, key).toBe(orders.length);
      for (const o of orders) expect(o % 10, key).toBe(0);
    }
  });

  it('메인(국가 최고 위상)은 같은 개최일 그룹의 마지막이다', () => {
    for (const t of templates) {
      if (!t.tags.includes('national_flagship')) continue;
      const group = templates.filter(
        (x) => x.racecourseId === t.racecourseId &&
          x.schedule.month === t.schedule.month && x.schedule.weekOfMonth === t.schedule.weekOfMonth,
      );
      expect(t.cardOrder, t.name).toBe(Math.max(...group.map((x) => x.cardOrder)));
    }
  });
});

describe('(5) 상금', () => {
  it('6착까지 정수, 배분 6개, 합 = 총상금, 배분 비율 [0.57, 0.22, 0.11, 0.055, 0.03, 0.015]', () => {
    for (const t of templates) {
      expect(t.prizeMoney, t.name).toHaveLength(6);
      for (const p of t.prizeMoney) {
        expect(Number.isInteger(p), t.name).toBe(true);
      }
      const total = t.prizeMoney.reduce((a, b) => a + b, 0);
      t.prizeMoney.forEach((p, i) => {
        expect(Math.abs(p - total * (PRIZE_SHARES[i] ?? 0)), `${t.name} #${i + 1}`).toBeLessThan(1);
      });
    }
  });

  it('국가 최고 위상 총상금이 계획과 같다', () => {
    for (const [name, total] of Object.entries(FLAGSHIP_TOTAL)) {
      const t = templates.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      expect(t?.prizeMoney.reduce((a, b) => a + b, 0), name).toBe(total);
    }
  });
});

describe('(6) 시리즈 (data/calendar/series.json)', () => {
  const ids = new Set(templates.map((t) => t.id));

  it('시리즈 15개, id 중복 없음, nameKey = series.<id>', () => {
    expect(series).toHaveLength(15);
    expect(new Set(series.map((s) => s.id)).size).toBe(15);
    for (const s of series) {
      expect(s.nameKey, s.id).toBe(`series.${s.id}`);
    }
  });

  it('모든 legs·requiredLegs 의 id 가 g1.json 에 있다', () => {
    for (const s of series) {
      for (const leg of s.legs) {
        expect(ids.has(leg), `${s.id}: ${leg}`).toBe(true);
      }
      for (const leg of s.requiredLegs ?? []) {
        expect(s.legs, s.id).toContain(leg);
      }
    }
  });

  it('crown: winsRequired 는 legs 수 이하, points: pointsByPosition 있음', () => {
    for (const s of series) {
      if (s.kind === 'crown') {
        expect(s.winsRequired ?? s.legs.length, s.id).toBeLessThanOrEqual(s.legs.length);
      } else {
        expect(s.pointsByPosition, s.id).toEqual([10, 6, 4, 2]);
      }
    }
  });

  it('5개국 3관·티아라 10개 + 유럽 더비·마일·영국 오크스 3관 + 스테이어·스프린트', () => {
    const want = [
      'gb_triple_crown', 'ie_triple_crown', 'fr_triple_crown', 'de_triple_crown', 'it_triple_crown',
      'gb_tiara', 'ie_tiara', 'fr_tiara', 'de_tiara', 'it_tiara',
      'european_derby_triple', 'european_mile_triple', 'british_oaks_triple',
      'european_stayers_series', 'european_sprint_series',
    ];
    expect(series.map((s) => s.id).sort()).toEqual([...want].sort());
    expect(series.find((s) => s.id === 'european_sprint_series')?.legs).toHaveLength(9);
    expect(series.find((s) => s.id === 'european_stayers_series')).toMatchObject({
      winsRequired: 2,
      requiredLegs: ['kingsmere_cup'],
    });
  });
});

describe('태그 일관성', () => {
  it('stayers 는 2,800m 이상, sprint 는 1,207m 이하', () => {
    for (const t of templates) {
      expect(t.tags.includes('stayers'), t.name).toBe(t.distance >= 2800);
      expect(t.tags.includes('sprint'), t.name).toBe(t.distance <= 1207);
    }
  });

  it('two_year_old 는 2세 전용(maxAge 2) 레이스 13개', () => {
    const twoYo = templates.filter((t) => t.tags.includes('two_year_old'));
    expect(twoYo).toHaveLength(13);
    for (const t of twoYo) {
      expect(t.conditions.maxAge, t.name).toBe(2);
    }
  });
});

describe('(7) 실명 금지 (data/calendar/*.json)', () => {
  const text = JSON.stringify([g1Json, seriesJson]);
  const FORBIDDEN =
    /epsom|ascot|newmarket|york|goodwood|longchamp|chantilly|deauville|curragh|leopardstown|\barc\b|king george|eclipse|sussex|juddmonte|coronation|queen anne|st james|nunthorpe|haydock|doncaster|marois|vermeille|ganay|ispahan|morny|abbaye|cadran|royal-oak|tattersalls|pretty polly|nassau|falmouth|matron|moyglare|phoenix|dewhurst|middle park|cheveley|lockinge/i;

  it('금지 실명이 없다', () => {
    expect(text.match(FORBIDDEN)).toBeNull();
  });

  it('실제 레이스 전체 이름(Epsom Derby 등)이 없다', () => {
    for (const word of ['Epsom Derby', 'Irish Derby', 'Kentucky Derby', 'Irish Oaks', 'Irish St Leger', 'Derby Italiano']) {
      expect(text.includes(word), word).toBe(false);
    }
  });
});
