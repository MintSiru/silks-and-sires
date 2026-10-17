import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { advanceWeeksGated } from '../../src/engine/stud/yearEnd';
import { announceWeekOf, createSalesSystem } from '../../src/engine/sales/system';
import { saleWeekOf } from '../../src/engine/sales/bidding';
import { createRng } from '../../src/engine/rng';
import { matingAutoBookWeek } from '../../src/engine/breeding/matingPlan';
import { MATING_AUTO_BOOK_WEEK, MATING_FIRST_SEASON_AUTO_BOOK_WEEK } from '../../src/engine/config/mating';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import type { GameState, SaleEventDef } from '../../src/engine/types';
import { decisionStopFrom, decisionStopReason } from '../../src/ui/shell/decisionStop';

let base: GameState;
let horseId: string;
let saleEvent: SaleEventDef;
/** 위탁 마감 주가 2~50주 사이인 세일(1주에서 출발하고 2주 더 가 보는 테스트용) */
let deadlineWeek: number;

/** 기본 상태를 복제하고 주·설정을 바꾼다. 연말 정산 대기(d)는 기본으로 꺼 둔다. */
function at(week: number, patch?: (s: GameState) => void): GameState {
  const s = structuredClone(base);
  s.date = { year: base.date.year, week };
  s.yearEnd.lastSubmittedYear = s.date.year;
  s.stud.matingProposals = [];
  patch?.(s);
  return s;
}

beforeAll(() => {
  const data = {
    nicks: getNicks(),
    naming: getNamingData(),
    ...getPeopleData(),
    templates: getRaceTemplates(),
    courses: getRacecourses(),
    sales: getSalesData(),
    series: getSeriesDefinitions(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
  };
  base = bootstrapGame(
    { seed: 20261017, playerName: '테스트', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } },
    data,
  );
  horseId = Object.values(base.horses).find((h) => h.ownerId === base.playerOwnerId)!.id;
  const events = getSalesData().events;
  saleEvent = events.find((e) => announceWeekOf(e) - 1 >= 2 && announceWeekOf(e) - 1 <= 50)!;
  deadlineWeek = announceWeekOf(saleEvent) - 1;
}, 120_000);

describe('decisionStopReason 사유 판정', () => {
  it('사유가 없으면 null', () => {
    // 3주는 발표 주(가장 이른 것 10주)·거래 주와 겹치지 않는다(M7-E 로 10주에는 (e) 사유가 생긴다)
    expect(decisionStopReason(at(3))).toBeNull();
  });

  it('(a) 위탁 마감 주에 검토 대기 판매 제안이 있으면 사유, 뺐거나 다른 주면 null', () => {
    const proposal = (status: 'proposed' | 'skipped') => [
      { horseId, saleId: saleEvent.id, year: base.date.year, reserve: null, note: '', status },
    ];
    const due = at(deadlineWeek, (s) => {
      s.sales.sellProposals = proposal('proposed');
    });
    expect(decisionStopReason(due)).toMatch(/위탁 마감/);
    const skipped = at(deadlineWeek, (s) => {
      s.sales.sellProposals = proposal('skipped');
    });
    expect(decisionStopReason(skipped)).toBeNull();
    const earlier = at(deadlineWeek - 1, (s) => {
      s.sales.sellProposals = proposal('proposed');
    });
    expect(decisionStopReason(earlier)).toBeNull();
  });

  it('(b) 교배 자동 예약 주에 빼지 않은 제안이 있으면 사유(기본 방식만), 설정이 있으면 null', () => {
    const season = base.date.year;
    const week = matingAutoBookWeek(base);
    expect(week).toBe(MATING_FIRST_SEASON_AUTO_BOOK_WEEK);
    const proposal = {
      mareId: horseId,
      season,
      stallionId: horseId,
      alternatives: [],
      expectedFee: 0,
      note: '',
      status: 'proposed' as const,
    };
    const auto = at(week, (s) => {
      s.stud.matingProposals = [proposal];
    });
    expect(decisionStopReason(auto)).toMatch(/교배 제안/);
    const manual = at(week, (s) => {
      s.stud.matingProposals = [proposal];
      s.settings.autoApproveMatings = false;
    });
    expect(decisionStopReason(manual)).toBeNull();
    const other = at(week + 1, (s) => {
      s.stud.matingProposals = [proposal];
    });
    expect(decisionStopReason(other)).toBeNull();
  });

  it('(b) 첫 시즌은 6주, 다음 해는 2주에 멈추고 첫 시즌 2주에는 멈추지 않는다', () => {
    const next = base.date.year + 1;
    const proposalFor = (season: number) => ({
      mareId: horseId, season, stallionId: horseId, alternatives: [], expectedFee: 0, note: '', status: 'proposed' as const,
    });
    const firstSeason = (week: number) => at(week, (s) => {
      s.stud.matingProposals = [proposalFor(base.date.year)];
    });
    const nextSeason = (week: number) => at(week, (s) => {
      s.date = { year: next, week };
      s.yearEnd.lastSubmittedYear = next;
      s.stud.matingProposals = [proposalFor(next)];
    });
    expect(decisionStopReason(firstSeason(MATING_AUTO_BOOK_WEEK))).toBeNull();
    expect(decisionStopReason(firstSeason(MATING_FIRST_SEASON_AUTO_BOOK_WEEK))).toMatch(/교배 제안/);
    expect(decisionStopReason(nextSeason(MATING_AUTO_BOOK_WEEK))).toMatch(/교배 제안/);
    expect(decisionStopReason(nextSeason(MATING_FIRST_SEASON_AUTO_BOOK_WEEK))).toBeNull();
  });

  it('(c) 승인제에서 이번 주 출주 대상 계획이 승인 대기면 사유, 자동 신청 방식이면 null', () => {
    const plan = (week: number, status: 'proposed' | 'approved') => ({
      id: `${horseId}:${base.date.year}-${week}`,
      date: { year: base.date.year, week },
      templateId: null,
      target: { kinds: ['maiden' as const], minDistance: 1000, maxDistance: 1800 },
      status,
      note: '',
    });
    const withPlan = (stateWeek: number, planWeek: number, status: 'proposed' | 'approved', auto: boolean | undefined) =>
      at(stateWeek, (s) => {
        s.settings.autoApproveRacePlans = auto;
        s.seasonState.racePlans = { [horseId]: [plan(planWeek, status)] };
      });
    expect(decisionStopReason(withPlan(20, 20, 'proposed', false))).toMatch(/출주 계획/);
    expect(decisionStopReason(withPlan(20, 20, 'approved', false))).toBeNull();
    expect(decisionStopReason(withPlan(20, 20, 'proposed', true))).toBeNull();
    expect(decisionStopReason(withPlan(20, 21, 'proposed', false))).toBeNull();
  });

  it('(d) 연말 정산 대기(새해 1주, 미제출)면 사유, 제출했으면 null', () => {
    const pending = at(1, (s) => {
      s.yearEnd.lastSubmittedYear = s.date.year - 1;
    });
    expect(decisionStopReason(pending)).toMatch(/연말 정산/);
    expect(decisionStopReason(at(1))).toBeNull();
  });
});

