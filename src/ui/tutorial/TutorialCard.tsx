import { useContext, useEffect, useState } from 'react';
import type { GameState, TutorialLevel, TutorialProgress, TutorialStepId } from '../../engine/types';
import { HorseNavigation } from '../horse/HorseLink';
import {
  TUTORIAL_LEVEL_CHOICES,
  progressDismissed,
  progressWithDone,
  progressWithLevel,
  tutorialLevel,
  tutorialProgressText,
  tutorialSteps,
  type TutorialStepView,
} from './tutorialView';
import './tutorial.css';

export interface TutorialCardProps {
  state: GameState;
  /** 마구간·번식·결과 화면으로 이동. 말 상세 '출주 계획' 탭은 HorseNavigation 으로 연다 */
  onNavigate: (screen: 'stable' | 'breeding' | 'results') => void;
  /** 진행 값 저장(useGame.setTutorial). 없으면 화면만 바뀌고 진행은 저장되지 않는다 */
  onTutorial?: (progress: TutorialProgress) => void;
}

/** 첫 시즌 체크리스트 카드(M6-T). 처음엔 경험 수준을 묻고, 수준별 단계를 보여 준다. */
export default function TutorialCard({ state, onNavigate, onTutorial }: TutorialCardProps) {
  const { openHorse } = useContext(HorseNavigation);
  const [cardOpen, setCardOpen] = useState(true);
  /** 펼쳐 읽는 단계(learn_basics·automation_rules). 펼치는 순간 끝난 것으로 저장한다 */
  const [expandedSteps, setExpandedSteps] = useState<TutorialStepId[]>([]);
  const level: TutorialLevel | undefined = tutorialLevel(state);
  const steps = tutorialSteps(state);
  const headingId = 'tutorial-card-title';

  const chooseLevel = (picked: TutorialLevel) => onTutorial?.(progressWithLevel(state, picked));

  const move = (step: TutorialStepView) => {
    const target = step.target;
    if (target === null) return;
    onTutorial?.(progressWithDone(state, step.id));
    if (target.screen === 'horse') openHorse(target.horseId, target.tab);
    else onNavigate(target.screen);
  };

  const toggleExpand = (step: TutorialStepView) => {
    const opening = !expandedSteps.includes(step.id);
    setExpandedSteps((prev) => (opening ? [...prev, step.id] : prev.filter((id) => id !== step.id)));
    if (opening && !step.done) onTutorial?.(progressWithDone(state, step.id));
  };

  /** 풀이 팝오버는 Esc·바깥 클릭으로 닫는다. '펼쳐 읽기'/'접기' 버튼(data-expand-toggle)은 토글 자체가 처리한다. */
  const hasPopover = expandedSteps.length > 0;
  useEffect(() => {
    if (!hasPopover) return;
    const close = () => setExpandedSteps([]);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('.tutorial-card__expand, [data-expand-toggle]')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [hasPopover]);

  const dismissButton = (
    <button type="button" className="btn" onClick={() => onTutorial?.(progressDismissed(state))}>
      닫기
    </button>
  );

  if (level === undefined) {
    return (
      <section className="panel tutorial-card" aria-labelledby={headingId}>
        <div className="tutorial-card__head">
          <h3 id={headingId}>첫 시즌 안내 — 어떤 플레이어인가요?</h3>
          <div className="tutorial-card__actions">{dismissButton}</div>
        </div>
        <div className="tutorial-card__levels" role="group" aria-label="경험 수준">
          {TUTORIAL_LEVEL_CHOICES.map((choice) => (
            <button key={choice.level} type="button" className="btn" onClick={() => chooseLevel(choice.level)}>
              {choice.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel tutorial-card" aria-labelledby={headingId}>
      <div className="tutorial-card__head">
        <h3 id={headingId}>{tutorialProgressText(steps)}</h3>
        <div className="tutorial-card__actions">
          <button type="button" className="link-btn" onClick={() => onTutorial?.(progressWithLevel(state, null))}>
            수준 바꾸기
          </button>
          <button
            type="button"
            className="btn"
            aria-expanded={cardOpen}
            onClick={() => {
              setCardOpen((v) => !v);
              setExpandedSteps([]);
            }}
          >
            {cardOpen ? '카드 접기' : '카드 펼치기'}
          </button>
          {dismissButton}
        </div>
      </div>
      {cardOpen && (
        <ol className="tutorial-card__steps">
          {steps.map((step) => {
            const expanded = expandedSteps.includes(step.id);
            return (
              <li key={step.id} className={step.done ? 'tutorial-step is-done' : 'tutorial-step'}>
                <div className="tutorial-step__title">
                  <span className="tutorial-step__mark">{step.done ? '완료' : '남음'}</span>
                  <strong>{step.title}</strong>
                </div>
                <p className="hint" title={step.hint}>
                  {step.hint}
                </p>
                {step.expand !== null && (
                  <button
                    type="button"
                    className="btn"
                    data-expand-toggle=""
                    aria-expanded={expanded}
                    onClick={() => toggleExpand(step)}
                  >
                    {expanded ? '접기' : '펼쳐 읽기'}
                  </button>
                )}
                {step.target !== null && step.moveLabel !== null && (
                  <button type="button" className="btn" onClick={() => move(step)}>
                    {step.moveLabel}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {/* 펼친 풀이는 카드 아래에 겹쳐 뜨는 팝오버(absolute)라 레이아웃을 밀지 않는다. 내용은 잘리지 않는다. */}
      {cardOpen &&
        steps.map((step) =>
          step.expand !== null && expandedSteps.includes(step.id) ? (
            <div key={step.id} className="tutorial-card__expand" role="note">
              <strong>{step.title} — 풀이</strong>
              <button
                type="button"
                className="link-btn tutorial-card__expand-close"
                onClick={() => setExpandedSteps((prev) => prev.filter((id) => id !== step.id))}
              >
                접기
              </button>
              <ul>
                {step.expand.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
    </section>
  );
}
