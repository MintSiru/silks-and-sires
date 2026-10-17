import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MATING_AUTO_BOOK_WEEK } from '../../src/engine/config/mating';
import { createNewGame } from '../../src/engine/state/newGame';
import type { GameSettings } from '../../src/engine/types';
import type { GameApi } from '../../src/ui/game/useGame';
import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import {
  NEW_GAME_WARNING_KO,
  RACE_PLAN_MODE_OPTIONS,
  autoApproveFromMode,
  autoSellOn,
  autoSendToTrainingOn,
  matingProgressGuide,
  racePlanMode,
} from '../../src/ui/shell/settingsView';
import SettingsModal from '../../src/ui/shell/SettingsModal';
import { TOAST_MS, Toast } from '../../src/ui/shell/Toast';

/** 설정 일부만 가진 객체. 판정 함수는 이 필드만 읽는다. */
const settings = (partial: Partial<GameSettings>) => partial as GameSettings;

describe('출주 계획 진행 방식 (A1)', () => {
  it('값이 없거나 true 면 자동 신청, false 면 승인한 계획만', () => {
    expect(racePlanMode(settings({}))).toBe('auto');
    expect(racePlanMode(settings({ autoApproveRacePlans: true }))).toBe('auto');
    expect(racePlanMode(settings({ autoApproveRacePlans: false }))).toBe('approved_only');
  });

  it('라디오 선택을 설정 값으로 되돌린다(자동 = true)', () => {
    expect(autoApproveFromMode('auto')).toBe(true);
    expect(autoApproveFromMode('approved_only')).toBe(false);
    for (const option of RACE_PLAN_MODE_OPTIONS) {
      expect(racePlanMode(settings({ autoApproveRacePlans: autoApproveFromMode(option.mode) }))).toBe(option.mode);
    }
  });

  it('두 선택지 이름은 명세 문구 그대로다', () => {
    expect(RACE_PLAN_MODE_OPTIONS.map((o) => o.label)).toEqual(['조교사 제안 자동 신청', '내가 승인한 계획만']);
  });
});

describe('체크박스 상태 (A1)', () => {
  it('2세 자동 조교와 판매 제안 자동 위탁은 값이 없으면 켜짐', () => {
    expect(autoSendToTrainingOn(settings({}))).toBe(true);
    expect(autoSellOn(settings({}))).toBe(true);
    expect(autoSendToTrainingOn(settings({ autoSendToTraining: false }))).toBe(false);
    expect(autoSellOn(settings({ autoSell: false }))).toBe(false);
  });
});

describe('교배 진행 방식 안내 (A1)', () => {
  it('엔진의 세 상태(없음·true·false)마다 다른 문장', () => {
    const none = matingProgressGuide(settings({}));
    const on = matingProgressGuide(settings({ autoApproveMatings: true }));
    const off = matingProgressGuide(settings({ autoApproveMatings: false }));
    expect(new Set([none, on, off]).size).toBe(3);
  });

  it('기본(없음) 안내는 엔진의 자동 예약 주를 읽는다', () => {
    expect(matingProgressGuide(settings({}))).toContain(`${MATING_AUTO_BOOK_WEEK}주차`);
  });
});

describe('새 게임 확인 문구 (A1)', () => {
  it('저장하지 않은 진행을 잃는다는 경고를 담는다', () => {
    expect(NEW_GAME_WARNING_KO).toContain('저장하지 않은');
  });
});

describe('토스트 (A2)', () => {
  it('4초이고 aria-live 영역을 항상 둔다', () => {
    expect(TOAST_MS).toBe(4000);
    const empty = renderToStaticMarkup(createElement(Toast, { notice: null, onExpire: () => undefined }));
    expect(empty).toContain('aria-live="polite"');
    expect(empty).not.toContain('<p');
  });

  it('알림 문구와 톤을 그린다', () => {
    const html = renderToStaticMarkup(
      createElement(Toast, { notice: { id: 1, text: '저장했습니다.', tone: 'ok' }, onExpire: () => undefined }),
    );
    expect(html).toContain('저장했습니다.');
    expect(html).toContain('toast toast--ok');
    const error = renderToStaticMarkup(
      createElement(Toast, { notice: { id: 2, text: '실패', tone: 'error' }, onExpire: () => undefined }),
    );
    expect(error).toContain('toast--error');
  });
});

describe('설정 모달 구성 (A1)', () => {
  it('세 그룹과 위험 영역, 명세의 버튼 이름을 담는다', () => {
    const state = createNewGame({
      seed: 20261017,
      playerName: '구름 마주',
      silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
    });
    const html = renderToStaticMarkup(
      createElement(
        WeightUnitProvider,
        null,
        createElement(SettingsModal, {
          game: {} as GameApi,
          state,
          economyText: '테스트 경제',
          onClose: () => undefined,
          onNotify: () => undefined,
          onLoaded: () => undefined,
          onStartNewGame: () => undefined,
        }),
      ),
    );
    for (const text of [
      '메뉴·설정',
      '저장 관리',
      '진행·자동화',
      '표시·외형',
      '위험 영역',
      '저장',
      '불러오기',
      '조교사 제안 자동 신청',
      '내가 승인한 계획만',
      '2세 자동 조교 보내기',
      '판매 제안 자동 위탁',
      '부담중량 단위',
      '교배 예약',
      '승부복 바꾸기',
      '새 게임',
      '닫기',
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('<dialog');
    expect(html).toContain('type="radio"');
  });
});
