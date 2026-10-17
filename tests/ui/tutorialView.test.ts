import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { addWeeks } from '../../src/engine/time/calendar';
import type { GameState, TutorialLevel, TutorialStepId } from '../../src/engine/types';
import { HorseNavigation } from '../../src/ui/horse/HorseLink';
import HomeScreen from '../../src/ui/home/HomeScreen';
import TutorialCard from '../../src/ui/tutorial/TutorialCard';
import {
  TUTORIAL_LEVEL_CHOICES,
  TUTORIAL_LEVEL_STEPS,
  TUTORIAL_START_DATE,
  TUTORIAL_STEP_IDS,
  progressDismissed,
  progressWithDone,
  progressWithLevel,
  showTutorial,
  tutorialProgressText,
  tutorialSteps,
} from '../../src/ui/tutorial/tutorialView';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

/** 플레이어 현역마(조교 중)를 한 마리 넣는다. 새 게임의 기본 말 구성은 설정에 따라 달라서 명시한다. */
function withRacehorse(state: GameState, id = 'horse-test-1'): GameState {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: state.date.year - 3,
    currentYear: state.date.year,
    sex: 'female',
    countryOfBirth: 'GB',
    status: 'in_training',
    level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  state.horses[id] = horse;
  return state;
}

function withLevel(state: GameState, level: TutorialLevel, done: TutorialStepId[] = []): GameState {
  state.settings.tutorial = { level, dismissed: false, done };
  return state;
}

function renderCard(state: GameState): string {
  return renderToStaticMarkup(
    createElement(
      HorseNavigation.Provider,
      { value: { state, openHorse: () => {} } },
      createElement(TutorialCard, { state, onNavigate: () => {} }),
    ),
  );
}

describe('경험 수준별 단계 표', () => {
  it('수준별 단계 수와 순서가 명세와 같다', () => {
    expect(TUTORIAL_LEVEL_STEPS.racing_new).toEqual([
      'learn_basics', 'check_horse', 'review_plans', 'advance_week', 'see_result', 'review_matings',
    ]);
    expect(TUTORIAL_LEVEL_STEPS.game_new).toEqual([
      'check_horse', 'review_plans', 'advance_week', 'see_result', 'review_matings',
    ]);
    expect(TUTORIAL_LEVEL_STEPS.veteran).toEqual(['automation_rules', 'review_plans', 'review_matings']);
    expect(TUTORIAL_LEVEL_STEPS.racing_new).toHaveLength(6);
    expect(TUTORIAL_LEVEL_STEPS.game_new).toHaveLength(5);
    expect(TUTORIAL_LEVEL_STEPS.veteran).toHaveLength(3);
  });

  it('수준 고르기 버튼은 세 개이고 수준 순서대로다', () => {
    expect(TUTORIAL_LEVEL_CHOICES.map((c) => c.level)).toEqual(['racing_new', 'game_new', 'veteran']);
    expect(TUTORIAL_LEVEL_CHOICES[0]!.label).toBe('경마를 몰라요');
  });

  it('각 수준의 tutorialSteps 는 표와 같은 순서로 나온다', () => {
    for (const level of ['racing_new', 'game_new', 'veteran'] as const) {
      const state = withLevel(withRacehorse(fixture()), level);
      expect(tutorialSteps(state).map((s) => s.id)).toEqual([...TUTORIAL_LEVEL_STEPS[level]]);
    }
  });

  it('기초 용어·자동 진행 규칙은 펼쳐 읽는 줄을 가진다', () => {
    const racing = tutorialSteps(withLevel(fixture(), 'racing_new')).find((s) => s.id === 'learn_basics');
    expect(racing?.expand?.length).toBe(5);
    expect(racing?.target).toBeNull();
    const veteran = tutorialSteps(withLevel(fixture(), 'veteran')).find((s) => s.id === 'automation_rules');
    expect(veteran?.expand?.length).toBeGreaterThan(0);
    expect(tutorialSteps(withLevel(fixture(), 'game_new')).every((s) => s.expand === null)).toBe(true);
  });

  it('racing_new 는 경마 용어 풀이를 덧붙인 문구를 쓴다', () => {
    const check = tutorialSteps(withLevel(fixture(), 'racing_new')).find((s) => s.id === 'check_horse');
    const plain = tutorialSteps(withLevel(fixture(), 'game_new')).find((s) => s.id === 'check_horse');
    expect(check?.hint).not.toBe(plain?.hint);
    expect(check?.hint).toContain('컨디션');
  });
});

