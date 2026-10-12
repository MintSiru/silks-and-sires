import {
  COAT_CHESTNUT_FACE_BOOST,
  COAT_CHESTNUT_FACE_BOOST_FACES,
  COAT_CHESTNUT_SOCK_BOOST,
  COAT_DEFAULT_COLOUR,
  COAT_FACE_WEIGHTS,
  COAT_FREQ_AGOUTI,
  COAT_FREQ_EXTENSION,
  COAT_FREQ_GREY,
  COAT_FREQ_ROAN,
  COAT_GREY_BIRTH_LIGHTNESS,
  COAT_GREY_LIGHTNESS_MAX,
  COAT_GREY_LIGHTNESS_PER_YEAR,
  COAT_MARKING_INHERIT_P,
  COAT_SOCK_WEIGHTS,
} from '../config/coat';
import type {
  AgoutiAllele,
  Coat,
  CoatColour,
  CoatGenes,
  ExtensionAllele,
  FaceMarking,
  GreyAllele,
  RoanAllele,
  Rng,
} from '../types';

/** 가중치 항목 [값, 가중치] */
type Weighted<T> = readonly [T, number];

/** 얼굴 반점 후보 순서(결정적 추첨을 위해 고정) */
const FACE_ORDER: readonly FaceMarking[] = ['none', 'star', 'snip', 'stripe', 'blaze'];

/** 가중치에 따라 하나를 고른다. 합계로 나누므로 가중치 합이 1 이 아니어도 된다. 난수 1회 소비. */
function pickWeighted<T>(rng: Rng, items: readonly Weighted<T>[]): T {
  if (items.length === 0) {
    throw new RangeError('pickWeighted: 후보가 없다');
  }
  let total = 0;
  for (const [, w] of items) {
    total += w;
  }
  const u = rng.next() * total;
  let acc = 0;
  for (const [value, w] of items) {
    acc += w;
    if (u < acc) return value;
  }
  return (items[items.length - 1] as Weighted<T>)[0];
}

/**
 * 좌위 대립유전자 쌍을 빈도의 곱으로 추첨한다(순서 있는 쌍 전체가 후보). allowed 로 조건부 추첨도 한다.
 * 난수 1회 소비.
 */
function pickPair<T extends string>(
  rng: Rng,
  freq: Record<T, number>,
  allowed: (a: T, b: T) => boolean = () => true,
): [T, T] {
  const alleles = Object.keys(freq) as T[];
  const options: Weighted<[T, T]>[] = [];
  for (const a of alleles) {
    for (const b of alleles) {
      if (allowed(a, b)) {
        options.push([[a, b], freq[a] * freq[b]]);
      }
    }
  }
  return pickWeighted(rng, options);
}

/** RnRn 은 만들지 않는다. 두 개 모두 Rn 이면 한쪽을 rn 으로 바꾼다. */
function fixRoan(pair: [RoanAllele, RoanAllele]): [RoanAllele, RoanAllele] {
  return pair[0] === 'Rn' && pair[1] === 'Rn' ? ['Rn', 'rn'] : pair;
}

/** 부·모 쌍에서 좌위마다 한 개씩 무작위로 물려받는다(부 쪽 한 개, 모 쪽 한 개). 난수 2회 소비. */
function inheritPair<T extends string>(rng: Rng, sirePair: readonly [T, T], damPair: readonly [T, T]): [T, T] {
  const fromSire = sirePair[rng.int(0, 1)] as T;
  const fromDam = damPair[rng.int(0, 1)] as T;
  return [fromSire, fromDam];
}

/** 반점 값: 확률 COAT_MARKING_INHERIT_P 로 부 또는 모 한쪽 값을 그대로 쓰고, 아니면 fresh() 로 새로 추첨 */
function inheritMarking<T>(rng: Rng, sireValue: T, damValue: T, fresh: () => T): T {
  if (rng.chance(COAT_MARKING_INHERIT_P)) {
    return rng.int(0, 1) === 0 ? sireValue : damValue;
  }
  return fresh();
}

