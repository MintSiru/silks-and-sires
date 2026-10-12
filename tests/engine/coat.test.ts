import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { generateHorse } from '../../src/engine/horse/generate';
import { coatColour, coatFromColour, generateCoat, greyLightness, inheritCoat } from '../../src/engine/horse/coat';
import { breed, type BreedArgs } from '../../src/engine/breeding/genetics';
import { createRealStallionHorses } from '../../src/engine/state/stallionHorses';
import { getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { coatColourKo, faceMarkingKo } from '../../src/ui/game/text';
import type {
  Coat,
  CoatColour,
  CoatGenes,
  FaceMarking,
  Horse,
  RealStallionRecord,
} from '../../src/engine/types';

/** M3-C6a 털색: 생성·유전·실명 종마 반영·표시 문구 */

const COLOURS: readonly CoatColour[] = ['bay', 'brown', 'black', 'chestnut', 'grey', 'roan'];
const FACES: readonly FaceMarking[] = ['none', 'star', 'snip', 'stripe', 'blaze'];
const N_GENERATED = 10000;
const N_FOALS = 2000;

function genes(
  extension: CoatGenes['extension'],
  agouti: CoatGenes['agouti'],
  grey: CoatGenes['grey'],
  roan: CoatGenes['roan'],
): CoatGenes {
  return { extension, agouti, grey, roan };
}

function coatOf(g: CoatGenes): Coat {
  return { genes: g, face: 'none', whiteLegs: 0 };
}

function fixtureHorse(id: string, coat: Coat): Horse {
  const base = generateHorse(createRng(`coat-fixture-${id}`), {
    id,
    name: id,
    sex: 'male',
    birthYear: 2022,
    currentYear: 2026,
    countryOfBirth: 'GB',
    status: 'in_training',
    level: 55,
  });
  return { ...base, coat };
}

function plainArgs(sire: Horse, dam: Horse, seedId: string): BreedArgs {
  return {
    sire,
    dam,
    damsireLineId: null,
    nicks: [],
    inbreeding: [],
    damFamilyScore: 0,
    id: seedId,
    name: seedId,
    birthYear: 2026,
    currentYear: 2026,
    countryOfBirth: 'GB',
    ownerId: null,
    breederId: null,
  };
}

describe('같은 시드 → 같은 털색', () => {
  it('generateHorse 는 같은 시드에서 같은 털색을 낸다', () => {
    const opts = {
      id: 'x',
      name: 'x',
      sex: 'male' as const,
      birthYear: 2024,
      currentYear: 2026,
      countryOfBirth: 'GB' as const,
      status: 'in_training' as const,
      level: 55,
    };
    const a = generateHorse(createRng('coat-seed-1'), opts);
    const b = generateHorse(createRng('coat-seed-1'), opts);
    expect(a.coat).toEqual(b.coat);
  });

  it('breed 는 같은 시드에서 같은 털색을 낸다', () => {
    const sire = fixtureHorse('sire', coatFromColour('chestnut', createRng('s')));
    const dam = fixtureHorse('dam', coatFromColour('bay', createRng('d')));
    const a = breed(createRng('coat-breed-1'), plainArgs(sire, dam, 'foal'));
    const b = breed(createRng('coat-breed-1'), plainArgs(sire, dam, 'foal'));
    expect(a.coat).toEqual(b.coat);
  });

  it('createRealStallionHorses 는 같은 시드에서 같은 털색을 낸다', () => {
    const records = getStallionRecords();
    const names = getStallionNames();
    const a = createRealStallionHorses(createRng(20260101), records, names, 2026);
    const b = createRealStallionHorses(createRng(20260101), records, names, 2026);
    expect(a.horses.map((h) => h.coat)).toEqual(b.horses.map((h) => h.coat));
  });
});

describe('무작위 생성 털색 비율', () => {
  it(`무작위 생성 ${N_GENERATED}두의 표시 털색 비율이 명세 범위 안이다`, () => {
    const rng = createRng('coat-distribution');
    const counts: Record<CoatColour, number> = { bay: 0, brown: 0, black: 0, chestnut: 0, grey: 0, roan: 0 };
    for (let i = 0; i < N_GENERATED; i++) {
      const h = generateHorse(rng, {
        id: `g${i}`,
        name: `g${i}`,
        sex: 'male',
        birthYear: 2024,
        currentYear: 2026,
        countryOfBirth: 'GB',
        status: 'in_training',
        level: 55,
      });
      counts[coatColour(h.coat.genes)] += 1;
    }
    const ratio = (c: CoatColour): number => counts[c] / N_GENERATED;
    expect(ratio('bay')).toBeGreaterThanOrEqual(0.42);
    expect(ratio('bay')).toBeLessThanOrEqual(0.56);
    expect(ratio('chestnut')).toBeGreaterThanOrEqual(0.12);
    expect(ratio('chestnut')).toBeLessThanOrEqual(0.2);
    expect(ratio('brown')).toBeGreaterThanOrEqual(0.1);
    expect(ratio('brown')).toBeLessThanOrEqual(0.2);
    expect(ratio('grey')).toBeGreaterThanOrEqual(0.05);
    expect(ratio('grey')).toBeLessThanOrEqual(0.11);
    expect(ratio('black')).toBeGreaterThanOrEqual(0.02);
    expect(ratio('black')).toBeLessThanOrEqual(0.07);
    expect(ratio('roan')).toBeLessThanOrEqual(0.02);
  });

  it('generateCoat 의 반점·양말 값은 허용 범위 안이다', () => {
    const rng = createRng('coat-markings');
    for (let i = 0; i < 500; i++) {
      const c = generateCoat(rng);
      expect(FACES).toContain(c.face);
      expect(c.whiteLegs).toBeGreaterThanOrEqual(0);
      expect(c.whiteLegs).toBeLessThanOrEqual(4);
    }
  });
});

describe('유전', () => {
  it('밤색 × 밤색 → 망아지 100% 밤색', () => {
    const rng = createRng('chestnut-pairs');
    const sire = fixtureHorse('cs', coatFromColour('chestnut', rng));
    const dam = fixtureHorse('cd', coatFromColour('chestnut', rng));
    for (let i = 0; i < N_FOALS; i++) {
      const foal = inheritCoat(createRng(`cc-${i}`), sire.coat, dam.coat);
      expect(coatColour(foal.genes)).toBe('chestnut');
    }
  });

  it('회색(Gg) × 비회색 → 망아지 회색 비율 0.45~0.55', () => {
    const sire = fixtureHorse('gs', coatOf(genes(['E', 'e'], ['A', 'a'], ['G', 'g'], ['rn', 'rn'])));
    const dam = fixtureHorse('gd', coatOf(genes(['E', 'e'], ['At', 'a'], ['g', 'g'], ['rn', 'rn'])));
    let grey = 0;
    for (let i = 0; i < N_FOALS; i++) {
      const foal = inheritCoat(createRng(`grey-${i}`), sire.coat, dam.coat);
      if (coatColour(foal.genes) === 'grey') grey += 1;
    }
    const ratio = grey / N_FOALS;
    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio).toBeLessThanOrEqual(0.55);
  });

  it('RnRn 망아지는 한 마리도 없다', () => {
    const sire = fixtureHorse('rs', coatOf(genes(['E', 'E'], ['A', 'A'], ['g', 'g'], ['Rn', 'rn'])));
    const dam = fixtureHorse('rd', coatOf(genes(['E', 'E'], ['A', 'A'], ['g', 'g'], ['Rn', 'rn'])));
    let rnRn = 0;
    for (let i = 0; i < N_FOALS; i++) {
      const foal = inheritCoat(createRng(`roan-${i}`), sire.coat, dam.coat);
      if (foal.genes.roan[0] === 'Rn' && foal.genes.roan[1] === 'Rn') rnRn += 1;
    }
    expect(rnRn).toBe(0);
  });
});

