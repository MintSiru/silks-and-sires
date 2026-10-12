import { beforeAll, describe, expect, it } from 'vitest';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { observedProfile } from '../../src/engine/breeding/offspring';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { CountryCode, GameState, LeadingCategory, LaurelCategory, OffspringStats } from '../../src/engine/types';
import {
  distanceProfileKo,
  laurelCategoryKo,
  leadingCategoryKo,
  seriesNameKo,
} from '../../src/ui/game/text';
import {
  AWARDS_LIST_SHOWN,
  SERIES_TOP_POINTS,
  awardYears,
  awardsView,
  leadingScopes,
  leadingView,
  seriesView,
  sireTable,
  type LeadingScope,
} from '../../src/ui/standings/standingsView';

const SEED = 20261012;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 52주 진행 + 연도 전환 주 처리(시상은 다음 해 1주 처리에서 확정된다) */
const PROGRESS_WEEKS = WEEKS_PER_YEAR + 1;
/** 긴 진행 테스트용 제한 시간(ms): 부트스트랩 + 53주 진행 */
const LONG_TIMEOUT = 600_000;

const LEADING_CATEGORIES: readonly LeadingCategory[] = ['sire', 'damsire', 'jockey', 'trainer', 'owner', 'breeder'];
const LAUREL_CATEGORIES: readonly LaurelCategory[] = [
  'horse_of_the_year',
  'older_horse',
  'stayer',
  'sprinter',
  'two_year_old_colt',
  'two_year_old_filly',
  'three_year_old_colt',
  'three_year_old_filly',
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  words: getHorseWords(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

function boot(): GameState {
  return bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 주 시스템 전체를 n 주 진행한다(입력 state 는 바꾸지 않는다) */
function step(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

let progressed: GameState;
let fresh: GameState;

beforeAll(() => {
  fresh = boot();
  progressed = step(fresh, PROGRESS_WEEKS);
}, LONG_TIMEOUT);

describe('시상 뷰 (52주 진행 후)', () => {
  it('진행 후 가장 최근 시상(전년도)을 낸다: Laurel 8부문, Ledger·Global 상위 10, 최우수 레이스', () => {
    expect(progressed.awardsHistory).toHaveLength(1);
    const awards = progressed.awardsHistory[0];
    if (awards === undefined) throw new Error('시상 기록이 없다');
    const view = awardsView(progressed);
    expect(view).not.toBeNull();
    if (view === null) return;

    expect(view.year).toBe(awards.year);
    expect(view.laurel.map((r) => r.category)).toEqual(LAUREL_CATEGORIES);
    for (const row of view.laurel) {
      const winner = awards.laurel[row.category];
      if (winner === null) {
        expect(row.horseId).toBeNull();
        expect(row.horseName).toBe('해당 없음');
      } else {
        expect(row.horseId).toBe(winner);
        expect(row.horseName).toBe(progressed.horses[winner]?.name);
      }
      expect(row.label).toBe(laurelCategoryKo(row.category));
    }

    expect(view.ledger.length).toBe(Math.min(AWARDS_LIST_SHOWN, awards.ledger.length));
    expect(view.globalRankings.length).toBe(Math.min(AWARDS_LIST_SHOWN, awards.globalRankings.length));
    view.ledger.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      if (i > 0) expect(r.rating).toBeLessThanOrEqual(view.ledger[i - 1]?.rating ?? Infinity);
    });
    view.globalRankings.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      if (i > 0) expect(r.rating).toBeLessThanOrEqual(view.globalRankings[i - 1]?.rating ?? Infinity);
    });

    if (awards.bestRace === null) {
      expect(view.bestRace).toBeNull();
    } else {
      expect(view.bestRace?.name).toBe(awards.bestRace.name);
      expect(view.bestRace?.rating).toBe(awards.bestRace.rating);
    }
  }, LONG_TIMEOUT);

  it('시상이 없는 새 게임과 없는 연도는 null, 연도 목록은 최신순', () => {
    expect(awardsView(fresh)).toBeNull();
    expect(awardsView(progressed, 1900)).toBeNull();
    expect(awardYears(progressed)).toEqual(progressed.awardsHistory.map((a) => a.year).reverse());
    const year = progressed.awardsHistory[0]?.year;
    if (year !== undefined) expect(awardsView(progressed, year)?.year).toBe(year);
  });
});