describe('첫 시즌 체크리스트 단계 판정', () => {
  it('새 게임 게임 조작형 수준은 5단계가 모두 남아 있고 진행률은 0/5', () => {
    const state = withLevel(fixture(), 'game_new');
    const steps = tutorialSteps(state);
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(tutorialProgressText(steps)).toBe('첫 시즌 안내 — 0/5');
  });

  it('수준을 고르기 전에는 단계가 없고 머리글은 일반 문구다', () => {
    const state = fixture();
    expect(tutorialSteps(state)).toEqual([]);
    expect(tutorialProgressText([])).toBe('첫 시즌 안내');
  });

  it('출주 계획 단계는 첫 현역마의 말 상세 출주 계획 탭을 가리킨다', () => {
    const state = withLevel(withRacehorse(fixture()), 'game_new');
    const review = tutorialSteps(state).find((s) => s.id === 'review_plans');
    expect(review?.target?.screen).toBe('horse');
    if (review?.target?.screen !== 'horse') throw new Error('말 상세 대상이어야 한다');
    expect(state.horses[review.target.horseId]?.ownerId).toBe(state.playerOwnerId);
    expect(review.target.tab).toBe('plan');
  });

  it('현역마가 없으면 출주 계획 단계는 이동 없이 설명만 남는다', () => {
    const state = withLevel(fixture(), 'game_new');
    for (const id of Object.keys(state.horses)) {
      if (state.horses[id]!.ownerId === state.playerOwnerId) delete state.horses[id];
    }
    const review = tutorialSteps(state).find((s) => s.id === 'review_plans');
    expect(review?.target).toBeNull();
    expect(review?.moveLabel).toBeNull();
  });

  it('저장된 done 값이 반영되고 중복이나 표에 없는 단계는 반영되지 않는다', () => {
    const state = withLevel(fixture(), 'game_new', ['check_horse', 'check_horse', 'learn_basics']);
    const steps = tutorialSteps(state);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(['check_horse']);
    expect(tutorialProgressText(steps)).toBe('첫 시즌 안내 — 1/5');
  });

  it('한 주 이상 지나면 한 주 진행 단계를 자동으로 끝낸다', () => {
    const state = withLevel(fixture(), 'game_new');
    expect(state.date).toEqual(TUTORIAL_START_DATE);
    expect(tutorialSteps(state).find((s) => s.id === 'advance_week')?.done).toBe(false);
    state.date = addWeeks(state.date, 1);
    expect(tutorialSteps(state).find((s) => s.id === 'advance_week')?.done).toBe(true);
  });

  it('결과 확인 단계는 시간이 지나도 자동으로 끝나지 않는다', () => {
    const state = withLevel(fixture(), 'game_new');
    state.date = addWeeks(state.date, 10);
    expect(tutorialSteps(state).find((s) => s.id === 'see_result')?.done).toBe(false);
  });

  it('펼쳐 읽기로 끝낸 기초 용어가 진행률에 반영된다', () => {
    const state = withLevel(withRacehorse(fixture()), 'racing_new');
    expect(tutorialProgressText(tutorialSteps(state))).toBe('첫 시즌 안내 — 0/6');
    state.settings.tutorial = progressWithDone(state, 'learn_basics');
    expect(tutorialProgressText(tutorialSteps(state))).toBe('첫 시즌 안내 — 1/6');
  });
});

describe('카드 표시 여부와 진행 값', () => {
  it('수준을 아직 안 골랐으면 보인다', () => {
    expect(showTutorial(fixture())).toBe(true);
  });

  it('닫았으면 보이지 않는다', () => {
    const dismissed = withLevel(fixture(), 'game_new');
    dismissed.settings.tutorial = { ...dismissed.settings.tutorial!, dismissed: true };
    expect(showTutorial(dismissed)).toBe(false);
  });

  it('고른 수준의 단계가 남아 있으면 보이고, 모두 끝나면 보이지 않는다', () => {
    const state = withLevel(fixture(), 'veteran');
    expect(showTutorial(state)).toBe(true);
    state.settings.tutorial = {
      level: 'veteran',
      dismissed: false,
      done: [...TUTORIAL_LEVEL_STEPS.veteran],
    };
    expect(showTutorial(state)).toBe(false);
  });

  it('progressWithDone 은 입력을 바꾸지 않고 자동 판정 단계와 새 단계를 함께 굳히며 수준을 유지한다', () => {
    const state = withLevel(fixture(), 'game_new');
    state.date = addWeeks(state.date, 1);
    const before = structuredClone(state.settings.tutorial);
    const next = progressWithDone(state, 'check_horse');
    expect(state.settings.tutorial).toEqual(before);
    expect(next).toEqual({ level: 'game_new', dismissed: false, done: ['check_horse', 'advance_week'] });
  });

  it('progressWithDone 은 이미 끝난 단계를 다시 넣지 않고 닫기 값을 유지한다', () => {
    const state = withLevel(fixture(), 'game_new', ['see_result']);
    state.settings.tutorial = { ...state.settings.tutorial!, dismissed: false };
    expect(progressWithDone(state, 'see_result')).toEqual({ level: 'game_new', dismissed: false, done: ['see_result'] });
  });

  it('progressWithLevel 은 수준을 저장하고 끝난 단계를 유지하며, null 이면 수준을 지운다', () => {
    const state = fixture();
    state.settings.tutorial = { dismissed: false, done: ['check_horse'] };
    expect(progressWithLevel(state, 'racing_new')).toEqual({ level: 'racing_new', dismissed: false, done: ['check_horse'] });
    const cleared = progressWithLevel(state, null);
    expect('level' in cleared).toBe(false);
    expect(cleared.done).toEqual(['check_horse']);
    expect(showTutorial({ ...state, settings: { ...state.settings, tutorial: cleared } })).toBe(true);
  });

  it('progressDismissed 는 닫기 표시를 세우고 수준과 끝난 단계는 유지한다', () => {
    const state = withLevel(fixture(), 'game_new', ['review_matings']);
    expect(progressDismissed(state)).toEqual({ level: 'game_new', dismissed: true, done: ['review_matings'] });
  });

  it('단계 ID 기본 순서는 모든 단계를 한 번씩 담는다', () => {
    expect(new Set(TUTORIAL_STEP_IDS).size).toBe(TUTORIAL_STEP_IDS.length);
    expect(TUTORIAL_STEP_IDS).toHaveLength(7);
  });
});