describe('decisionStopFrom 정지 조건', () => {
  it('시작 주의 사유는 무시하고, 다음 주부터 판정한다', () => {
    const week = matingAutoBookWeek(base);
    const start = at(week, (s) => {
      s.stud.matingProposals = [
        { mareId: horseId, season: base.date.year, stallionId: horseId, alternatives: [], expectedFee: 0, note: '', status: 'proposed' },
      ];
    });
    const watch = decisionStopFrom(start.date);
    expect(watch.stop(start)).toBe(false);
    expect(watch.reason).toBeNull();
    expect(watch.stop(at(week + 1))).toBe(false);
    expect(watch.reason).toBeNull();
  });

  it('다음 주에 사유가 생기면 멈추고 사유를 남긴다', () => {
    const watch = decisionStopFrom({ year: base.date.year, week: 1 });
    const due = at(deadlineWeek, (s) => {
      s.sales.sellProposals = [
        { horseId, saleId: saleEvent.id, year: base.date.year, reserve: null, note: '', status: 'proposed' },
      ];
    });
    expect(watch.stop(due)).toBe(true);
    expect(watch.reason).toMatch(/위탁 마감/);
  });

  it('advanceWeeksGated 와 함께 쓰면 시작 주 사유에 막히지 않고, 사유 주에서 멈춘다', () => {
    const proposals = [
      { horseId, saleId: saleEvent.id, year: base.date.year, reserve: null, note: '', status: 'proposed' as const },
    ];
    // 시작 주가 마감 주인 경우: 한 주는 진행되고, 이후 주에는 사유가 없어 2주 모두 진행된다
    // (세일 정지(e)·(f)는 이 테스트가 보는 (a)와 별개라 끈다)
    const onDeadline = at(deadlineWeek, (s) => {
      s.sales.sellProposals = proposals;
      s.settings.stopAtSales = false;
    });
    const watch = decisionStopFrom(onDeadline.date);
    const moved = advanceWeeksGated(onDeadline, [], 2, watch.stop);
    expect(moved.state.date.week).toBe(deadlineWeek + 2);
    expect(watch.reason).toBeNull();

    // 시작 주가 1주인 경우: 마감 주에 도착하면 그 주에서 멈춘다
    const early = at(1, (s) => {
      s.sales.sellProposals = proposals;
      s.settings.stopAtSales = false;
    });
    const stopWatch = decisionStopFrom(early.date);
    const stopped = advanceWeeksGated(early, [], 52, stopWatch.stop);
    expect(stopped.state.date.week).toBe(deadlineWeek);
    expect(stopWatch.reason).toMatch(/위탁 마감/);
  });
});