/** 털색별 얼굴 반점 가중치. 밤색(chestnut)이면 지정 반점에 COAT_CHESTNUT_FACE_BOOST 를 곱한다 */
function faceWeightsFor(colour: CoatColour): Weighted<FaceMarking>[] {
  return FACE_ORDER.map((face): Weighted<FaceMarking> => {
    const boosted = colour === 'chestnut' && COAT_CHESTNUT_FACE_BOOST_FACES.includes(face);
    return [face, COAT_FACE_WEIGHTS[face] * (boosted ? COAT_CHESTNUT_FACE_BOOST : 1)];
  });
}

/** 털색별 얼굴 반점 추첨 */
function drawFace(rng: Rng, colour: CoatColour): FaceMarking {
  return pickWeighted(rng, faceWeightsFor(colour));
}

/** 털색별 흰 양말 다리 수 추첨. 밤색(chestnut)이면 1개 이상 가중치에 COAT_CHESTNUT_SOCK_BOOST 를 곱한다 */
function drawWhiteLegs(rng: Rng, colour: CoatColour): number {
  const items = COAT_SOCK_WEIGHTS.map((w, count): Weighted<number> => {
    const boosted = colour === 'chestnut' && count >= 1;
    return [count, boosted ? w * COAT_CHESTNUT_SOCK_BOOST : w];
  });
  return pickWeighted(rng, items);
}

/**
 * 유전자형에서 표시 털색을 정한다. 우선순위: G 하나 이상 → grey, Rn 하나 이상 → roan, ee → chestnut,
 * 그 외 Agouti 가 A 를 가지면 bay, At 를 가지면 brown, 그 외 black.
 */
export function coatColour(genes: CoatGenes): CoatColour {
  if (genes.grey.includes('G')) return 'grey';
  if (genes.roan.includes('Rn')) return 'roan';
  if (genes.extension[0] === 'e' && genes.extension[1] === 'e') return 'chestnut';
  if (genes.agouti.includes('A')) return 'bay';
  if (genes.agouti.includes('At')) return 'brown';
  return 'black';
}

/** 회색 말의 밝기 0~1. 출생 시 COAT_GREY_BIRTH_LIGHTNESS, 매년 COAT_GREY_LIGHTNESS_PER_YEAR 씩, 최대 COAT_GREY_LIGHTNESS_MAX */
export function greyLightness(birthYear: number, year: number): number {
  const age = Math.max(0, year - birthYear);
  return Math.min(COAT_GREY_LIGHTNESS_MAX, COAT_GREY_BIRTH_LIGHTNESS + COAT_GREY_LIGHTNESS_PER_YEAR * age);
}

/** 무작위 말의 털색. 대립유전자는 빈도로 추첨하고, 반점·양말도 추첨한다. */
export function generateCoat(rng: Rng): Coat {
  const extension = pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION);
  const agouti = pickPair<AgoutiAllele>(rng, COAT_FREQ_AGOUTI);
  const grey = pickPair<GreyAllele>(rng, COAT_FREQ_GREY);
  const roan = fixRoan(pickPair<RoanAllele>(rng, COAT_FREQ_ROAN));
  const genes: CoatGenes = { extension, agouti, grey, roan };
  const colour = coatColour(genes);
  const face = drawFace(rng, colour);
  const whiteLegs = drawWhiteLegs(rng, colour);
  return { genes, face, whiteLegs };
}

/**
 * 부·모의 털색으로 망아지 털색을 만든다. 좌위마다 부·모에서 대립유전자 하나씩 무작위(순서: 확장, 아구티, 회색, 조모).
 * 반점은 COAT_MARKING_INHERIT_P 로 부모 값을 물려받고, 아니면 망아지 털색 기준 가중치로 추첨한다.
 */
