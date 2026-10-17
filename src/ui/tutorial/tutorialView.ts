import { START_YEAR } from '../../engine/config/game';
import { weeksBetween } from '../../engine/time/calendar';
import type {
  GameDate,
  GameState,
  Horse,
  HorseId,
  TutorialLevel,
  TutorialProgress,
  TutorialStepId,
} from '../../engine/types';
import type { HorseTab } from '../horse/HorseLink';
import { stableGroup } from '../stable/stableView';
import { GLOSSARY } from '../common/glossary';

/**
 * 첫 시즌 안내의 기준 주: 새 게임이 시작하는 주(engine/state/newGame.ts 의 date 와 같다).
 * 여기서 한 주라도 지났으면 플레이어가 주를 진행한 것이므로 '한 주 진행' 단계를 자동으로 끝낸다.
 */
export const TUTORIAL_START_DATE: GameDate = { year: START_YEAR, week: 1 };

/** 모든 단계 ID 의 기본 순서(끝난 단계 정렬용). 수준별로 보이는 순서는 TUTORIAL_LEVEL_STEPS 가 정한다. */
export const TUTORIAL_STEP_IDS: readonly TutorialStepId[] = [
  'learn_basics',
  'automation_rules',
  'check_horse',
  'review_plans',
  'advance_week',
  'see_result',
  'review_matings',
];

/**
 * 수준별 단계 표(화면 상수, M6-T 추가 절). 순서가 곧 카드 순서다.
 * - racing_new: 경마 기초 → 게임 5단계
 * - game_new: 게임 5단계(조작 위주)
 * - veteran: 자동 진행 규칙 안내 → 출주 계획 → 교배 제안
 */
export const TUTORIAL_LEVEL_STEPS: Readonly<Record<TutorialLevel, readonly TutorialStepId[]>> = {
  racing_new: ['learn_basics', 'check_horse', 'review_plans', 'advance_week', 'see_result', 'review_matings'],
  game_new: ['check_horse', 'review_plans', 'advance_week', 'see_result', 'review_matings'],
  veteran: ['automation_rules', 'review_plans', 'review_matings'],
};

/** 수준 고르기 버튼(카드 첫 화면). 문구는 사용자 결정 2026-10-17 */
export const TUTORIAL_LEVEL_CHOICES: readonly { level: TutorialLevel; label: string }[] = [
  { level: 'racing_new', label: '경마를 몰라요' },
  { level: 'game_new', label: '경마는 알지만 이런 게임은 처음이에요' },
  { level: 'veteran', label: '이런 류의 게임을 해 봤어요' },
];

/** 이동할 화면. 말 상세는 HorseNavigation 으로 연다 */
export type TutorialTarget =
  | { screen: 'stable' }
  | { screen: 'horse'; horseId: HorseId; tab: HorseTab }
  | { screen: 'results' }
  | { screen: 'breeding' };

export interface TutorialStepView {
  id: TutorialStepId;
  title: string;
  /** 한 줄 설명(수준에 따라 더 친절한 문구) */
  hint: string;
  /** 펼쳐 읽는 설명 줄. 있으면 펼치는 순간 단계가 끝난다(learn_basics·automation_rules). 없으면 null */
  expand: readonly string[] | null;
  /** 이동 버튼 글자. target 이 없으면 null */
  moveLabel: string | null;
  /** 이동할 화면. null 이면 설명만 있는 단계(진행) 또는 이동할 말이 없는 경우 */
  target: TutorialTarget | null;
  done: boolean;
}

