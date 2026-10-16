import type {
  GameState, Silks, SilksBodyPattern, SilksCapPattern, SilksDesign, SilksPattern,
  SilksSleevePattern,
} from '../types';
import { fnv1a } from './generate';

export const MAX_SILKS_LAYERS = 2;
export const SILKS_BODY_PATTERNS = [
  'plain', 'hoop', 'hoops', 'stripes', 'braces', 'cross_belts', 'sash', 'diamond',
  'diamonds', 'triple_diamond', 'chevron', 'chevrons', 'epaulets', 'halves_vertical',
  'halves_horizontal', 'inverted_triangle', 'triangle', 'large_spots', 'large_spots_6', 'small_spots',
  'quartered', 'seams', 'star', 'stars', 'check', 'disc', 'cross_of_lorraine',
  'diabolo', 'collar', 'border',
] as const satisfies readonly SilksBodyPattern[];
export const SILKS_SLEEVE_PATTERNS = [
  'plain', 'hoops', 'stripes', 'armlet', 'armlets', 'chevrons', 'diamonds', 'spots',
  'stars', 'seams', 'halves', 'check', 'cuffs',
] as const satisfies readonly SilksSleevePattern[];
export const SILKS_CAP_PATTERNS = [
  'plain', 'hooped', 'striped', 'quartered', 'spots', 'star', 'stars', 'diamonds',
  'check', 'peak', 'pompon',
] as const satisfies readonly SilksCapPattern[];

export const DISC_PATTERN_BY_BODY: Readonly<Record<SilksBodyPattern, SilksPattern>> = {
  plain: 'plain', hoop: 'hoops', hoops: 'hoops', stripes: 'stripes', braces: 'stripes',
  cross_belts: 'sash', sash: 'sash', diamond: 'plain', diamonds: 'plain', triple_diamond: 'plain',
  chevron: 'chevrons', chevrons: 'chevrons', epaulets: 'plain',
  halves_vertical: 'quartered', halves_horizontal: 'quartered',
  inverted_triangle: 'plain', triangle: 'plain', large_spots: 'spots', large_spots_6: 'spots', small_spots: 'spots',
  quartered: 'quartered', seams: 'stripes', star: 'star', stars: 'star', check: 'quartered',
  disc: 'spots', cross_of_lorraine: 'plain', diabolo: 'plain', collar: 'plain', border: 'plain',
};
const BODY_PATTERN_BY_DISC: Readonly<Record<SilksPattern, SilksBodyPattern>> = {
  plain: 'plain', hoops: 'hoops', stripes: 'stripes', quartered: 'quartered', sash: 'sash',
  chevrons: 'chevrons', spots: 'small_spots', star: 'star',
};
// ID 해시의 네 묶음 중 하나만 장식을 더한다. 공용 RNG 는 소비하지 않는다.
const DECORATED_HASH_DIVISOR = 4;
const DECORATION_KINDS = 3;

export function silksDesignOf(silks: Silks, key: string): SilksDesign {
  if (silks.design !== undefined) return silks.design;
  const design: SilksDesign = {
    body: { base: silks.primary, layers: silks.pattern === 'plain' ? [] : [
      { pattern: BODY_PATTERN_BY_DISC[silks.pattern], colour: silks.secondary },
    ] },
    sleeves: { base: silks.secondary, layers: [] },
    cap: { base: silks.primary, layers: [] },
  };
  const hash = fnv1a(`${key}|silks`);
  if (hash % DECORATED_HASH_DIVISOR !== 0) return design;
  const kind = Math.floor(hash / DECORATED_HASH_DIVISOR) % DECORATION_KINDS;
  if (kind === 0 && design.body.layers.length > 0) {
    design.body.layers.push({ pattern: 'star', colour: silks.secondary });
  } else if (kind === 1) {
    design.sleeves.layers.push({ pattern: 'hoops', colour: silks.primary });
  } else {
    design.cap.layers.push({ pattern: 'quartered', colour: silks.secondary });
  }
  return design;
}

export function discPatternOf(design: SilksDesign): SilksPattern {
  const first = design.body.layers[0];
  return first === undefined ? 'plain' : DISC_PATTERN_BY_BODY[first.pattern];
}

export function silksFromDesign(design: SilksDesign): Silks {
  return {
    primary: design.body.base,
    secondary: design.body.layers[0]?.colour ?? design.sleeves.base,
    pattern: discPatternOf(design),
    design: {
      body: { base: design.body.base, layers: design.body.layers.map((layer) => ({ ...layer })) },
      sleeves: { base: design.sleeves.base, layers: design.sleeves.layers.map((layer) => ({ ...layer })) },
      cap: { base: design.cap.base, layers: design.cap.layers.map((layer) => ({ ...layer })) },
    },
  };
}

export type SilksDesignError = 'too_many_layers' | 'invalid_colour' | 'invalid_pattern';
export function validateSilksDesign(design: SilksDesign): SilksDesignError | null {
  const parts = [
    [design.body, SILKS_BODY_PATTERNS], [design.sleeves, SILKS_SLEEVE_PATTERNS],
    [design.cap, SILKS_CAP_PATTERNS],
  ] as const;
  const validColour = (value: string): boolean => /^#[0-9a-f]{6}$/.test(value);
  for (const [part, patterns] of parts) {
    if (part.layers.length > MAX_SILKS_LAYERS) return 'too_many_layers';
    if (!validColour(part.base)) return 'invalid_colour';
    for (const layer of part.layers) {
      if (!(patterns as readonly string[]).includes(layer.pattern)) return 'invalid_pattern';
      if (!validColour(layer.colour)) return 'invalid_colour';
    }
  }
  return null;
}

export function setPlayerSilks(state: GameState, design: SilksDesign):
  { ok: true; state: GameState } | { ok: false; error: SilksDesignError | 'player_not_found' } {
  const error = validateSilksDesign(design);
  if (error !== null) return { ok: false, error };
  const player = state.owners[state.playerOwnerId];
  if (player === undefined) return { ok: false, error: 'player_not_found' };
  return { ok: true, state: {
    ...state,
    owners: { ...state.owners, [player.id]: { ...player, silks: silksFromDesign(design) } },
  } };
}