describe('리딩 뷰', () => {
  it('카테고리별 정렬(승 → 상금 → 출주)과 limit 을 지킨다', () => {
    for (const category of LEADING_CATEGORIES) {
      const rows = leadingView(progressed, category, 'EU', 1000);
      rows.forEach((row, i) => {
        expect(row.rank).toBe(i + 1);
        const prev = rows[i - 1];
        if (prev !== undefined) {
          const ordered =
            prev.wins > row.wins ||
            (prev.wins === row.wins &&
              (prev.earnings > row.earnings ||
                (prev.earnings === row.earnings && prev.runners >= row.runners)));
          expect(ordered, `${category} ${i}`).toBe(true);
        }
      });
      expect(leadingView(progressed, category, 'EU', 3).length).toBeLessThanOrEqual(3);
    }
  });

  it('나라 필터: 그 나라 표만 쓰고, 유럽 합산 승 수는 나라별 합과 같다', () => {
    const scopes = leadingScopes(progressed);
    expect(scopes[0]).toBe('EU');
    const countries = scopes.slice(1) as LeadingScope[];
    for (const category of LEADING_CATEGORIES) {
      let countrySum = 0;
      for (const country of countries) {
        const table = progressed.seasonState.leadingByCountry[country as CountryCode];
        const rows = leadingView(progressed, category, country, 1000);
        expect(rows.length).toBe(Object.keys(table?.[category] ?? {}).length);
        for (const row of rows) {
          expect(table?.[category][row.id]?.wins).toBe(row.wins);
        }
        countrySum += rows.reduce((sum, r) => sum + r.wins, 0);
      }
      const euSum = leadingView(progressed, category, 'EU', 1000).reduce((sum, r) => sum + r.wins, 0);
      expect(euSum, category).toBe(countrySum);
    }
    const absent = (['US', 'JP', 'AU', 'HK', 'AE', 'CA', 'AR', 'NZ'] as CountryCode[]).find(
      (c) => progressed.seasonState.leadingByCountry[c] === undefined,
    );
    if (absent !== undefined) expect(leadingView(progressed, 'sire', absent)).toEqual([]);
  });
});

describe('시리즈 뷰', () => {
  it('정의 15개를 모두 내고, crown 은 레그별 우승마, points 는 상위 5를 낸다', () => {
    const defs = getSeriesDefinitions();
    expect(defs).toHaveLength(15);
    const cards = seriesView(progressed, defs);
    expect(cards.map((c) => c.seriesId)).toEqual(defs.map((d) => d.id));

    for (const card of cards) {
      const def = defs.find((d) => d.id === card.seriesId);
      if (def === undefined) throw new Error('정의가 없다');
      expect(card.name).toBe(seriesNameKo(def.id));
      expect(card.name).not.toBe(def.id);
      if (def.kind === 'crown') {
        expect(card.legs.map((l) => l.raceId)).toEqual(def.legs);
        expect(card.topPoints).toEqual([]);
        const progress = progressed.seasonState.series[def.id];
        card.legs.forEach((leg) => {
          const winnerId = progress?.legWinners[leg.raceId];
          expect(leg.winnerName).toBe(winnerId === undefined ? null : progressed.horses[winnerId]?.name);
        });
      } else {
        expect(card.legs).toEqual([]);
        expect(card.topPoints.length).toBeLessThanOrEqual(SERIES_TOP_POINTS);
        card.topPoints.forEach((row, i) => {
          expect(row.rank).toBe(i + 1);
          if (i > 0) expect(row.points).toBeLessThanOrEqual(card.topPoints[i - 1]?.points ?? Infinity);
        });
      }
    }
  });
});