const STEP_TEXT: Readonly<Record<TutorialStepId, { title: string; hint: string; moveLabel: string | null }>> = {
  learn_basics: { title: '경마 기초 용어', hint: '그룹·OR·마장·핸디캡·블랙타입 뜻을 펼쳐 읽습니다.', moveLabel: null },
  automation_rules: { title: '자동 진행 규칙', hint: '제안은 빼지 않으면 그대로 진행됩니다. 펼쳐서 확인하세요.', moveLabel: null },
  check_horse: { title: '말 상태 확인', hint: '마구간에서 현역마의 상태와 컨디션을 봅니다.', moveLabel: '마구간으로' },
  review_plans: { title: '출주 계획 검토', hint: '첫 현역마의 출주 계획 탭에서 다음 출주를 확인합니다.', moveLabel: '출주 계획 보기' },
  advance_week: { title: '한 주 진행', hint: '1주 진행을 누르면 이 단계는 자동으로 끝납니다.', moveLabel: null },
  see_result: { title: '결과 확인', hint: '경주 화면의 결과 탭에서 내 말의 착순을 봅니다.', moveLabel: '결과 보기' },
  review_matings: { title: '교배 제안 확인', hint: '번식 화면에서 암말에 붙일 종마 제안을 봅니다.', moveLabel: '번식으로' },
};

/**
 * 수준별로 더 친절하거나 짧게 바꾼 설명 줄(화면 상수).
 * racing_new 는 경마 용어 풀이를 덧붙이고, veteran 은 짧게 쓴다.
 */
const LEVEL_HINT: Readonly<Record<TutorialLevel, Partial<Record<TutorialStepId, string>>>> = {
  racing_new: {
    check_horse: '마구간에서 현역마를 봅니다. 컨디션(몸 상태)이 좋을수록 출주에서 잘 달립니다.',
    review_plans: '첫 현역마의 출주 계획 탭에서 다음 경주의 날짜·등급·거리를 봅니다. OR 은 말의 실력 점수입니다.',
    advance_week: '1주 진행을 누르면 시간이 한 주 흐르고 말이 훈련·출주를 준비합니다. 이 단계는 자동으로 끝납니다.',
    see_result: '경주 화면의 결과 탭에서 착순, 착차(앞 말과의 거리), 우승마를 봅니다.',
    review_matings: '번식 화면에서 암말마다 붙일 종마 제안을 봅니다. 혈통의 니크·근친 설명을 함께 보세요.',
  },
  game_new: {},
  veteran: {
    review_plans: '출주 계획 탭에서 다음 출주를 확인합니다.',
    review_matings: '번식 화면에서 교배 제안을 확인합니다.',
  },
};

/** 펼쳐 읽는 설명(화면 상수). 용어 풀이는 T1 glossary 와 통합 예정 — 지금은 이 파일에 둔다. */
const EXPAND_TEXT: Partial<Record<TutorialStepId, readonly string[]>> = {
  // 용어 도움말(T1 glossary)과 같은 풀이를 쓴다
  learn_basics: (['group', 'or', 'going', 'handicap', 'black_type'] as const).map(
    (id) => `${GLOSSARY[id].term}: ${GLOSSARY[id].gloss}`,
  ),
  automation_rules: [
    '출주 계획: 기본은 제안이 그대로 출주 계획에 들어갑니다. 설정에서 승인제로 바꾸면 직접 승인해야 출주합니다.',
    '교배: 기본으로 1월 둘째 주에 빼지 않은 교배 제안이 예약됩니다. 설정에서 바꿀 수 있습니다.',
    '판매: 판매 제안은 위탁 마감 전에 자동으로 위탁됩니다. 설정에서 끌 수 있습니다.',
    '2세 조교: 설정을 끄지 않으면 새 2세가 조교사에게 자동으로 맡겨집니다.',
    '진행: 4주 진행·다음 출주까지는 중요한 결정 앞에서 멈추고 이유를 알려 줍니다.',
  ],
};

/** 현역마 중 ID 가 가장 앞선 말(결정적 순서). 현역마 탭(stableGroup 'active')과 같은 기준 */
export function firstRacehorse(state: GameState): Horse | null {
  const owned = Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId && stableGroup(h.status) === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return owned[0] ?? null;
}

function targetOf(id: TutorialStepId, horse: Horse | null): TutorialTarget | null {
  switch (id) {
    case 'check_horse':
      return { screen: 'stable' };
    case 'review_plans':
      return horse ? { screen: 'horse', horseId: horse.id, tab: 'plan' } : null;
    case 'see_result':
      return { screen: 'results' };
    case 'review_matings':
      return { screen: 'breeding' };
    case 'learn_basics':
    case 'automation_rules':
    case 'advance_week':
      return null;
  }
}

