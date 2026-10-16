import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deserializeGame } from '../../src/engine/save/serialize';
import { silksFromDesign } from '../../src/engine/people/silks';
import { useGame, type GameApi } from '../../src/ui/game/useGame';
import { createIndexedDbSaveStore } from '../../src/ui/storage/saveStore';
import { SILKS_BODY_PATTERNS, SILKS_CAP_PATTERNS, SILKS_SLEEVE_PATTERNS } from '../../src/engine/people/silks';
import type { SilksDesign } from '../../src/engine/types';
import SilksSvg from '../../src/ui/silks/SilksSvg';
import SilksEditor from '../../src/ui/silks/SilksEditor';
import { BODY_PATTERN_KO, CAP_PATTERN_KO, SLEEVE_PATTERN_KO } from '../../src/ui/silks/silksText';

function design(): SilksDesign {
  return { body: { base: '#123456', layers: [] }, sleeves: { base: '#abcdef', layers: [] }, cap: { base: '#ffffff', layers: [] } };
}
const render = (d: SilksDesign): string => renderToStaticMarkup(createElement(SilksSvg, { design: d, size: 200 }));

describe('도안 SVG', () => {
  it('54종 무늬 모두 SVG 요소를 생성하며 한국어 이름이 있다', () => {
    let count = 0;
    for (const [part, patterns, labels] of [
      ['body', SILKS_BODY_PATTERNS, BODY_PATTERN_KO],
      ['sleeves', SILKS_SLEEVE_PATTERNS, SLEEVE_PATTERN_KO],
      ['cap', SILKS_CAP_PATTERNS, CAP_PATTERN_KO],
    ] as const) {
      for (const pattern of patterns) {
        const d = { ...design(), [part]: { base: '#123456', layers: [{ pattern, colour: '#abcdef' }] } } as SilksDesign;
        const svg = render(d);
        expect(svg).toContain('<svg');
        expect(svg).toContain(`data-pattern="${pattern}"`);
        expect(svg).not.toMatch(/undefined|NaN/);
        expect((labels as Record<string, string>)[pattern]).toBeTruthy();
        count++;
      }
    }
    expect(count).toBe(54);
  });
  it('각 부분에 바탕 → 층1 → 층2 순서와 클립을 적용한다', () => {
    const d = design();
    for (const part of ['body', 'sleeves', 'cap'] as const) {
      d[part].layers = [{ pattern: 'plain', colour: '#aabbcc' }, { pattern: 'plain', colour: '#ddeeff' }];
    }
    const svg = render(d);
    const parts = svg.split(/<g data-part=/).slice(1);
    expect(parts).toHaveLength(4);
    for (const part of parts) {
      expect(part).toContain('<clipPath');
      expect(part).toContain('clip-path="url(#');
      const positions = ['data-layer="base"', 'data-layer="1"', 'data-layer="2"'].map((marker) => part.indexOf(marker));
      expect(positions[0]).toBeGreaterThan(0);
      expect(positions[1]).toBeGreaterThan(positions[0]!);
      expect(positions[2]).toBeGreaterThan(positions[1]!);
      expect(part).toContain('fill="#aabbcc"');
      expect(part).toContain('fill="#ddeeff"');
    }
  });
  it('여러 미리보기의 클립 ID가 충돌하지 않는다', () => {
    const svg = renderToStaticMarkup(createElement('div', null,
      createElement(SilksSvg, { design: design(), size: 40 }), createElement(SilksSvg, { design: design(), size: 40 })));
    const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });
  it('렌더링이 입력 도안을 변경하지 않는다', () => {
    const d = design(); const before = structuredClone(d);
    render(d);
    expect(d).toEqual(before);
  });
  it('편집기에는 세 부분 선택·팔레트·자유 색·층 편집·무작위가 있다', () => {
    const d = design();
    d.body.layers = [{ pattern: 'sash', colour: '#ff0000' }, { pattern: 'star', colour: '#ffffff' }];
    const svg = renderToStaticMarkup(createElement(SilksEditor, { design: d, onChange: () => {} }));
    for (const text of ['몸통', '소매', '모자', '바탕색', '직접 입력', '팔레트', '층 1 삭제', '층 2 삭제', '무작위']) expect(svg).toContain(text);
    expect(svg).toContain('disabled=""');
    expect(svg).toContain('층 추가 (2/2)');
  });
});

// SSR 로 훅 API 를 얻은 뒤 ref 를 통한 갱신과 IndexedDB 저장을 검증한다.
function captureGame(): GameApi {
  let api: GameApi | undefined;
  function Capture() { api = useGame(); return null; }
  renderToStaticMarkup(createElement(Capture));
  return api!;
}

it('useGame 이 선택 도안으로 시작하고 승부복 변경을 저장·불러오기 한다', async () => {
  const api = captureGame();
  const d = design();
  d.body.layers = [{ pattern: 'sash', colour: '#ffffff' }];
  api.newGame({ seed: 20261011, playerName: '가상 마주', silks: silksFromDesign(d),
    economyMode: 'casual', startType: 'owner', difficulty: 'normal', homeCountry: 'GB',
    catastrophicInjuries: true, grantRacehorses: true });
  const store = createIndexedDbSaveStore();
  const savedDesign = async (): Promise<SilksDesign> => {
    const json = await store.load('autosave');
    expect(json).not.toBeNull();
    const loaded = deserializeGame(json!);
    if (!loaded.ok) throw new Error(loaded.error.message);
    return loaded.state.owners[loaded.state.playerOwnerId]!.silks.design!;
  };
  await api.save();
  expect(await savedDesign()).toEqual(d);
  const changed = structuredClone(d);
  changed.body.base = '#ff5500';
  const result = await api.setSilks(changed);
  expect(result.ok).toBe(true);
  expect(await savedDesign()).toEqual(changed);
  const second = captureGame();
  expect(await second.load()).toBe(true);
  await second.save();
  expect(await savedDesign()).toEqual(changed);
  const invalid = structuredClone(changed);
  invalid.cap.base = '#FFFFFF';
  expect(await second.setSilks(invalid)).toEqual({ ok: false, error: 'invalid_colour' });
  expect(await savedDesign()).toEqual(changed);
});
