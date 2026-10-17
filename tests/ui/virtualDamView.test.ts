import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { buildMatingPedigree } from '../../src/engine/breeding/pedigree';
import { createPedigreeLookup } from '../../src/engine/breeding/realPedigree';
import { createRng } from '../../src/engine/rng';
import { buildCatalogue } from '../../src/engine/sales/catalogue';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import type { GameState, Horse, SaleCatalogue, SaleEventDef } from '../../src/engine/types';
import PedigreeView from '../../src/ui/breeding/PedigreeView';
import { parentageOf, pedigreeNameOf } from '../../src/ui/breeding/pedigreeNames';
import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import type { GameApi } from '../../src/ui/game/useGame';
import HorseDetail from '../../src/ui/horse/HorseDetail';
import { horsePedigree } from '../../src/ui/horse/horseDetailView';
import SalesScreen, { LotDetail } from '../../src/ui/sales/SalesScreen';
import { catalogueRows, lotDetailView } from '../../src/ui/sales/salesView';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(), sales: data.getSalesData(),
};
let state: GameState;
let horse: Horse;
let catalogue: SaleCatalogue;
let event: SaleEventDef;
let game: GameApi;
const text = (name: string) => renderToStaticMarkup(createElement('span', null, name)).slice(6, -7);

beforeAll(() => {
  state = bootstrapGame({ seed: 20261011, playerName: '가상 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData);
  event = [...staticData.sales.events].sort((a, b) => a.week - b.week).find(e => e.kind !== 'horses_in_training')!;
  catalogue = buildCatalogue(state, event, state.date.year, staticData, createRng('ST3-UI'));
  state.sales.catalogues.push(catalogue);
  state.date.week = event.week;
  horse = state.horses[catalogue.lots[0]!.horseId]!;
  game = { state } as GameApi;
});

it('세일 목록은 부 × 외조부, 실제 로트 상세 컴포넌트는 모마·외조부를 표시한다', () => {
  const expected = parentageOf(state, horse);
  const rows = catalogueRows(state, event.id, catalogue.year, staticData);
  expect(rows[0]?.damsireName).toBe(state.horses[horse.virtualDam!.sireId]!.name);
  const list = renderToStaticMarkup(createElement(SalesScreen, { game }));
  expect(list).toContain('부 × 모부(외조부)');
  expect(list).toContain(text(expected.damsire));
  const detail = lotDetailView(state, event.id, catalogue.year, catalogue.lots[0]!.lotNo, staticData)!;
  expect(detail.damName).toBe(horse.virtualDam!.name);
  expect(detail.damsireName).toBe(expected.damsire);
  const html = renderToStaticMarkup(createElement(LotDetail, { game, state, saleId: event.id,
    year: catalogue.year, detail, event, open: false, liveActive: false, locked: true }));
  expect(html).toContain(text(expected.dam));
  expect(html).toContain(text(expected.damsire));
});

it('UX2 HorseDetail의 실제 혈통 탭에서 가상 모마·외조부가 표시된다', () => {
  const html = renderToStaticMarkup(createElement(WeightUnitProvider, null,
    createElement(HorseDetail, { game, horseId: horse.id, initialTab: 'pedigree', onClose() {}, onBreeding() {} })));
  const expected = parentageOf(state, horse);
  expect(html).toContain('<h3>혈통</h3>');
  expect(html).toContain(text(expected.dam));
  expect(html).toContain(text(expected.damsire));
  expect(horsePedigree(state, horse).summary).toContain(expected.damsire);
  expect(html).not.toContain('~virtual-dam:');
});

it('번식 화면과 같은 교배 혈통표에서 암말의 가상 모마와 외조부를 표시한다', () => {
  const sire = state.horses[Object.keys(state.stallions)[0]!]!;
  const root = buildMatingPedigree(createPedigreeLookup(state.horses, staticData.stallionRecords), sire.id, horse.id);
  const html = renderToStaticMarkup(createElement(PedigreeView, { root, nameOf: id => pedigreeNameOf(state, id) }));
  expect(html).toContain(text(horse.virtualDam!.name));
  expect(html).toContain(text(state.horses[horse.virtualDam!.sireId]!.name));
  expect(html).not.toContain('~virtual-dam:');
});