/** 고른 경험 수준(없으면 카드가 먼저 수준을 묻는다) */
export function tutorialLevel(state: GameState): TutorialLevel | undefined {
  return state.settings.tutorial?.level;
}

/**
 * 끝난 단계(기본 순서). 저장된 done 과 확실히 판정할 수 있는 상태를 합친다.
 * 자동 판정은 '한 주 진행'뿐이다. '결과 확인'은 결과 화면을 연 적이 있는지 저장하지 않으므로 자동 판정하지 않는다.
 */
export function tutorialDoneIds(state: GameState): TutorialStepId[] {
  const done = new Set<TutorialStepId>(state.settings.tutorial?.done ?? []);
  if (weeksBetween(TUTORIAL_START_DATE, state.date) >= 1) done.add('advance_week');
  return TUTORIAL_STEP_IDS.filter((id) => done.has(id));
}

/**
 * 고른 수준의 체크리스트 단계 목록(순서·제목·설명·펼침 줄·이동할 화면·끝남 여부).
 * 수준을 고르지 않았으면 빈 목록이다.
 */
export function tutorialSteps(state: GameState): TutorialStepView[] {
  const level = tutorialLevel(state);
  if (level === undefined) return [];
  const done = new Set(tutorialDoneIds(state));
  const horse = firstRacehorse(state);
  return TUTORIAL_LEVEL_STEPS[level].map((id) => {
    const text = STEP_TEXT[id];
    const target = targetOf(id, horse);
    return {
      id,
      title: text.title,
      hint: LEVEL_HINT[level][id] ?? text.hint,
      expand: EXPAND_TEXT[id] ?? null,
      moveLabel: target === null ? null : text.moveLabel,
      target,
      done: done.has(id),
    };
  });
}

/** 카드 머리글 문구. 예: '첫 시즌 안내 — 3/5'. 수준을 고르기 전에는 '첫 시즌 안내'만 쓴다. */
export function tutorialProgressText(steps: readonly TutorialStepView[]): string {
  if (steps.length === 0) return '첫 시즌 안내';
  const doneCount = steps.filter((s) => s.done).length;
  return `첫 시즌 안내 — ${doneCount}/${steps.length}`;
}

/** 카드를 보일지: 닫지 않았고, 수준을 아직 안 골랐거나 고른 수준의 단계가 남아 있을 때 */
export function showTutorial(state: GameState): boolean {
  if (state.settings.tutorial?.dismissed) return false;
  const level = tutorialLevel(state);
  if (level === undefined) return true;
  const done = new Set(tutorialDoneIds(state));
  return TUTORIAL_LEVEL_STEPS[level].some((id) => !done.has(id));
}

/** 진행 값을 새로 만든다(입력은 바꾸지 않는다). 수준·닫기 값은 현재 값을 따른다. */
function baseProgress(state: GameState, done: TutorialStepId[]): TutorialProgress {
  const current = state.settings.tutorial;
  const level = current?.level;
  return {
    ...(level === undefined ? {} : { level }),
    dismissed: current?.dismissed ?? false,
    done,
  };
}

/** 단계 하나를 끝낸 새 진행 값. 자동 판정된 단계도 함께 굳힌다. */
export function progressWithDone(state: GameState, id: TutorialStepId): TutorialProgress {
  const done = new Set<TutorialStepId>(tutorialDoneIds(state));
  done.add(id);
  return baseProgress(state, TUTORIAL_STEP_IDS.filter((s) => done.has(s)));
}

/** 체크리스트를 닫은 새 진행 값(끝난 단계·수준은 유지) */
export function progressDismissed(state: GameState): TutorialProgress {
  return { ...baseProgress(state, tutorialDoneIds(state)), dismissed: true };
}

/** 수준을 고르거나(racing_new 등) 바꾼다(null: 수준을 다시 묻도록 지운다). 끝난 단계는 유지한다. */
export function progressWithLevel(state: GameState, level: TutorialLevel | null): TutorialProgress {
  const current = state.settings.tutorial;
  return {
    ...(level === null ? {} : { level }),
    dismissed: current?.dismissed ?? false,
    done: tutorialDoneIds(state),
  };
}
