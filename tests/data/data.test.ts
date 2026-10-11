import { describe, expect, it } from 'vitest';
import racecoursesJson from '../../data/racecourses.json';
import racesJson from '../../data/races.json';
import namesJson from '../../data/names.json';
import type { Racecourse, TrackLayout } from '../../src/engine/types/course';
import type { Race } from '../../src/engine/types/race';

interface Names {
  horses: string[];
  jockeys: string[];
  owners: string[];
}

const racecourses = racecoursesJson as Racecourse[];
const races = racesJson as Race[];
const names = namesJson as Names;

/** 실명 금지 목록 (CLAUDE.md 원칙 1, M1-02 명세 2). 대소문자 무시, 부분 문자열 검사. */
const FORBIDDEN_WORDS = [
  // 클래식 유형명(Derby, Oaks, Guineas, St Leger)은 일반어로 허용(2026-10-11 사용자 결정).
  // 실제 레이스 전체 이름이 되는 조합만 금지한다.
  'Epsom Derby',
  'Irish Derby',
  'Kentucky Derby',
  'French Derby',
  'German Derby',
  'Deutsches Derby',
  'Derby Italiano',
  'Epsom Oaks',
  'Irish Oaks',
  'Kentucky Oaks',
  "Oaks d'Italia",
  'Irish 1000 Guineas',
  'Irish 2000 Guineas',
  'Irish St Leger',
  'Arc',
  'Triomphe',
  'Jockey Club',
  'Diane',
  'Eclipse',
  'Sussex',
  'Coronation',
  'King George',
  'Queen Elizabeth',
  'Queen Anne',
  'St James',
  'Ascot',
  'Epsom',
  'Newmarket',
  'Goodwood',
  'York',
  'Doncaster',
  'Longchamp',
  'Chantilly',
  'Deauville',
  'Curragh',
  'Leopardstown',
  'Irish Champion',
  'Nunthorpe',
  'July Cup',
  'Ebor',
  'Cesarewitch',
  'Cambridgeshire',
  'Lincoln',
  'Gold Cup',
  'Breeders',
  'Juddmonte',
  'Coolmore',
  'Godolphin',
  'Darley',
  'Tattersalls',
  'Goffs',
  'Arqana',
  'Qipco',
  // 아일랜드 실제 경마장 (명세 1-(4))
  'Dundalk',
  'Fairyhouse',
  'Punchestown',
  'Galway',
  'Navan',
  'Naas',
  'Cork',
  'Limerick',
  'Tipperary',
  'Gowran',
  'Killarney',
  'Listowel',
  'Tramore',
  'Wexford',
  'Down Royal',
  'Downpatrick',
  'Sligo',
  'Roscommon',
  'Ballinrobe',
  'Bellewstown',
  'Clonmel',
  'Kilbeggan',
  'Laytown',
  'Thurles',
  // 기타 실제 경마장·토공 상표
  'Cheltenham',
  'Newbury',
  'Haydock',
  'Kempton',
  'Sandown',
  'Lingfield',
  'Wolverhampton',
  'Musselburgh',
  'Ripon',
  'Saint-Cloud',
  'Tapeta',
];

const EXPECTED_DISTANCE_SLOTS = 3;

function sumLengths(layout: TrackLayout): number {
  return layout.segments.reduce((acc, seg) => acc + seg.length, 0);
}