describe('coatFromColour', () => {
  for (const colour of [...COLOURS, undefined]) {
    it(`입력 ${colour ?? 'undefined'} 200회: coatColour 결과가 입력과 100% 일치(undefined 는 bay)`, () => {
      const rng = createRng(`from-${colour ?? 'none'}`);
      const expected = colour ?? 'bay';
      for (let i = 0; i < 200; i++) {
        const c = coatFromColour(colour, rng);
        expect(coatColour(c.genes)).toBe(expected);
      }
    });
  }
});

describe('실명 종마 털색', () => {
  const syntheticRecords: RealStallionRecord[] = [...COLOURS, undefined].map((colour, i) => {
    const key = `stl_coat_test_${i}`;
    return {
      key,
      foaled: 2008,
      countryOfBirth: 'GB',
      sireKey: null,
      damsireKey: null,
      sireLineId: 'line_coat_test',
      status: 'active',
      standsIn: 'GB',
      distanceProfile: 'classic',
      surfaceProfile: 'turf',
      marketTier: 3,
      confidence: 'high',
      ...(colour === undefined ? {} : { coatColour: colour }),
    };
  });
  const syntheticNames: Record<string, string> = Object.fromEntries(
    syntheticRecords.map((r, i) => [r.key, `Test Horse ${i}`]),
  );

  it('데이터 coatColour 와 같은 털색의 Horse 를 만든다(undefined 는 bay)', () => {
    const { horses } = createRealStallionHorses(createRng(7), syntheticRecords, syntheticNames, 2026);
    const byId = new Map(horses.map((h) => [h.id, h] as const));
    for (const rec of syntheticRecords) {
      const horse = byId.get(rec.key);
      expect(horse).toBeDefined();
      if (horse === undefined) continue;
      expect(coatColour(horse.coat.genes)).toBe(rec.coatColour ?? 'bay');
    }
  });

  it('실제 데이터의 종마도, 털색 값이 있으면 같은 털색이다(없으면 bay)', () => {
    const records = getStallionRecords();
    const names = getStallionNames();
    const { horses } = createRealStallionHorses(createRng(20260101), records, names, 2026);
    const byId = new Map(horses.map((h) => [h.id, h] as const));
    for (const rec of records) {
      const horse = byId.get(rec.key);
      expect(horse).toBeDefined();
      if (horse === undefined) continue;
      expect(coatColour(horse.coat.genes)).toBe(rec.coatColour ?? 'bay');
    }
  });
});

describe('회색 밝기', () => {
  it('출생 시 0.1, 매년 +0.12, 최대 1', () => {
    expect(greyLightness(2020, 2020)).toBeCloseTo(0.1, 10);
    expect(greyLightness(2020, 2026)).toBeCloseTo(0.82, 10);
    expect(greyLightness(2020, 2040)).toBe(1);
  });
});

describe('표시 문구 (UI)', () => {
  it('coatColourKo 와 faceMarkingKo 는 모든 값에 비어 있지 않은 문구를 낸다', () => {
    const colourTexts = COLOURS.map((c) => coatColourKo(c));
    for (const text of colourTexts) {
      expect(text.length).toBeGreaterThan(0);
    }
    expect(new Set(colourTexts).size).toBe(COLOURS.length);
    for (const f of FACES) {
      expect(faceMarkingKo(f).length).toBeGreaterThan(0);
    }
    expect(coatColourKo('bay')).toBe('갈색(베이)');
    expect(coatColourKo('chestnut')).toBe('밤색');
    expect(faceMarkingKo('none')).toBe('없음');
  });
});
