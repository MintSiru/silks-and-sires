import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import { RIVAL_SALE_BATTLE_MIN } from '../../src/engine/config/rivals';
import * as data from '../../src/engine/data/staticData';
import { playerBidValid } from '../../src/engine/sales/auction';
import { saleWeekOf } from '../../src/engine/sales/bidding';
import { isDistanceFit } from '../../src/engine/season/eligibility';
import { declarePlayerHorseInPlace } from '../../src/engine/season/player';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createGameSystems } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type { GameEvent, Horse, WeeklySystem } from '../../src/engine/types';

const REPORT_PATH = fileURLToPath(new URL('../../docs/reports/2026-10-16-m5-d2-rival-effects.json', import.meta.url));
const SEED = 20261011;
const YEARS = 3;
const TOP_LOTS = 3;

/** 기본 전체 테스트에서는 생략. 통과 테스트의 console.log 대신 재현 가능한 JSON 파일을 남긴다. */
it.skipIf(process.env.M5_D2_MEASURE !== '1')('M5-D2 시드 20261011 3년: 세일 경합·라이벌 G1 동반 출주 측정', () => {
  const staticData = { ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
    series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
    stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(), sales: data.getSalesData() };
  let state = bootstrapGame({ seed: SEED, playerName: '구름들 마주', economyMode: 'casual',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  state.settings.autoApproveRacePlans = false;
  const saleById = new Map(staticData.sales.events.map((e) => [e.id, e]));
  const g1Ids = new Set(staticData.templates.filter((t) => t.grade === 'G1').map((t) => t.id));
  const declaredRivals: Extract<GameEvent, { type: 'rival_declared' }>[] = [];
  const companions: { year: number; week: number; raceId: string; ownerId: string; horses: string[] }[] = [];
  const annual = Array.from({ length: YEARS }, (_, i) => ({ year: state.date.year + i,
    playerBids: 0, validBidsAtSale: 0, playerG1Entries: 0, playerG1Starts: 0, saleBattleRivals: 0, rivalG1CompanionPairs: 0 }));
  const systems = createGameSystems(staticData).map((system): WeeklySystem => ({ ...system,
    run(draft, ctx) {
      const active = new Set((draft.rivals ?? []).filter((r) => r.active).map((r) => r.ownerId));
      if (system.id === 'sales') {
        // 당일 자금·수수료·수용 한도 기준으로 실제 유효 입찰도 별도로 센다.
        for (const bid of draft.sales.playerBids) {
          const event = saleById.get(bid.saleId);
          const lot = draft.sales.catalogues.find((c) => c.saleId === bid.saleId && c.year === bid.year)
            ?.lots.find((l) => l.lotNo === bid.lotNo);
          if (event === undefined || lot === undefined || lot.result !== null) continue;
          const when = saleWeekOf(event, bid.year, lot);
          if (when.year === ctx.date.year && when.week === ctx.date.week && playerBidValid(draft, event, lot, bid.maxBid)) {
            annual.find((a) => a.year === ctx.date.year)!.validBidsAtSale++;
          }
        }
      }
      const events = system.run(draft, ctx);
      if (system.id === 'season') {
        for (const race of draft.raceResults.filter((r) => r.date.year === ctx.date.year && r.date.week === ctx.date.week && g1Ids.has(r.raceId))) {
          if (!race.runners.some((r) => draft.horses[r.horseId]?.ownerId === draft.playerOwnerId)) continue;
          annual.find((a) => a.year === ctx.date.year)!.playerG1Starts++;
          for (const ownerId of active) {
            const horses = race.runners.filter((r) => draft.horses[r.horseId]?.ownerId === ownerId).map((r) => r.horseId);
            if (horses.length === 0) continue;
            companions.push({ ...ctx.date, raceId: race.raceId, ownerId, horses });
            annual.find((a) => a.year === ctx.date.year)!.rivalG1CompanionPairs++;
          }
        }
      }
      return events;
    },
  }));
  const started = performance.now();
  const report = (completed: boolean) => {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify({ completed, seed: SEED, years: YEARS, weeks: WEEKS_PER_YEAR * YEARS,
      scenario: '기본 시작마·캐주얼 경제. 각 세일 북의 평가액 상위 3개 로트에 max(€50,000, 평가액 × 0.8) 입찰. 현재 자금으로 유효한 입찰만 저장. 매주 거리 적합한 시작·소유마를 가능한 G1에 수동 접수. 말 능력·AI 자금·라이벌은 조작하지 않음.',
      companionDefinition: '경주 실행 직전 활성 라이벌과 플레이어가 함께 실제 출주한 (G1 레이스, 라이벌 마주) 쌍. 효과로 추가된 출주만의 인과 추정값은 아님.',
      annual, saleBattleRivals: declaredRivals.filter((r) => r.reason === 'sale_battle').length,
      rivalG1CompanionPairs: companions.length, rivalG1CompanionRaces: new Set(companions.map((c) => `${c.year}:${c.week}:${c.raceId}`)).size,
      declaredRivals, companions, finalRivals: state.rivals, finalDate: state.date, elapsedMs: performance.now() - started }, null, 2) + '\n');
  };
  for (let week = 0; week < WEEKS_PER_YEAR * YEARS; week++) {
    const year = annual.find((a) => a.year === state.date.year)!;
    for (const catalogue of state.sales.catalogues) {
      if (catalogue.status !== 'catalogued') continue;
      const event = saleById.get(catalogue.saleId)!;
      // 매 북의 실제 경매 직전에만 입찰해 같은 로트 중복 집계를 피한다.
      for (const book of event.books) {
        const lots = catalogue.lots.filter((lot) => lot.result === null && lot.book === book.book)
          .sort((a, b) => b.valuation - a.valuation || a.lotNo - b.lotNo).slice(0, TOP_LOTS);
        for (const lot of lots) {
          const when = saleWeekOf(event, catalogue.year, lot);
          if (when.year !== state.date.year || when.week !== state.date.week) continue;
          const maxBid = Math.max(RIVAL_SALE_BATTLE_MIN, Math.floor(lot.valuation * 0.8));
          if (!playerBidValid(state, event, lot, maxBid)) continue;
          state.sales.playerBids.push({ saleId: event.id, year: catalogue.year, lotNo: lot.lotNo, maxBid });
          year.playerBids++;
        }
      }
    }
    for (const meeting of state.seasonState.meetings.filter((m) => m.date.year === state.date.year && m.date.week === state.date.week)) {
      for (const sr of meeting.races.filter((r) => r.race.grade === 'G1' && r.status === 'open')) {
        const horses = state.owners[state.playerOwnerId]!.horseIds.map((id) => state.horses[id])
          .filter((h): h is Horse => h !== undefined && isDistanceFit(h, sr.race)).sort((a, b) => a.id.localeCompare(b.id));
        for (const h of horses) {
          if (!declarePlayerHorseInPlace(state, meeting.id, sr.race.id, h.id).ok) continue;
          year.playerG1Entries++;
          break;
        }
      }
    }
    const result = advanceWeek(state, systems);
    state = result.state;
    for (const event of result.events) if (event.type === 'rival_declared') {
      declaredRivals.push(event);
      if (event.reason === 'sale_battle') year.saleBattleRivals++;
    }
    if (state.date.week === 1) report(false);
  }
  expect(state.date).toEqual({ year: annual[0]!.year + YEARS, week: 1 });
  expect(annual.reduce((n, a) => n + a.playerBids, 0)).toBeGreaterThan(0);
  expect(annual.reduce((n, a) => n + a.validBidsAtSale, 0)).toBeGreaterThan(0);
  expect(annual.reduce((n, a) => n + a.playerG1Starts, 0)).toBeGreaterThan(0);
  report(true);
}, 900_000);