describe('racecourses.json', () => {
  it('경마장 4곳, 잔디 3·AW 1, id 중복 없음', () => {
    expect(racecourses.length).toBe(4);
    const ids = racecourses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(racecourses.filter((c) => c.surface === 'turf').length).toBe(3);
    expect(racecourses.filter((c) => c.surface === 'aw').length).toBe(1);
  });

  it('모든 distances 의 layoutId 는 그 경마장 layouts 에 존재하고, 거리 값은 경마장 안에서 중복되지 않는다', () => {
    for (const course of racecourses) {
      const layoutIds = new Set(course.layouts.map((l) => l.id));
      const distances = course.distances.map((d) => d.distance);
      expect(new Set(distances).size).toBe(distances.length);
      for (const d of course.distances) {
        expect(layoutIds.has(d.layoutId), `${course.id}: ${d.layoutId}`).toBe(true);
      }
    }
  });

  it('closed=false 레이아웃은 구간 길이 합 >= 그 레이아웃을 쓰는 최대 거리', () => {
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        if (layout.closed) continue;
        const used = course.distances.filter((d) => d.layoutId === layout.id).map((d) => d.distance);
        if (used.length === 0) continue;
        const maxDistance = Math.max(...used);
        expect(sumLengths(layout), `${course.id}/${layout.id}`).toBeGreaterThanOrEqual(maxDistance);
      }
    }
  });

  it('bend 는 radius>0 이고 turn 이 레이아웃 handedness 와 같다. straight 에는 radius/turn 이 없다. straight 레이아웃에는 bend 가 없다', () => {
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        for (const seg of layout.segments) {
          if (seg.kind === 'bend') {
            expect(layout.handedness, `${layout.id}`).not.toBe('straight');
            expect(seg.radius, `${layout.id} bend radius`).toBeGreaterThan(0);
            expect(seg.turn, `${layout.id} bend turn`).toBe(layout.handedness);
          } else {
            expect(seg, `${layout.id} straight keys`).not.toHaveProperty('radius');
            expect(seg, `${layout.id} straight keys`).not.toHaveProperty('turn');
          }
        }
      }
    }
  });

  it('closed=true 레이아웃: rise 합 = 0(±0.01), bend 각도 합(length/radius) = 2π(±1%)', () => {
    let closedCount = 0;
    for (const course of racecourses) {
      for (const layout of course.layouts) {
        if (!layout.closed) continue;
        closedCount += 1;
        const riseSum = layout.segments.reduce((acc, seg) => acc + seg.rise, 0);
        expect(Math.abs(riseSum), `${layout.id} rise 합`).toBeLessThanOrEqual(0.01);
        const angle = layout.segments
          .filter((seg) => seg.kind === 'bend')
          .reduce((acc, seg) => acc + seg.length / (seg.radius as number), 0);
        expect(Math.abs(angle - 2 * Math.PI) / (2 * Math.PI), `${layout.id} 각도`).toBeLessThanOrEqual(0.01);
      }
    }
    expect(closedCount).toBeGreaterThan(0);
  });
});

