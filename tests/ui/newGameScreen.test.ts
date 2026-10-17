import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameApi } from '../../src/ui/game/useGame';
import NewGameScreen from '../../src/ui/newGame/NewGameScreen';

const render = (props: { canLoad?: boolean; onCancel?: () => void } = {}): string =>
  renderToStaticMarkup(createElement(NewGameScreen, { game: {} as GameApi, onDone: () => {}, ...props }));

describe('M6-U10 시작 화면 구성(L1·L3)', () => {
  it('기본 노출: 마주 이름·시작 유형·난이도·소재국과 추천 조건 설명', () => {
    const html = render();
    expect(html).toContain('마주 이름');
    expect(html).toContain('목장 이름');
    expect(html).toContain('소재국');
    expect(html).toContain('추천 조건으로 시작');
    expect(html).toContain('오너브리더');
    expect(html).toContain('쉬움');
    expect(html).toContain('어려움');
  });

  it('고급 설정은 접힌 상태로 시작하며 펼침 버튼이 aria-expanded 를 가진다', () => {
    const html = render();
    expect(html).toContain('고급 설정');
    expect(html).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>).)*고급 설정/s);
    expect(html).not.toContain('같은 시드는');
    expect(html).not.toContain('예후불량(경주 중 치명적 부상)');
    expect(html).not.toContain('경제 모드');
  });

  it('주 버튼은 이 조건으로 시작(btn--primary, 전체 폭 클래스), 보조는 저장본 불러오기', () => {
    const html = render();
    expect(html).toMatch(/<button type="submit" class="btn btn--primary start-card__start">이 조건으로 시작<\/button>/);
    expect(html).toContain('저장본 불러오기');
    expect(html).not.toContain('>취소<');
  });

  it('저장본 불러오기를 막고 취소를 주면 취소 버튼만 붙는다(메뉴 안 새 게임)', () => {
    const html = render({ canLoad: false, onCancel: () => {} });
    expect(html).not.toContain('저장본 불러오기');
    expect(html).toContain('>취소<');
    expect(html).toContain('이 조건으로 시작');
  });

  it('승부복은 미리보기와 꾸미기 버튼만 보이고 편집기는 접혀 있다', () => {
    const html = render();
    expect(html).toContain('승부복 앞모습');
    expect(html).toMatch(/aria-expanded="false"[^>]*>꾸미기</);
    expect(html).not.toContain('silks-editor');
    expect(html).not.toContain('무작위');
  });

  it('선택 카드는 시작 유형 2개와 난이도 3개가 기본으로 보이고 각 줄 설명을 가진다', () => {
    const html = render();
    expect(html.match(/class="start-option(?: is-selected)?"/g)).toHaveLength(5);
    expect(html.match(/class="start-option__line"/g)).toHaveLength(5);
    expect(html).toContain('목장 없이 현역마로 시작합니다');
  });
});
