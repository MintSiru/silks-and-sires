import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_IDS,
  OR_BAND_THRESHOLDS,
  orBandKo,
  orValueKo,
} from '../../src/ui/common/glossary';
import { Term } from '../../src/ui/common/Term';

describe('orBandKo 경계값', () => {
  it('110 이상은 G1급이다', () => {
    expect(orBandKo(OR_BAND_THRESHOLDS.g1)).toBe('G1급');
    expect(orBandKo(110)).toBe('G1급');
    expect(orBandKo(120)).toBe('G1급');
  });

  it('109 는 그룹급, 100 이상도 그룹급이다', () => {
    expect(orBandKo(109)).toBe('그룹급');
    expect(orBandKo(100)).toBe('그룹급');
  });

  it('99 는 상위권, 85 이상도 상위권이다', () => {
    expect(orBandKo(99)).toBe('상위권');
    expect(orBandKo(95)).toBe('상위권');
    expect(orBandKo(85)).toBe('상위권');
  });

  it('84 는 중위권, 70 이상도 중위권이다', () => {
    expect(orBandKo(84)).toBe('중위권');
    expect(orBandKo(70)).toBe('중위권');
  });

  it('69 이하는 하위권이다', () => {
    expect(orBandKo(69)).toBe('하위권');
    expect(orBandKo(0)).toBe('하위권');
  });

  it('경계 상수는 110 / 100 / 85 / 70 이다', () => {
    expect(OR_BAND_THRESHOLDS).toEqual({ g1: 110, group: 100, top: 85, mid: 70 });
  });
});

describe('orValueKo 표기', () => {
  it('값과 띠를 괄호로 함께 적는다', () => {
    expect(orValueKo(95)).toBe('95 (상위권)');
    expect(orValueKo(112)).toBe('112 (G1급)');
  });

  it('레이팅이 없으면 미부여다', () => {
    expect(orValueKo(null)).toBe('미부여');
  });
});

describe('용어 사전', () => {
  it('요구한 용어 11개가 모두 있다', () => {
    expect([...GLOSSARY_IDS]).toEqual([
      'or',
      'nick',
      'inbreeding',
      'black_type',
      'group',
      'listed',
      'handicap',
      'furlong',
      'going',
      'draw',
      'stud_fee',
    ]);
  });

  it('모든 항목에 표기와 한 줄 풀이가 있다', () => {
    for (const id of GLOSSARY_IDS) {
      const entry = GLOSSARY[id];
      expect(entry.term.trim().length, id).toBeGreaterThan(0);
      expect(entry.gloss.trim().length, id).toBeGreaterThan(0);
      expect(entry.gloss.includes('\n'), id).toBe(false);
    }
  });

  it('OR 항목은 공식 레이팅 풀이를 가진다', () => {
    expect(GLOSSARY.or.term).toBe('OR');
    expect(GLOSSARY.or.gloss).toContain('공식 레이팅');
  });
});

describe('Term 렌더', () => {
  const html = renderToStaticMarkup(createElement(Term, { id: 'or', children: 'OR' }));

  it('점선 밑줄 클래스 term 을 붙인다', () => {
    expect(html).toContain('class="term"');
    expect(html).toContain('data-term="or"');
  });

  it('키보드로 포커스할 수 있다(tabIndex 0)', () => {
    expect(html).toContain('tabindex="0"');
  });

  it('숨김 문구에 한 줄 풀이를 넣고, 말풍선과 겹치는 title 은 두지 않는다', () => {
    expect(html).not.toContain('title=');
    expect(html).toContain(GLOSSARY.or.gloss);
  });

  it('aria-describedby 가 가리키는 요소가 풀이를 담는다', () => {
    const match = /aria-describedby="([^"]+)"/.exec(html);
    expect(match).not.toBeNull();
    const id = match?.[1] ?? '';
    const idx = html.indexOf(`id="${id}"`);
    expect(idx).toBeGreaterThan(-1);
    expect(html.slice(idx)).toContain(GLOSSARY.or.gloss);
  });

  it('children 으로 받은 글자를 그대로 보여준다', () => {
    expect(html.startsWith('<span')).toBe(true);
    expect(html).toContain('>OR<');
  });
});
