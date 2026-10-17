import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  gradeBadgeClass,
  gradeTone,
  positionBadgeClass,
  positionLabel,
  positionTone,
  statusBadgeClass,
  statusTone,
} from '../../src/ui/common/badges';
import { GradeBadge, PositionBadge, StatusBadge } from '../../src/ui/common/Badge';

describe('gradeTone', () => {
  it('G1 과 S 는 최상위(금)다', () => {
    expect(gradeTone('G1')).toBe('top');
    expect(gradeTone('S')).toBe('top');
  });

  it('G2 와 A 는 상위(청)다', () => {
    expect(gradeTone('G2')).toBe('high');
    expect(gradeTone('A')).toBe('high');
  });

  it('G3, L, B 는 중위(녹)다', () => {
    expect(gradeTone('G3')).toBe('mid');
    expect(gradeTone('L')).toBe('mid');
    expect(gradeTone('B')).toBe('mid');
  });

  it('그 밖의 등급(C, D, 알 수 없는 값)은 회색이다', () => {
    expect(gradeTone('C')).toBe('low');
    expect(gradeTone('D')).toBe('low');
    expect(gradeTone('')).toBe('low');
    expect(gradeTone('Z9')).toBe('low');
  });

  it('소문자와 앞뒤 공백도 같은 등급으로 본다', () => {
    expect(gradeTone(' g1 ')).toBe('top');
  });
});

describe('positionTone', () => {
  it('1착은 금이다', () => {
    expect(positionTone(1)).toBe('top');
  });

  it('2~3착은 청이다', () => {
    expect(positionTone(2)).toBe('high');
    expect(positionTone(3)).toBe('high');
  });

  it('4착 이하와 결과 없음(null)은 회색이다', () => {
    expect(positionTone(4)).toBe('low');
    expect(positionTone(11)).toBe('low');
    expect(positionTone(null)).toBe('low');
  });
});

describe('statusTone', () => {
  it('기존 상태 칩 톤을 배지 톤으로 옮긴다', () => {
    expect(statusTone('good')).toBe('good');
    expect(statusTone('caution')).toBe('warn');
    expect(statusTone('danger')).toBe('danger');
    expect(statusTone('plain')).toBe('muted');
  });
});

describe('클래스 이름', () => {
  it('등급 배지는 기본 badge 와 등급 톤 클래스를 함께 쓴다', () => {
    expect(gradeBadgeClass('G1')).toBe('badge badge--grade-top');
    expect(gradeBadgeClass('C')).toBe('badge badge--grade-low');
  });

  it('착순 배지는 1착 금, 2~3착 청, 그 밖 회색 클래스를 쓴다', () => {
    expect(positionBadgeClass(1)).toBe('badge badge--grade-top');
    expect(positionBadgeClass(2)).toBe('badge badge--grade-high');
    expect(positionBadgeClass(null)).toBe('badge badge--grade-low');
  });

  it('상태 배지는 톤 이름을 클래스에 그대로 붙인다', () => {
    expect(statusBadgeClass('good')).toBe('badge badge--good');
    expect(statusBadgeClass('warn')).toBe('badge badge--warn');
    expect(statusBadgeClass('danger')).toBe('badge badge--danger');
    expect(statusBadgeClass('muted')).toBe('badge badge--muted');
  });
});

describe('positionLabel', () => {
  it('착순과 출주 두수를 "5착/11" 형식으로 쓴다', () => {
    expect(positionLabel(5, 11)).toBe('5착/11');
    expect(positionLabel(1)).toBe('1착');
    expect(positionLabel(null)).toBe('결과 없음');
  });
});

describe('배지 컴포넌트 렌더링', () => {
  it('GradeBadge 는 등급 글자와 톤 클래스를 낸다', () => {
    const html = renderToStaticMarkup(createElement(GradeBadge, { grade: 'G2' }));
    expect(html).toBe('<span class="badge badge--grade-high">G2</span>');
  });

  it('PositionBadge 는 문구를 글자로 낸다(색만으로 전달하지 않는다)', () => {
    const html = renderToStaticMarkup(
      createElement(PositionBadge, { position: 1, fieldSize: 11 }),
    );
    expect(html).toBe('<span class="badge badge--grade-top">1착/11</span>');
  });

  it('StatusBadge 는 전달된 문구를 그대로 낸다', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBadge, { tone: 'danger', label: '부상' }),
    );
    expect(html).toBe('<span class="badge badge--danger">부상</span>');
  });
});
