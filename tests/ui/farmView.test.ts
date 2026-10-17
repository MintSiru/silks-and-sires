import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyFarm, FACILITY_KINDS, FACILITY_MAX_LEVEL, FARM_BASE_PRICE, FARM_COUNTRY_PRICE_MULT,
  FARM_RESALE_SHARE, PADDOCK_GROWTH_PER_LEVEL, POOL_REST_RECOVERY_PER_LEVEL,
  VET_EXAM_REDUCTION_PER_LEVEL, uniformFacilities,
} from '../../src/engine/config/farm';
import { DUE_WEEK_KEY_YEAR_SCALE } from '../../src/engine/config/breedingSeason';
import { purchaseFarm } from '../../src/engine/farm/purchase';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import { formatDateKo } from '../../src/engine/time/calendar';
import type { GameState } from '../../src/engine/types';
import FarmScreen from '../../src/ui/farm/FarmScreen';
import {
  constructionBanner, facilityEffectParts, facilityRows, farmSummary, listingRows, stageGlyph, stageLabel,
} from '../../src/ui/farm/farmView';
import { useGame, type GameApi } from '../../src/ui/game/useGame';
import { createIndexedDbSaveStore } from '../../src/ui/storage/saveStore';

function fixture(): GameState {
  const state = createNewGame({ seed: 20261016, playerName: '가상 마주', difficulty: 'normal',
    startType: 'owner_breeder', silks: { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' } });
  state.farm.name = '구름들 목장';
  state.farmListings = [{ id: 'test-large', name: '솔바람 목장', country: 'IE', size: 'large', price: 2_200_000 },
    { id: 'test-small', name: '새벽들 목장', country: 'IT', size: 'small', price: 250_000 }];
  return state;
}

function addMares(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    const horse = generateHorse(createRng(`mare-${i}`), { id: `mare-${i}`, name: `구름 ${i}`,
      sex: 'female', birthYear: state.date.year - 5, currentYear: state.date.year,
      countryOfBirth: 'GB', status: 'broodmare', level: 60 });
    horse.ownerId = state.playerOwnerId;
    state.horses[horse.id] = horse;
    state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  }
}

function captureGame(): GameApi {
  let api: GameApi | undefined;
  function Capture() { api = useGame(); return null; }
  renderToStaticMarkup(createElement(Capture));
  return api!;
}

describe('farmView', () => {
  it('보통 오너브리더 요약: 중형·15 + 3 = 18두·연 €72,000·종마 1칸', () => {
    const state = fixture();
    addMares(state, 2);
    expect(farmSummary(state)).toMatchObject({ owned: true, name: '구름들 목장', sizeKo: '중형',
      countryKo: '영국', acquiredYear: state.date.year, broodmareCount: 2, mareCapacity: 18,
      baseCapacity: 15, stableBonus: 3, annualUpkeep: 72_000, stallionSlots: 1 });
  });

  it('목장이 없으면 요약과 공사 불가, 새 매물 수용 한도에는 기본 시설 1단계 반영', () => {
    const state = fixture();
    state.farm = emptyFarm();
    state.settings.startType = 'owner';
    expect(farmSummary(state)).toEqual({ owned: false, name: '목장 없음' });
    expect(facilityRows(state).every((r) => r.level === 0 && r.disabledReason !== null)).toBe(true);
    expect(listingRows(state)[1]).toMatchObject({ capacity: 9, netCost: 250_000, resale: 0, canPurchase: true });
  });

  it.each([0, 1, 2, 3])('시설 %i단계 효과는 config 계수 × 단계', (level) => {
    const state = fixture();
    state.farm.facilities = uniformFacilities(level);
    const rows = facilityRows(state);
    expect(rows.map((row) => row.kind)).toEqual(FACILITY_KINDS);
    expect(rows.find((r) => r.kind === 'paddock')!.effectKo).toBe(`망아지·1세 성장 +${Math.round(PADDOCK_GROWTH_PER_LEVEL * level * 100)}%`);
    expect(rows.find((r) => r.kind === 'pool')!.effectKo).toContain(`회복 +${Math.round(POOL_REST_RECOVERY_PER_LEVEL * level * 100)}%`);
    expect(rows.find((r) => r.kind === 'vet_clinic')!.effectKo).toContain(`검사비 −${Math.round(VET_EXAM_REDUCTION_PER_LEVEL * level * 100)}%`);
    if (level === FACILITY_MAX_LEVEL) expect(rows.every((r) => r.nextCost === null && r.disabledReason !== null)).toBe(true);
  });

  it('연말을 넘는 공사 예정 날짜와 모든 행 비활성 이유, 현재 효과 유지', () => {
    const state = fixture();
    const ready = { year: state.date.year + 1, week: 3 };
    state.farm.construction = { facility: 'paddock', level: 2,
      readyWeekKey: ready.year * DUE_WEEK_KEY_YEAR_SCALE + ready.week };
    const rows = facilityRows(state);
    expect(rows[0]).toMatchObject({ level: 1, nextCost: 150_000,
      constructionKo: `공사 중 → 2단계, 완공 예정 ${formatDateKo(ready)}` });
    expect(rows.every((r) => r.disabledReason?.includes('공사 중'))).toBe(true);
    expect(rows.slice(1).every((r) => r.constructionKo === null)).toBe(true);
  });

  it('이전 순지출과 구매 가능 여부가 엔진 판정과 일치한다(자금·빚·너무 작음·환급)', () => {
    const state = fixture();
    const resale = Math.round(FARM_BASE_PRICE.medium * FARM_COUNTRY_PRICE_MULT.GB * FARM_RESALE_SHARE);
    expect(listingRows(state)[0]).toMatchObject({ resale, netCost: 2_200_000 - resale, canPurchase: false });
    expect(listingRows(state)[1]).toMatchObject({ netCost: 250_000 - resale, canPurchase: true });
    state.economy.mode = 'casual';
    state.economy.debt = 1;
    state.owners[state.playerOwnerId]!.funds = 5_000_000;
    for (const row of listingRows(state)) expect(row.canPurchase).toBe(purchaseFarm(state, row.id).ok);
    addMares(state, 10);
    expect(listingRows(state)[1]!.disabledReason).toContain('너무 작음');
    expect(purchaseFarm(state, 'test-small')).toEqual({ ok: false, error: 'too_small' });
  });

  it('화면 계산은 입력 상태를 바꾸지 않는다', () => {
    const state = fixture();
    const before = structuredClone(state);
    farmSummary(state); facilityRows(state); listingRows(state);
    expect(state).toEqual(before);
  });

  it('목장 없음 화면은 구매 안내·매물, 보유 화면은 요약·시설·매물을 렌더링한다', () => {
    const state = fixture();
    const game = { ...captureGame(), state };
    const owned = renderToStaticMarkup(createElement(FarmScreen, { game }));
    for (const text of ['구름들 목장', '시설 공사', '목장 매물', '€72,000', '공사 시작', '이전']) expect(owned).toContain(text);
    // 단계 칸: 채운 칸은 좋음 색 클래스, 빈 칸은 흐린 색 클래스로 나뉜다(V3 · 17)
    expect(owned).toContain('farm-stage__on');
    expect(owned).toContain('farm-stage__off');
    state.farm = emptyFarm();
    const unowned = renderToStaticMarkup(createElement(FarmScreen, { game }));
    expect(unowned).toContain('목장을 사면 오너브리더가 됩니다.');
    expect(unowned).toContain('구매');
    expect(unowned).not.toContain('공사 시작');
  });
});

describe('farmView 화면 보조 (M6-U9 G)', () => {
  it('단계 진행 칸과 읽기 이름: 3단계 중 1단계는 ■□□ · 1/3단계', () => {
    expect(stageGlyph(1, FACILITY_MAX_LEVEL)).toBe('■□□');
    expect(stageGlyph(0, FACILITY_MAX_LEVEL)).toBe('□□□');
    expect(stageGlyph(FACILITY_MAX_LEVEL, FACILITY_MAX_LEVEL)).toBe('■■■');
    expect(stageLabel(1, FACILITY_MAX_LEVEL)).toBe('1/3단계');
    const state = fixture();
    state.farm.facilities = uniformFacilities(1);
    expect(facilityRows(state)[0]).toMatchObject({ stageGlyph: '■□□', stageLabel: '1/3단계' });
  });

  it('현재 → 다음 단계 효과: 다음 수치가 커지면 improved, 최대 단계는 next 가 없다', () => {
    const paddock = facilityEffectParts('paddock', 1);
    expect(paddock).toEqual([{ label: '망아지·1세 성장', current: `+${Math.round(PADDOCK_GROWTH_PER_LEVEL * 100)}%`,
      next: `+${Math.round(PADDOCK_GROWTH_PER_LEVEL * 2 * 100)}%`, improved: true }]);
    expect(facilityEffectParts('paddock', FACILITY_MAX_LEVEL)).toEqual([{ label: '망아지·1세 성장',
      current: `+${Math.round(PADDOCK_GROWTH_PER_LEVEL * FACILITY_MAX_LEVEL * 100)}%`, next: null, improved: false }]);
    // 종마사는 0→1단계에서 칸 수가 그대로(최소 1칸)라 증가분이 없다
    expect(facilityEffectParts('stallion_barn', 0)).toEqual([{ label: '종마', current: '1칸', next: '1칸', improved: false }]);
    expect(facilityEffectParts('stallion_barn', 1)[0]).toMatchObject({ current: '1칸', next: '2칸', improved: true });
  });

  it('공사 배너: 공사가 있을 때만 시설·단계 변화·완료 예정 주를 준다', () => {
    const state = fixture();
    expect(constructionBanner(state)).toBeNull();
    const ready = { year: state.date.year + 1, week: 3 };
    state.farm.construction = { facility: 'paddock', level: 2,
      readyWeekKey: ready.year * DUE_WEEK_KEY_YEAR_SCALE + ready.week };
    expect(constructionBanner(state)).toEqual({ facility: 'paddock',
      text: `방목지 1단계 → 2단계 · 완료 예정 ${formatDateKo(ready)}` });
  });

  it('공사 중 화면: 상단 고정 공사 줄, 다른 공사 시작은 사유 title, 목장 매물 접기는 왼쪽 열', () => {
    const state = fixture();
    const ready = { year: state.date.year + 1, week: 3 };
    state.farm.construction = { facility: 'paddock', level: 2,
      readyWeekKey: ready.year * DUE_WEEK_KEY_YEAR_SCALE + ready.week };
    const game = { ...captureGame(), state };
    const html = renderToStaticMarkup(createElement(FarmScreen, { game }));
    expect(html).toContain('farm-construction');
    expect(html).toContain(`공사 중 · 방목지 1단계 → 2단계 · 완료 예정 ${formatDateKo(ready)}`);
    expect(html).toContain('aria-label="1/3단계"');
    expect(html).toContain('title="시설 공사 중입니다. 완공 후 착공할 수 있습니다."');
    expect(html).toMatch(/farm-column--left[\s\S]*farm-listings[\s\S]*farm-column--right/);
  });
});

it('useGame 목장 구매·공사가 상태·장부·eventLog를 한 번 갱신하고 자동 저장한다', async () => {
  const state = fixture();
  const store = createIndexedDbSaveStore();
  await store.save({ id: 'autosave', name: '자동 저장', savedAt: '2026-10-16T00:00:00.000Z',
    date: state.date, playerName: '가상 마주' }, serializeGame(state, '2026-10-16T00:00:00.000Z'));
  const api = captureGame();
  expect(await api.load()).toBe(true);
  const purchased = api.purchaseFarm('test-small');
  if (!purchased.ok) throw new Error(purchased.error);
  expect(purchased.state.farm.name).toBe('새벽들 목장');
  expect(purchased.state.eventLog.filter((e) => e.type === 'farm_purchased')).toHaveLength(1);
  expect(purchased.state.economy.playerLedger.map((e) => e.amount)).toEqual([750_000, -250_000]);
  const started = api.startFacilityUpgrade('pool');
  if (!started.ok) throw new Error(started.error);
  expect(started.state.farm.construction).toMatchObject({ facility: 'pool', level: 2 });
  expect(started.state.eventLog.filter((e) => e.type === 'facility_upgraded')).toHaveLength(1);
  expect(started.state.economy.playerLedger.at(-1)).toMatchObject({ category: 'facility_build', amount: -150_000 });
  expect(started.state.owners[state.playerOwnerId]!.funds).toBe(950_000);
  expect(api.startFacilityUpgrade('paddock')).toEqual({ ok: false, error: 'under_construction' });
  expect(api.purchaseFarm('missing')).toEqual({ ok: false, error: 'not_found' });
  await vi.waitFor(async () => {
    const saved = await store.load('autosave');
    if (saved === null) throw new Error('저장본 없음');
    const loaded = deserializeGame(saved);
    if (!loaded.ok) throw new Error(loaded.error.message);
    expect(loaded.state.farm).toEqual(started.state.farm);
    expect(loaded.state.eventLog).toEqual(started.state.eventLog);
    expect(loaded.state.economy.playerLedger).toEqual(started.state.economy.playerLedger);
  });
});