describe('카드 렌더', () => {
  it('수준을 묻는 첫 화면은 세 버튼과 닫기를 그리고 단계는 그리지 않는다', () => {
    const html = renderCard(fixture());
    expect(html).toContain('어떤 플레이어인가요?');
    for (const choice of TUTORIAL_LEVEL_CHOICES) expect(html).toContain(choice.label);
    expect(html).toContain('닫기');
    expect(html).not.toContain('수준 바꾸기');
    expect(html).not.toContain('tutorial-step');
  });

  it('게임 조작형 카드는 진행률, 다섯 단계 제목, 수준 바꾸기, 이동 버튼을 그린다', () => {
    const state = withLevel(withRacehorse(fixture()), 'game_new');
    const html = renderCard(state);
    expect(html).toContain('첫 시즌 안내 — 0/5');
    for (const title of ['말 상태 확인', '출주 계획 검토', '한 주 진행', '결과 확인', '교배 제안 확인']) {
      expect(html).toContain(title);
    }
    expect(html).toContain('마구간으로');
    expect(html).toContain('출주 계획 보기');
    expect(html).toContain('결과 보기');
    expect(html).toContain('번식으로');
    expect(html).toContain('수준 바꾸기');
    expect(html).toContain('닫기');
    expect(html).toContain('남음');
  });

  it('경마 초보 카드는 기초 용어 단계를 펼쳐 읽기 버튼과 함께 그린다', () => {
    const state = withLevel(withRacehorse(fixture()), 'racing_new');
    const html = renderCard(state);
    expect(html).toContain('첫 시즌 안내 — 0/6');
    expect(html).toContain('경마 기초 용어');
    expect(html).toContain('펼쳐 읽기');
    expect(html).not.toContain('그룹(G1·G2·G3)');
  });

  it('단계 설명은 2줄 말줄임으로 줄어들어도 title 에 전체 문구가 남는다', () => {
    const state = withLevel(withRacehorse(fixture()), 'racing_new');
    const html = renderCard(state);
    const hint = tutorialSteps(state).find((s) => s.id === 'check_horse')!.hint;
    expect(hint.length).toBeGreaterThan(30);
    expect(html).toContain(`title="${hint}"`);
    expect(html).toContain('data-expand-toggle=""');
  });

  it('베테랑 카드는 세 단계와 자동 진행 규칙을 그린다', () => {
    const state = withLevel(withRacehorse(fixture()), 'veteran');
    const html = renderCard(state);
    expect(html).toContain('첫 시즌 안내 — 0/3');
    expect(html).toContain('자동 진행 규칙');
    expect(html).toContain('교배 제안 확인');
  });

  it('끝난 단계는 완료 표시를 쓴다', () => {
    const state = withLevel(withRacehorse(fixture()), 'game_new', ['check_horse']);
    const html = renderCard(state);
    expect(html).toContain('첫 시즌 안내 — 1/5');
    expect(html).toContain('tutorial-step is-done');
    expect(html).toContain('완료');
  });

  it('홈 화면은 카드가 보일 때만 첫 시즌 안내를 넣는다', () => {
    const shown = fixture();
    const hidden = withLevel(fixture(), 'game_new');
    hidden.settings.tutorial = { ...hidden.settings.tutorial!, dismissed: true };
    const render = (state: GameState) =>
      renderToStaticMarkup(
        createElement(
          HorseNavigation.Provider,
          { value: { state, openHorse: () => {} } },
          createElement(HomeScreen, { state, onNavigate: () => {} }),
        ),
      );
    expect(render(shown)).toContain('어떤 플레이어인가요?');
    expect(render(hidden)).not.toContain('첫 시즌 안내');
  });
});