describe('산구 성적 표', () => {
  it('합계(승)가 sireStats 전체 합과 같고, 행 승 합도 같으며, 거리 적성 문구가 observedProfile 과 일치', () => {
    const stats = Object.entries(progressed.sireStats);
    expect(stats.length).toBeGreaterThan(0);
    const wins = stats.reduce((sum, [, s]) => sum + s.wins, 0);

    const table = sireTable(progressed, 100_000);
    expect(table.totals.wins).toBe(wins);
    expect(table.rows.reduce((sum, r) => sum + r.wins, 0)).toBe(wins);
    expect(table.rows.length).toBe(stats.length);

    table.rows.forEach((row, i) => {
      expect(row.rank).toBe(i + 1);
      if (i > 0) expect(row.wins).toBeLessThanOrEqual(table.rows[i - 1]?.wins ?? Infinity);
      const s = progressed.sireStats[row.sireId];
      if (s === undefined) throw new Error('산구 기록이 없다');
      const profile = observedProfile(s);
      expect(row.profileLabel).toBe(profile === null ? '자료 부족' : distanceProfileKo(profile));
    });

    expect(sireTable(progressed, 2).rows.length).toBeLessThanOrEqual(2);
  });

  it('거리 적성: 우승 수가 적으면 자료 부족, 많으면 평균 우승 거리로 분류', () => {
    const base = structuredClone(fresh);
    // 1승(미정), 6승 평균 2,400m(중장거리), 6승 평균 3,200m(스테이어)
    const cases: { stats: OffspringStats; label: string }[] = [
      {
        stats: { starters: 1, winners: 1, runs: 1, wins: 1, groupWins: 0, groupWinners: 0, earnings: 1000, winDistanceSum: 1200 },
        label: '자료 부족',
      },
      {
        stats: { starters: 5, winners: 5, runs: 20, wins: 6, groupWins: 1, groupWinners: 1, earnings: 90000, winDistanceSum: 6 * 2400 },
        label: distanceProfileKo('middle'),
      },
      {
        stats: { starters: 5, winners: 5, runs: 20, wins: 6, groupWins: 1, groupWinners: 1, earnings: 90000, winDistanceSum: 6 * 3200 },
        label: distanceProfileKo('cup'),
      },
    ];
    cases.forEach(({ stats, label }, i) => {
      base.sireStats = { [`sire-${i}`]: stats };
      expect(sireTable(base).rows[0]?.profileLabel).toBe(label);
    });
  });
});

describe('OR 숫자 비노출', () => {
  it('뷰 결과 어디에도 officialRating 키가 없다', () => {
    const defs = getSeriesDefinitions();
    const json = JSON.stringify({
      awards: awardsView(progressed),
      series: seriesView(progressed, defs),
      leading: LEADING_CATEGORIES.map((c) => leadingView(progressed, c, 'EU')),
      sires: sireTable(progressed),
    });
    expect(json.includes('officialRating')).toBe(false);
  });
});

describe('문구 표', () => {
  it('부문·리딩·시리즈·거리 적성 문구가 모두 서로 다르고 빈 값이 없다', () => {
    const laurel = LAUREL_CATEGORIES.map(laurelCategoryKo);
    expect(new Set(laurel).size).toBe(8);
    const leading = LEADING_CATEGORIES.map(leadingCategoryKo);
    expect(new Set(leading).size).toBe(6);
    const series = getSeriesDefinitions().map((d) => seriesNameKo(d.id));
    expect(new Set(series).size).toBe(15);
    const profiles = ['speed', 'classic', 'middle', 'cup'] as const;
    expect(new Set(profiles.map(distanceProfileKo)).size).toBe(4);
    for (const text of [...laurel, ...leading, ...series]) expect(text.length).toBeGreaterThan(0);
  });
});
