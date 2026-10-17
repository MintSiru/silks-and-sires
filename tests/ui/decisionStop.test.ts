import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { advanceWeeksGated } from '../../src/engine/stud/yearEnd';
import { announceWeekOf } from '../../src/engine/sales/system';
import { MATING_AUTO_BOOK_WEEK } from '../../src/engine/config/mating';
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
    expect(decisionStopReason(at(10))).toBeNull();
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
    const proposal = {
      mareId: horseId,
      season,
      stallionId: horseId,
      alternatives: [],
      expectedFee: 0,
      note: '',
      status: 'proposed' as const,
    };
    const auto = at(MATING_AUTO_BOOK_WEEK, (s) => {
      s.stud.matingProposals = [proposal];
    });
    expect(decisionStopReason(auto)).toMatch(/교배 제안/);
    const manual = at(MATING_AUTO_BOOK_WEEK, (s) => {
      s.stud.matingProposals = [proposal];
      s.settings.autoApproveMatings = false;
    });
    expect(decisionStopReason(manual)).toBeNull();
    const other = at(MATING_AUTO_BOOK_WEEK + 1, (s) => {
      s.stud.matingProposals = [proposal];
    });
    expect(decisionStopReason(other)).toBeNull();
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
    const start = at(MATING_AUTO_BOOK_WEEK, (s) => {
      s.stud.matingProposals = [
        { mareId: horseId, season: base.date.year, stallionId: horseId, alternatives: [], expectedFee: 0, note: '', status: 'proposed' },
      ];
    });
    const watch = decisionStopFrom(start.date);
    expect(watch.stop(start)).toBe(false);
    expect(watch.reason).toBeNull();
    expect(watch.stop(at(MATING_AUTO_BOOK_WEEK + 1))).toBe(false);
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
    const onDeadline = at(deadlineWeek, (s) => {
      s.sales.sellProposals = proposals;
    });
    const watch = decisionStopFrom(onDeadline.date);
    const moved = advanceWeeksGated(onDeadline, [], 2, watch.stop);
    expect(moved.state.date.week).toBe(deadlineWeek + 2);
    expect(watch.reason).toBeNull();

    // 시작 주가 1주인 경우: 마감 주에 도착하면 그 주에서 멈춘다
    const early = at(1, (s) => {
      s.sales.sellProposals = proposals;
    });
    const stopWatch = decisionStopFrom(early.date);
    const stopped = advanceWeeksGated(early, [], 52, stopWatch.stop);
    expect(stopped.state.date.week).toBe(deadlineWeek);
    expect(stopWatch.reason).toMatch(/위탁 마감/);
  });
});