export function inheritCoat(rng: Rng, sire: Coat, dam: Coat): Coat {
  const extension = inheritPair<ExtensionAllele>(rng, sire.genes.extension, dam.genes.extension);
  const agouti = inheritPair<AgoutiAllele>(rng, sire.genes.agouti, dam.genes.agouti);
  const grey = inheritPair<GreyAllele>(rng, sire.genes.grey, dam.genes.grey);
  const roan = fixRoan(inheritPair<RoanAllele>(rng, sire.genes.roan, dam.genes.roan));
  const genes: CoatGenes = { extension, agouti, grey, roan };
  const colour = coatColour(genes);
  const face = inheritMarking(rng, sire.face, dam.face, () => drawFace(rng, colour));
  const whiteLegs = inheritMarking(rng, sire.whiteLegs, dam.whiteLegs, () => drawWhiteLegs(rng, colour));
  return { genes, face, whiteLegs };
}

/**
 * 실명 종마용 털색. 결과의 coatColour(genes) 는 입력 colour(undefined 면 COAT_DEFAULT_COLOUR)와 같다.
 * 색을 정하는 좌위는 조건부로 고르고, 나머지 좌위는 빈도로 추첨한다.
 * - chestnut: ee, Agouti 빈도, 회색·조모 유전자 없음(gg, rn rn)
 * - bay: E 하나 이상, A 하나 이상
 * - brown: E 하나 이상, At 하나 이상, A 없음
 * - black: E 하나 이상, aa
 * - grey: Gg, 나머지 빈도
 * - roan: Rn rn, 나머지 빈도(회색 유전자는 gg)
 */
export function coatFromColour(colour: CoatColour | undefined, rng: Rng): Coat {
  const target: CoatColour = colour ?? COAT_DEFAULT_COLOUR;
  const genes = genesFor(target, rng);
  const face = drawFace(rng, target);
  const whiteLegs = drawWhiteLegs(rng, target);
  return { genes, face, whiteLegs };
}

function genesFor(colour: CoatColour, rng: Rng): CoatGenes {
  switch (colour) {
    case 'chestnut':
      return {
        extension: ['e', 'e'],
        agouti: pickPair<AgoutiAllele>(rng, COAT_FREQ_AGOUTI),
        grey: ['g', 'g'],
        roan: ['rn', 'rn'],
      };
    case 'bay':
      return {
        extension: pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION, (a, b) => a === 'E' || b === 'E'),
        agouti: pickPair<AgoutiAllele>(rng, COAT_FREQ_AGOUTI, (a, b) => a === 'A' || b === 'A'),
        grey: ['g', 'g'],
        roan: ['rn', 'rn'],
      };
    case 'brown':
      return {
        extension: pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION, (a, b) => a === 'E' || b === 'E'),
        agouti: pickPair<AgoutiAllele>(
          rng,
          COAT_FREQ_AGOUTI,
          (a, b) => (a === 'At' || b === 'At') && a !== 'A' && b !== 'A',
        ),
        grey: ['g', 'g'],
        roan: ['rn', 'rn'],
      };
    case 'black':
      return {
        extension: pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION, (a, b) => a === 'E' || b === 'E'),
        agouti: ['a', 'a'],
        grey: ['g', 'g'],
        roan: ['rn', 'rn'],
      };
    case 'grey':
      return {
        extension: pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION),
        agouti: pickPair<AgoutiAllele>(rng, COAT_FREQ_AGOUTI),
        grey: ['G', 'g'],
        roan: fixRoan(pickPair<RoanAllele>(rng, COAT_FREQ_ROAN)),
      };
    case 'roan':
      return {
        extension: pickPair<ExtensionAllele>(rng, COAT_FREQ_EXTENSION),
        agouti: pickPair<AgoutiAllele>(rng, COAT_FREQ_AGOUTI),
        grey: ['g', 'g'],
        roan: ['Rn', 'rn'],
      };
    default:
      return assertNeverColour(colour);
  }
}

function assertNeverColour(colour: never): never {
  throw new RangeError(`genesFor: 알 수 없는 털색 ${String(colour)}`);
}