describe('races.json', () => {
  it('레이스 12개, id 중복 없음, 경마장마다 3개', () => {
    expect(races.length).toBe(12);
    const ids = races.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const course of racecourses) {
      const count = races.filter((r) => r.racecourseId === course.id).length;
      expect(count, course.id).toBe(EXPECTED_DISTANCE_SLOTS);
    }
  });

  it('racecourseId 는 존재하고 distance 는 그 경마장 distances 에 있다', () => {
    for (const race of races) {
      const course = racecourses.find((c) => c.id === race.racecourseId);
      expect(course, race.id).toBeDefined();
      expect(course!.distances.map((d) => d.distance), race.id).toContain(race.distance);
    }
  });

  it('경마장별 슬롯: 잔디는 그룹 1 + 핸디캡 1 + 메이든 1, AW 는 리스티드 1 + 핸디캡 1 + 메이든 1', () => {
    for (const course of racecourses) {
      const mine = races.filter((r) => r.racecourseId === course.id);
      const kinds = mine.map((r) => r.kind).sort();
      const expected = course.surface === 'aw'
        ? ['handicap', 'listed', 'maiden']
        : ['group', 'handicap', 'maiden'];
      expect(kinds, course.id).toEqual(expected);
    }
  });

  it('kind 와 grade 가 일치한다 (group→G1~G3, listed→L, 그 외 null)', () => {
    for (const race of races) {
      if (race.kind === 'group') {
        expect(['G1', 'G2', 'G3'], race.id).toContain(race.grade);
      } else if (race.kind === 'listed') {
        expect(race.grade, race.id).toBe('L');
      } else {
        expect(race.grade, race.id).toBeNull();
      }
    }
  });

  it('group/listed 는 raceClass 1, handicap 은 2~3, maiden 은 4~5', () => {
    for (const race of races) {
      if (race.kind === 'group' || race.kind === 'listed') {
        expect(race.raceClass, race.id).toBe(1);
      } else if (race.kind === 'handicap') {
        expect([2, 3], race.id).toContain(race.raceClass);
      } else if (race.kind === 'maiden') {
        expect([4, 5], race.id).toContain(race.raceClass);
      }
    }
  });

  it('핸디캡은 ratingMin/Max 가 있고 weightSystem handicap, 그 외는 ratingMin/Max null 이고 weightSystem wfa', () => {
    for (const race of races) {
      const c = race.conditions;
      if (race.kind === 'handicap') {
        expect(typeof c.ratingMin, race.id).toBe('number');
        expect(typeof c.ratingMax, race.id).toBe('number');
        expect(c.ratingMin as number, race.id).toBeLessThan(c.ratingMax as number);
        expect(c.weightSystem, race.id).toBe('handicap');
      } else {
        expect(c.ratingMin, race.id).toBeNull();
        expect(c.ratingMax, race.id).toBeNull();
        expect(c.weightSystem, race.id).toBe('wfa');
      }
    }
  });

  it('연령·성별·기준 부담중량 규칙', () => {
    for (const race of races) {
      const c = race.conditions;
      expect([2, 3, 4], race.id).toContain(c.minAge);
      expect(c.maxAge === null || c.maxAge === c.minAge, race.id).toBe(true);
      expect(['open', 'fillies_mares', 'colts_geldings'], race.id).toContain(c.sex);
      expect([126, 129], race.id).toContain(c.baseWeightLb);
    }
    const fillies = races.filter((r) => r.conditions.sex === 'fillies_mares');
    expect(fillies.length).toBeGreaterThanOrEqual(2);
  });

  it('prizeMoney 는 길이 4~6, 정수, 양수, 내림차순(엄격)', () => {
    for (const race of races) {
      const p = race.prizeMoney;
      expect(p.length, race.id).toBeGreaterThanOrEqual(4);
      expect(p.length, race.id).toBeLessThanOrEqual(6);
      for (let i = 0; i < p.length; i += 1) {
        expect(Number.isInteger(p[i]), `${race.id}[${i}]`).toBe(true);
        expect(p[i], `${race.id}[${i}]`).toBeGreaterThan(0);
        if (i > 0) expect(p[i], `${race.id}[${i}]`).toBeLessThan(p[i - 1] as number);
      }
    }
  });

  it('maxRunners 는 10~20, AW 코스 레이스는 14 이하', () => {
    for (const race of races) {
      expect(race.maxRunners, race.id).toBeGreaterThanOrEqual(10);
      expect(race.maxRunners, race.id).toBeLessThanOrEqual(20);
      const course = racecourses.find((c) => c.id === race.racecourseId);
      if (course?.surface === 'aw') {
        expect(race.maxRunners, race.id).toBeLessThanOrEqual(14);
      }
    }
  });

  it('id 는 <racecourseId>_<snake> 형태', () => {
    for (const race of races) {
      expect(race.id.startsWith(`${race.racecourseId}_`), race.id).toBe(true);
    }
  });
});

describe('names.json', () => {
  it('horses 80, jockeys 30, owners 30 개', () => {
    expect(names.horses.length).toBe(80);
    expect(names.jockeys.length).toBe(30);
    expect(names.owners.length).toBe(30);
  });

  it('각 목록은 중복이 없고, horses 는 18자 이하', () => {
    for (const key of ['horses', 'jockeys', 'owners'] as const) {
      const list = names[key];
      expect(new Set(list).size, key).toBe(list.length);
    }
    for (const horse of names.horses) {
      expect(horse.length, horse).toBeLessThanOrEqual(18);
    }
  });
});

describe('실명 금지 (원칙 1)', () => {
  it('races·racecourses·names JSON 전체 문자열에 금지 단어가 없다 (대소문자 무시)', () => {
    const blob = JSON.stringify([racesJson, racecoursesJson, namesJson]).toLowerCase();
    const hits = FORBIDDEN_WORDS.filter((word) => blob.includes(word.toLowerCase()));
    expect(hits).toEqual([]);
  });
});
