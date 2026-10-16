import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { DAM_AGE_GAP_MAX, DAM_AGE_GAP_MIN } from '../../src/engine/config/world';
import { DUE_WEEK_KEY_YEAR_SCALE } from '../../src/engine/config/breedingSeason';
import { SALE_LOT_SCALE } from '../../src/engine/config/sales';
import { dominantCrosses, findInbreeding, ownBloodPercent } from '../../src/engine/breeding/inbreeding';
import { buildMatingPedigree, buildPedigree, damsireIdOf, virtualDamId } from '../../src/engine/breeding/pedigree';
import { createPedigreeLookup } from '../../src/engine/breeding/realPedigree';
import { buildMatingPreview } from '../../src/engine/breeding/preview';
import { createBreedingSystem, damsireLineOf } from '../../src/engine/breeding/season';
import * as genetics from '../../src/engine/breeding/genetics';
import { makeNameRegistry } from '../../src/engine/naming/context';
import { registerHorseName } from '../../src/engine/naming/register';
import { normalizeName } from '../../src/engine/naming/validate';
import { createRng } from '../../src/engine/rng';
import { buildCatalogue } from '../../src/engine/sales/catalogue';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { sortStallionRecords } from '../../src/engine/state/stallionHorses';
import type { GameState, Horse } from '../../src/engine/types';
import { racingHorseIds } from '../../src/engine/world/population';
import { coverYearForFoal, filterSiresForCover } from '../../src/engine/world/sireWindow';
import { makeVirtualDam } from '../../src/engine/world/virtualDam';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(), sales: data.getSalesData(),
};
const options = { seed: 20261011, playerName: 'ST3 Measure',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
const records = sortStallionRecords(staticData.stallionRecords);
let base: GameState;
beforeAll(() => { base = bootstrapGame(options, staticData); });

function expectUnique(state: GameState) {
  const names = Object.values(state.horses).flatMap(h => [h.name, ...(h.virtualDam ? [h.virtualDam.name] : [])]);
  expect(new Set(names.map(normalizeName)).size).toBe(names.length);
}

describe('ST3 가상 모마 생성·저장', () => {
  it('고정 시드 새 게임 전체가 결정적이고, AI 현역마 전부에 모마가 있으며 두수·공용 rng는 이전과 같다', () => {
    expect(bootstrapGame(options, staticData)).toEqual(base);
    expect(Object.keys(base.horses)).toHaveLength(3438); // ST3 직전 동일 데이터·시드 측정값
    expect(createHash('sha256').update(JSON.stringify(base.rng)).digest('hex'))
      .toBe('eef28dbb3de1fada9a12b73ecd64250aad90aca80cc1f76cd4a087e209ebe6f6');
    for (const id of racingHorseIds(base)) {
      const horse = base.horses[id]!;
      expect(horse.damId).toBeNull();
      expect(horse.virtualDam, id).toBeDefined();
      const dam = horse.virtualDam!;
      expect(horse.birthYear - dam.birthYear).toBeGreaterThanOrEqual(DAM_AGE_GAP_MIN);
      expect(horse.birthYear - dam.birthYear).toBeLessThanOrEqual(DAM_AGE_GAP_MAX);
      expect(filterSiresForCover(records, coverYearForFoal(dam.birthYear)).some(r => r.key === dam.sireId)).toBe(true);
    }
    expectUnique(base);
    for (const horse of Object.values(base.horses).filter(h => h.ownerId === base.playerOwnerId && h.status === 'in_training')) {
      expect(horse.damId).not.toBeNull();
      expect(horse.virtualDam).toBeUndefined();
    }
  });

  it('독립 스트림은 결정적이며 state·공용 rng·말 레코드·ID를 바꾸지 않고 이름을 예약한다', () => {
    const horse = base.horses[racingHorseIds(base)[0]!]!;
    const stateBefore = structuredClone(base);
    const registry = makeNameRegistry(base);
    const dam = makeVirtualDam(base, staticData, records, registry, horse, 'test-dam', 'GB');
    if (dam === null) throw new Error('후보 종마가 있는데 가상 모마가 없다');
    expect(dam).toEqual(makeVirtualDam(base, staticData, records, makeNameRegistry(base), horse, 'test-dam', 'GB'));
    expect(registry.isTaken(dam.name)).toBe(true);
    expect(base).toEqual(stateBefore);
  });

  it('첫 세일 및 모든 생성 종류의 로트에 모마가 있고, 레코드는 로트 수만큼만 늘어난다', () => {
    const state = structuredClone(base);
    const events = [...staticData.sales.events].sort((a, b) => a.week - b.week);
    const kinds = new Set<string>();
    for (const event of events) {
      if (kinds.has(event.kind)) continue;
      kinds.add(event.kind);
      const before = Object.keys(state.horses).length;
      const cat = buildCatalogue(state, event, state.date.year, staticData, createRng(`ST3:${event.id}`));
      expect(cat.lots.length).toBeGreaterThan(0);
      for (const lot of cat.lots) expect(state.horses[lot.horseId]?.virtualDam).toBeDefined();
      const generated = event.kind === 'horses_in_training' ? 0
        : event.books.reduce((sum, b) => sum + Math.max(1, Math.round(b.lotsTarget * SALE_LOT_SCALE)), 0);
      expect(Object.keys(state.horses)).toHaveLength(before + generated);
    }
    expectUnique(state);
    const saved = serializeGame(state, '2026-10-16T00:00:00.000Z');
    const loaded = deserializeGame(saved);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state).toEqual(state);
  });

  it('가상 모마 이름도 대소문자·공백 정규화 후 예약되며 플레이어 직접 등록으로 빼앗을 수 없다', () => {
    const state = structuredClone(base);
    const horse = state.horses[racingHorseIds(state)[0]!]!;
    horse.ownerId = state.playerOwnerId;
    horse.nameRegistered = false;
    const name = horse.virtualDam!.name;
    expect(makeNameRegistry(state).isTaken(` ${name.toUpperCase()} `)).toBe(true);
    expect(registerHorseName(state, horse.id, name).ok).toBe(false);
  });

  it('옛 저장에는 모마를 이주 생성하지 않는다', () => {
    const state = structuredClone(base);
    for (const horse of Object.values(state.horses)) delete horse.virtualDam;
    const loaded = deserializeGame(serializeGame(state, '2026-10-16T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(Object.values(loaded.state.horses).every(h => h.virtualDam === undefined)).toBe(true);
  });
});

describe('ST3 혈통·근친·니크·자마', () => {
  it('모마의 이름·출생 연도와 외조부를 조회하고 실명 종마 모계까지 확장한다', () => {
    const horse = Object.values(base.horses).find(h => h.virtualDam && records.some(r => r.key === h.virtualDam!.sireId && r.damsireKey !== null))!;
    const lookup = createPedigreeLookup(base.horses, records);
    const root = buildPedigree(lookup, horse.id);
    expect(lookup(root.dam!.horseId!)!).toMatchObject({ name: horse.virtualDam!.name,
      birthYear: horse.virtualDam!.birthYear, sireId: horse.virtualDam!.sireId });
    expect(root.dam?.sire?.horseId).toBe(horse.virtualDam!.sireId);
    expect(root.dam?.sire?.dam).not.toBeNull();
    expect(damsireIdOf(base.horses, horse)).toBe(horse.virtualDam!.sireId);
    expect(base.horses[virtualDamId(horse.id)]).toBeUndefined();
    expect(buildPedigree(id => base.horses[id], horse.id).dam?.sire?.horseId).toBe(horse.virtualDam!.sireId);
  });

  it('실제 모마 우선·미상 모마 유지·다른 말의 가상 모마는 다른 ID다', () => {
    const original = base.horses[racingHorseIds(base)[0]!]!;
    const real = Object.values(base.horses).find(h => h.damId !== null)!;
    const horses = { ...base.horses, [original.id]: { ...original, damId: real.damId } };
    const lookup = createPedigreeLookup(horses, records);
    expect(buildPedigree(lookup, original.id).dam?.horseId).toBe(real.damId);
    expect(lookup(virtualDamId(original.id))).toBeUndefined();
    const old = { ...original, virtualDam: undefined };
    expect(buildPedigree(id => id === old.id ? old : horses[id], old.id).dam).toBeNull();
    expect(virtualDamId(original.id)).not.toBe(virtualDamId(real.id));
  });

  it('가상 모계를 통한 공통 조상이 근친·배합 미리보기·실제 자마 유전 입력에 반영된다', () => {
    const state = structuredClone(base);
    const template = base.horses[racingHorseIds(base)[0]!]!;
    const makeHorse = (id: string, changes: Partial<Horse>): Horse => ({ ...structuredClone(template),
      id, name: id, ownerId: null, sireId: null, damId: null, virtualDam: undefined, ...changes });
    const common = makeHorse('vd-common', {});
    const sire = makeHorse('vd-sire', { sireId: common.id });
    const mareSire = makeHorse('vd-mare-sire', { sireId: common.id });
    const mare = makeHorse('vd-mare', { sex: 'female', status: 'broodmare', sireId: mareSire.id,
      virtualDam: { name: 'Silver Thread', birthYear: 2008, sireId: common.id } });
    for (const h of [common, sire, mareSire, mare]) state.horses[h.id] = h;
    const lookup = createPedigreeLookup(state.horses, records);
    expect(ownBloodPercent(lookup, mare)).toBeGreaterThan(0);
    const root = buildMatingPedigree(lookup, sire.id, mare.id);
    const crosses = dominantCrosses(root, findInbreeding(root));
    expect(crosses.find(c => c.ancestorId === common.id)?.damSide).toContain(3);
    const line = damsireLineOf(state, mare)!;
    const key = `${sire.sireLineId}|${line}`;
    const preview = buildMatingPreview({ sire, dam: mare, damsire: mareSire, damsireLineId: line, lookup,
      nicks: [{ sireLineId: sire.sireLineId!, damsireLineId: line, value: 1, knownAtStart: true }], revealedNicks: new Set([key]) });
    expect(preview.inbreeding).toEqual(crosses);
    expect(preview.nick.known).toBe(true);
    const existingMare = Object.values(state.mares)[0]!;
    state.mares[mare.id] = { ...structuredClone(existingMare), horseId: mare.id, pregnant: true,
      coveredBy: sire.id, dueWeek: state.date.year * DUE_WEEK_KEY_YEAR_SCALE + state.date.week, foals: [] };
    const spy = vi.spyOn(genetics, 'breed');
    try {
      const events = createBreedingSystem(staticData).run(state, { date: state.date, rng: createRng('vd-birth') });
      expect(events.some(e => e.type === 'foal_born' && e.mareId === mare.id)).toBe(true);
      const args = spy.mock.calls.find(([, a]) => a.dam.id === mare.id)![1];
      expect(args.inbreeding).toEqual(crosses);
      expect(args.damOwnBloodPercent).toBe(ownBloodPercent(lookup, mare));
      // 이 자마의 외조부는 어미의 부. 어미 자신의 가상 모부는 한 대 더 위다.
      expect(args.damsire?.id).toBe(mareSire.id);
      expect(args.damsire?.id).not.toBe(mare.virtualDam!.sireId);
      expect(args.damsireLineId).toBe(mareSire.sireLineId);
    } finally { spy.mockRestore(); }
  });
});
