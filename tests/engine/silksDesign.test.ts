import { beforeAll, describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { SAVE_SCHEMA_VERSION } from '../../src/engine/config/game';
import {
  discPatternOf, MAX_SILKS_LAYERS, setPlayerSilks, SILKS_BODY_PATTERNS,
  SILKS_CAP_PATTERNS, SILKS_SLEEVE_PATTERNS, silksDesignOf, silksFromDesign, validateSilksDesign,
} from '../../src/engine/people/silks';
import { serializeGame, deserializeGame } from '../../src/engine/save/serialize';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { createNewGame } from '../../src/engine/state/newGame';
import type { GameState, Silks, SilksBodyPattern, SilksDesign, SilksPattern } from '../../src/engine/types';

const LEGACY: Silks = { primary: '#123456', secondary: '#abcdef', pattern: 'hoops' };
const design = (): SilksDesign => ({
  body: { base: '#123456', layers: [{ pattern: 'sash', colour: '#ffffff' }, { pattern: 'star', colour: '#aa0000' }] },
  sleeves: { base: '#abcdef', layers: [{ pattern: 'cuffs', colour: '#ffffff' }] },
  cap: { base: '#123456', layers: [{ pattern: 'pompon', colour: '#ffffff' }] },
});
const BOOT_DATA = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
let world: GameState;
beforeAll(() => { world = bootstrapGame({ seed: 20261011, playerName: '가상 마주', silks: LEGACY }, BOOT_DATA); });

describe('기존 승부복의 도안 유도', () => {
  it('저장 도안이 있으면 참조를 그대로 돌려준다', () => {
    const stored = silksFromDesign(design());
    expect(silksDesignOf(stored, 'any')).toBe(stored.design);
  });
  it('기존 원판 8종의 첫 층과 바탕색을 보존하고 plain 은 몸통 층을 넣지 않는다', () => {
    const mapping: Record<SilksPattern, SilksBodyPattern> = {
      plain: 'plain', hoops: 'hoops', stripes: 'stripes', quartered: 'quartered',
      sash: 'sash', chevrons: 'chevrons', spots: 'small_spots', star: 'star',
    };
    for (const pattern of Object.keys(mapping) as SilksPattern[]) {
      for (let key = 0; key < 100; key++) {
        const input = { ...LEGACY, pattern };
        const before = structuredClone(input);
        const a = silksDesignOf(input, String(key));
        expect(a).toEqual(silksDesignOf(input, String(key)));
        expect(a.body.base).toBe(LEGACY.primary);
        expect(a.body.layers[0]).toEqual(pattern === 'plain' ? undefined : { pattern: mapping[pattern], colour: LEGACY.secondary });
        expect(validateSilksDesign(a)).toBeNull();
        expect(input).toEqual(before);
      }
    }
  });
  it('시드 20261011 새 게임 AI 장식 비율이 15~35% 이고 세계와 rng 가 불변이다', () => {
    const before = structuredClone(world);
    const owners = Object.values(world.owners).filter((owner) => !owner.isPlayer);
    let decorated = 0;
    for (const owner of owners) {
      const d = silksDesignOf(owner.silks, owner.id);
      expect(d).toEqual(silksDesignOf(owner.silks, owner.id));
      if (d.body.layers.length === MAX_SILKS_LAYERS || d.sleeves.layers.length > 0 || d.cap.layers.length > 0) decorated++;
    }
    const ratio = decorated / owners.length;
    console.log(`[M4-E0a] AI 장식 ${decorated}/${owners.length} = ${(ratio * 100).toFixed(2)}%`);
    expect(ratio).toBeGreaterThanOrEqual(.15);
    expect(ratio).toBeLessThanOrEqual(.35);
    expect(world).toEqual(before);
  });
});

describe('도안 축약·검증', () => {
  it('29종 모두 명세의 원판 축약표와 일치하며 첫 층만 쓴다', () => {
    const groups: [SilksPattern, SilksBodyPattern[]][] = [
      ['hoops', ['hoop', 'hoops']], ['stripes', ['stripes', 'braces', 'seams']],
      ['sash', ['sash', 'cross_belts']], ['chevrons', ['chevron', 'chevrons']],
      ['quartered', ['quartered', 'halves_vertical', 'halves_horizontal', 'check']],
      ['spots', ['large_spots', 'small_spots', 'disc']], ['star', ['star', 'stars']],
    ];
    for (const pattern of SILKS_BODY_PATTERNS) {
      const d = design();
      d.body.layers[0]!.pattern = pattern;
      const expected = groups.find(([, patterns]) => patterns.includes(pattern))?.[0] ?? 'plain';
      expect(discPatternOf(d)).toBe(expected);
      expect(silksFromDesign(d)).toMatchObject({ primary: d.body.base, secondary: '#ffffff', pattern: expected });
    }
    const d = design();
    d.body.layers = [];
    expect(silksFromDesign(d)).toMatchObject({ pattern: 'plain', secondary: d.sleeves.base });
  });
  it('각 부분의 0~2층·모든 무늬를 허용한다', () => {
    for (const [part, patterns] of [ ['body', SILKS_BODY_PATTERNS], ['sleeves', SILKS_SLEEVE_PATTERNS], ['cap', SILKS_CAP_PATTERNS] ] as const) {
      for (const pattern of patterns) {
        const d = { ...design(), [part]: { base: '#ffffff', layers: [{ pattern, colour: '#123456' }] } };
        expect(validateSilksDesign(d as SilksDesign)).toBeNull();
      }
      const d = design();
      d[part].layers = [];
      expect(validateSilksDesign(d)).toBeNull();
    }
  });
  it('부분마다 층 3개·대문자/잘못된 색·다른 부분 무늬를 거른다', () => {
    for (const part of ['body', 'sleeves', 'cap'] as const) {
      const d = design();
      d[part].layers = Array.from({ length: 3 }, () => ({ pattern: 'plain', colour: '#123456' }));
      expect(validateSilksDesign(d)).toBe('too_many_layers');
      for (const colour of ['#ABCDEF', '#fff', 'red', '#12345g']) {
        const invalid = design();
        invalid[part].base = colour;
        expect(validateSilksDesign(invalid)).toBe('invalid_colour');
        const invalidLayer = design();
        invalidLayer[part].layers[0]!.colour = colour;
        expect(validateSilksDesign(invalidLayer)).toBe('invalid_colour');
      }
      const invalid = design();
      (invalid[part].layers[0] as { pattern: string }).pattern = 'unknown';
      expect(validateSilksDesign(invalid)).toBe('invalid_pattern');
    }
  });
});

describe('플레이어 변경과 저장', () => {
  it('플레이어만 바꾸고 원본·기존 레이스 스냅샷은 보존하며 입력 참조를 복사한다', () => {
    const state = structuredClone(world);
    // 실제 출주 요청 스냅샷을 넣어 상태를 갱신해도 기존 도안 참조가 보존되는지 확인한다.
    const meeting = state.seasonState.meetings[0]!;
    const race = meeting.races[0]!;
    const horse = Object.values(state.horses).find((h) => h.status === 'in_training')!;
    const jockey = Object.values(state.jockeys)[0]!;
    const oldSilks = silksFromDesign(design());
    state.owners[state.playerOwnerId]!.silks = oldSilks;
    state.seasonState.replayable.push({
      meetingId: meeting.id, race: race.race, going: 'good', date: state.date, seed: 7,
      field: { runners: [{ horse, jockey }], requests: [{ horseId: horse.id, jockeyId: jockey.id,
        weightLb: 126, jockeyAllowanceLb: 0, tactic: 'midfield', silks: oldSilks, isPlayer: true }], ownerNames: ['가상 마주'] },
    });
    const before = structuredClone(state);
    const d = design(); d.body.base = '#ff0000';
    const changed = setPlayerSilks(state, d);
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(state).toEqual(before);
    expect(changed.state.rng).toBe(state.rng);
    expect(changed.state.seasonState).toBe(state.seasonState);
    expect(changed.state.raceResults).toBe(state.raceResults);
    expect(changed.state.seasonState.replayable[0]!.field.requests[0]!.silks).toEqual(oldSilks);
    for (const owner of Object.values(state.owners).filter((o) => !o.isPlayer)) {
      expect(changed.state.owners[owner.id]).toBe(owner);
    }
    const actual = changed.state.owners[state.playerOwnerId]!.silks;
    expect(actual).toEqual(silksFromDesign(d));
    d.body.layers[0]!.colour = '#000000';
    d.sleeves.base = '#000000';
    d.cap.layers.pop();
    expect(actual.design!.body.layers[0]!.colour).toBe('#ffffff');
    expect(actual.design!.sleeves.base).toBe('#abcdef');
    expect(actual.design!.cap.layers).toHaveLength(1);
  });
  it('잘못된 도안은 상태 변경 없이 거부한다', () => {
    const d = design(); d.body.base = '#FFFFFF';
    const before = structuredClone(world);
    expect(setPlayerSilks(world, d)).toEqual({ ok: false, error: 'invalid_colour' });
    expect(world).toEqual(before);
  });
  it('새 게임 도안은 세 부분 모두 깊은 복사되며 저장·불러오기 후 같고 저장 버전이 그대로다', () => {
    const d = design();
    const silks = silksFromDesign(d);
    const state = bootstrapGame({ seed: 20261011, playerName: '가상 마주', silks }, BOOT_DATA);
    const savedDesign = state.owners[state.playerOwnerId]!.silks.design!;
    expect(savedDesign).toEqual(d);
    for (const part of ['body', 'sleeves', 'cap'] as const) {
      expect(savedDesign[part]).not.toBe(silks.design![part]);
      expect(savedDesign[part].layers).not.toBe(silks.design![part].layers);
      expect(savedDesign[part].layers[0]).not.toBe(silks.design![part].layers[0]);
      silks.design![part].base = '#000000';
      silks.design![part].layers[0]!.colour = '#000000';
    }
    expect(savedDesign).toEqual(d);
    const loaded = deserializeGame(serializeGame(state, '2026-10-16T00:00:00.000Z'));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(loaded.state.owners[state.playerOwnerId]!.silks.design).toEqual(d);
    }
    expect(createNewGame({ seed: 7, playerName: '가상 마주', silks: LEGACY }).owners['owner-player']!.silks).toEqual(LEGACY);
  });
});