describe('(e)(f) 세일 발표·거래 주 정지 (M7-E)', () => {
  /** 발표 주가 같은 세일이 둘 이상인 주 */
  function crowdedAnnounceWeek(): number {
    const counts = new Map<number, number>();
    for (const e of getSalesData().events) {
      counts.set(announceWeekOf(e), (counts.get(announceWeekOf(e)) ?? 0) + 1);
    }
    const hit = [...counts].find(([, n]) => n >= 2);
    if (hit === undefined) throw new Error('발표 주가 겹치는 세일이 없다');
    return hit[0];
  }

  /** 발표 주를 처리해 카탈로그를 만든 상태. 판매 시스템만 돌리고 다른 시스템은 돌리지 않는다 */
  function withCatalogue(): GameState {
    const built = at(announceWeekOf(saleEvent));
    const system = createSalesSystem({
      sales: getSalesData(),
      stallionRecords: getStallionRecords(),
      naming: getNamingData(),
      stallionNames: getStallionNames(),
    });
    system.run(built, { date: { ...built.date }, rng: createRng('decision-stop-test') });
    return built;
  }

  it('(e) 카탈로그가 보이는 주(발표 주 + 1)면 세일 이름과 거래 날짜를 담은 문구, stopAtSales false 면 null', () => {
    const week = announceWeekOf(saleEvent);
    const withCatalogue = (s: GameState) => {
      s.sales.catalogues.push({ saleId: saleEvent.id, year: s.date.year, status: 'catalogued', lots: [] });
    };
    const reason = decisionStopReason(at(week + 1, withCatalogue));
    expect(reason).toContain(saleEvent.name);
    expect(reason).toMatch(/카탈로그가 발표됐습니다\(거래 .+\)\. 세일 화면에서 확인하세요\./);
    expect(decisionStopReason(at(week + 1, (s) => { withCatalogue(s); s.settings.stopAtSales = false; }))).toBeNull();
    expect(decisionStopReason(at(week))).toBeNull();
    expect(decisionStopReason(at(week + 1))).toBeNull();
  });

  it('(e) 같은 주 발표가 여럿이면 첫 세일 이름 + 외 N건', () => {
    const week = crowdedAnnounceWeek();
    const same = getSalesData().events.filter((e) => announceWeekOf(e) === week);
    const state = at(week + 1, (s) => {
      for (const e of same) s.sales.catalogues.push({ saleId: e.id, year: s.date.year, status: 'catalogued', lots: [] });
    });
    expect(decisionStopReason(state)).toContain(`외 ${same.length - 1}건 카탈로그가 발표됐습니다`);
  });

  it('(c) 승인 대기 출주 계획이 발표 주와 겹치면 (c) 문구가 먼저다', () => {
    const week = announceWeekOf(saleEvent);
    const planned = at(week, (s) => {
      s.settings.autoApproveRacePlans = false;
      s.seasonState.racePlans = {
        [horseId]: [
          {
            id: 'stop-plan',
            date: { year: base.date.year, week },
            templateId: null,
            target: { kinds: ['maiden' as const], minDistance: 1000, maxDistance: 1800 },
            status: 'proposed' as const,
            note: '',
          },
        ],
      };
    });
    expect(decisionStopReason(planned)).toMatch(/출주 계획/);
  });

  it('(f) 입찰한 세일의 거래 주면 세일 이름 문구, 입찰이 없거나 stopAtSales false 면 없다', () => {
    const built = withCatalogue();
    const catalogue = built.sales.catalogues.find((c) => c.saleId === saleEvent.id && c.year === built.date.year)!;
    // 거래 주가 다른 세일의 발표 주와 겹치면 (e)가 먼저 나오므로, 겹치지 않는 로트를 고른다
    const announceWeeks = new Set(getSalesData().events.map((e) => announceWeekOf(e)));
    const lot = catalogue.lots.find((l) => !announceWeeks.has(saleWeekOf(saleEvent, catalogue.year, l).week))!;
    const tradeWeek = saleWeekOf(saleEvent, catalogue.year, lot);
    const onTradeWeek = (bid: boolean, stopAtSales?: boolean): GameState => {
      const s = structuredClone(built);
      s.date = { ...tradeWeek };
      s.yearEnd.lastSubmittedYear = s.date.year;
      s.stud.matingProposals = [];
      s.sales.playerBids = bid ? [{ saleId: saleEvent.id, year: catalogue.year, lotNo: lot.lotNo, maxBid: 1000 }] : [];
      if (stopAtSales !== undefined) s.settings.stopAtSales = stopAtSales;
      return s;
    };
    const reason = decisionStopReason(onTradeWeek(true));
    expect(reason).toContain(saleEvent.name);
    expect(reason).toMatch(/거래 주입니다\. 실시간 보기로 경매를 볼 수 있습니다\./);
    expect(decisionStopReason(onTradeWeek(false))).toBeNull();
    expect(decisionStopReason(onTradeWeek(true, false))).toBeNull();
  });
});
