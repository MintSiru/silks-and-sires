import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { GameApi } from '../game/useGame';
import type { GameState, HorseId, RaceDayBrief, RaceId, RunningStyle } from '../../engine/types';
import { getRacecourse } from '../../engine/data/staticData';
import { silksDesignOf } from '../../engine/people/silks';
import { formatWeight } from '../game/units';
import { useWeightUnit } from '../game/WeightUnitContext';
import { useNotify } from '../shell/notify';
import SilksSvg from '../silks/SilksSvg';
import RaceDayReplay from './RaceDayReplay';
import RaceDayResult from './RaceDayResult';
import {
  CARD_SORT_OPTIONS,
  RACE_ORDER_ERROR_KO,
  TACTIC_CHOICES,
  cardRows,
  commentSpeakerKo,
  paceTextKo,
  paddockToneClass,
  raceHeaderOf,
  sortCardRows,
  tacticLabelKo,
} from './raceDayView';
import type { CardSortKey } from './raceDayView';
import './raceDay.css';

/** 레이스 당일에 열린 내 말 출주 한 건 */
export interface RaceDayEntry {
  meetingId: string;
  raceId: RaceId;
  horseId: HorseId;
}

/**
 * 화면 단계. brief 는 출주표·패독·코멘트·작전 지시를 보는 단계다.
 * replay 는 출주 뒤 자동 재생, result 는 착순표와 사후 코멘트다. watch 가 false 면 재생 없이 결과만 넘긴다.
 */
type Phase = { kind: 'brief' } | { kind: 'replay' | 'result'; index: number; watch: boolean };

export interface RaceDayScreenProps {
  game: GameApi;
  /** 이번 주 내 말 출주 목록(prepareRaceDay 결과) */
  entries: readonly RaceDayEntry[];
  onClose: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '작업을 완료하지 못했습니다.';
}

/**
 * 레이스 당일 전체 화면 대화상자(M7-RD). 출주표·패독·코멘트·작전 지시 → '출주'(한 주 진행 뒤 자동 재생)
 * 또는 '결과만 보기' → 결과 화면. 여러 레이스면 위쪽 탭으로 고른다.
 */
export default function RaceDayScreen({ game, entries, onClose }: RaceDayScreenProps): JSX.Element | null {
  const notify = useNotify();
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState<CardSortKey>('saddle');
  const [phase, setPhase] = useState<Phase>({ kind: 'brief' });
  const [snapshot, setSnapshot] = useState<RaceDayBrief[]>([]);
  const startedRef = useRef(false);
  const state = game.state;

  // 대화상자가 떠 있는 동안 토스트를 위로 올린다(하단 버튼을 가리지 않게, raceDay.css). 닫히면 되돌린다.
  useEffect(() => {
    document.body.classList.add('rd-open');
    return () => document.body.classList.remove('rd-open');
  }, []);
  const raceDayBrief = game.raceDayBrief;

  // 출주표는 상태가 바뀔 때마다 다시 만든다(작전 지시가 바뀌면 추천·현재 지시가 갱신된다).
  const briefs = useMemo((): RaceDayBrief[] | string => {
    if (phase.kind !== 'brief' || state === null) return [];
    try {
      return entries.map((entry) => raceDayBrief(entry.raceId, entry.horseId));
    } catch (error) {
      return messageOf(error);
    }
  }, [phase.kind, state, entries, raceDayBrief]);

  /** 재생이 끝나면 결과 단계로 넘긴다(한 번만 바꾸는 함수형 갱신이라 여러 번 불려도 안전하다). */
  const finishReplay = useCallback(
    (): void => setPhase((p) => (p.kind === 'replay' ? { kind: 'result', index: p.index, watch: p.watch } : p)),
    [],
  );

  if (state === null) return null;
  const current = Array.isArray(briefs) ? briefs : [];
  const activeIndex = Math.min(tab, Math.max(current.length - 1, 0));
  const brief = current[activeIndex];

  /** 출주: 출주 전 출주표를 찍어 두고 한 주 진행한 뒤 재생(watch) 또는 결과로 간다. */
  const start = (watch: boolean): void => {
    if (startedRef.current) return;
    if (!Array.isArray(briefs) || briefs.length === 0) {
      notify(typeof briefs === 'string' ? briefs : '출주표를 불러오지 못했습니다.', 'error');
      return;
    }
    startedRef.current = true;
    try {
      game.advance(1);
    } catch (error) {
      startedRef.current = false;
      notify(messageOf(error), 'error');
      return;
    }
    setSnapshot(briefs);
    setPhase({ kind: watch ? 'replay' : 'result', index: 0, watch });
  };

  /** 출주표를 만들 수 없을 때(옛 저장본 등): 화면 없이 한 주 진행하고 닫는다. 엔진 안내대로 주간 진행으로 넘긴다. */
  const advanceWithoutBrief = (): void => {
    try {
      game.advance(1);
      onClose();
    } catch (error) {
      notify(messageOf(error), 'error');
    }
  };

  const setTactic = (horseId: HorseId, raceId: RaceId, tactic: RunningStyle): void => {
    const result = game.setRaceOrder(raceId, horseId, tactic);
    if (!result.ok) {
      notify(RACE_ORDER_ERROR_KO[result.error], 'error');
      return;
    }
    notify(`작전을 ${tacticLabelKo(tactic)}(으)로 바꿨습니다.`);
  };

  const hasNext = (index: number): boolean => index + 1 < snapshot.length;
  const goNext = (index: number, watch: boolean): void => {
    if (hasNext(index)) setPhase({ kind: watch ? 'replay' : 'result', index: index + 1, watch });
    else onClose();
  };

  return (
    <div className="rd-overlay">
      <section className="rd-dialog" role="dialog" aria-modal="true" aria-label="레이스 당일">
        {phase.kind === 'brief' && (
          <>
            {current.length > 1 && (
              <nav className="tabs rd-tabs" aria-label="이번 주 내 출주">
                {current.map((b, i) => (
                  <button
                    key={`${b.raceId}:${b.horseId}`}
                    type="button"
                    className={`tab ${i === activeIndex ? 'tab--active' : ''}`}
                    aria-pressed={i === activeIndex}
                    onClick={() => setTab(i)}
                  >
                    {b.card.race.name} · {state.horses[b.horseId]?.name ?? '—'}
                  </button>
                ))}
              </nav>
            )}
            {typeof briefs === 'string' && (
              <section className="rd-panel">
                <p role="alert">{briefs}</p>
                <div className="rd-actions">
                  <button type="button" className="btn btn--primary" onClick={advanceWithoutBrief}>
                    이번 주 진행하기
                  </button>
                </div>
              </section>
            )}
            {brief !== undefined && (
              <BriefView
                state={state}
                brief={brief}
                sort={sort}
                onSort={setSort}
                onTactic={(style) => setTactic(brief.horseId, brief.raceId, style)}
                onStart={start}
              />
            )}
          </>
        )}
        {phase.kind !== 'brief' && (
          <>
            {snapshot.length > 1 && (
              <p className="hint">
                {phase.index + 1} / {snapshot.length} 레이스
              </p>
            )}
            {phase.kind === 'replay' && snapshot[phase.index] !== undefined && (
              <RaceDayReplay
                key={`${phase.index}`}
                state={state}
                brief={snapshot[phase.index]!}
                onFinished={finishReplay}
              />
            )}
            {phase.kind === 'result' && snapshot[phase.index] !== undefined && (
              <RaceDayResult
                state={state}
                brief={snapshot[phase.index]!}
                hasNext={hasNext(phase.index)}
                onNext={() => goNext(phase.index, phase.watch)}
                onClose={onClose}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface BriefViewProps {
  state: GameState;
  brief: RaceDayBrief;
  sort: CardSortKey;
  onSort: (key: CardSortKey) => void;
  onTactic: (style: RunningStyle) => void;
  onStart: (watch: boolean) => void;
}

/** 출주 전 한 레이스의 화면: 머리 정보, 출주표, 패독, 코멘트, 작전 지시, 버튼. */
function BriefView({ state, brief, sort, onSort, onTactic, onStart }: BriefViewProps): JSX.Element {
  const { unit } = useWeightUnit();
  const course = getRacecourse(brief.card.race.racecourseId);
  const header = raceHeaderOf(brief, course);
  const rows = sortCardRows(cardRows(brief, state), sort);
  const horseName = (horseId: HorseId): string => state.horses[horseId]?.name ?? '—';

  return (
    <>
      <header className="rd-head">
        <h2>{header.title}</h2>
        <p className="rd-meta">
          {header.gradeText} · {header.distanceText} · 주로 {header.goingText} · {header.courseText} · {header.prizeText} ·
          출주 {header.fieldText}
        </p>
      </header>

      <div className="rd-card">
        <div className="rd-card__bar">
          <label className="rd-sort">
            정렬{' '}
            <select value={sort} onChange={(e) => onSort(e.target.value as CardSortKey)}>
              {CARD_SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="hint">예상 페이스: {paceTextKo(brief.paceOutlook)}</span>
        </div>
        <div className="rd-table-wrap">
          <table className="rd-table">
            <caption className="sr-only">출주표</caption>
            <thead>
              <tr>
                <th scope="col">마번</th>
                <th scope="col">게이트</th>
                <th scope="col">승부복</th>
                <th scope="col">말</th>
                <th scope="col">나이·성별</th>
                <th scope="col">부담중량</th>
                <th scope="col">기수</th>
                <th scope="col">조교사</th>
                <th scope="col">OR</th>
                <th scope="col">최근 전적</th>
                <th scope="col">예상 오즈</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.horseId} className={row.isMine ? 'is-mine' : undefined}>
                  <td>{row.saddleCloth}</td>
                  <td>{row.draw}</td>
                  <td>
                    <SilksSvg design={silksDesignOf(row.silks, row.horseId)} size={18} />
                  </td>
                  <td>{row.name}</td>
                  <td>{row.ageSexKo}</td>
                  <td>{formatWeight(row.weightLb, unit)}</td>
                  <td>{row.jockeyName}</td>
                  <td>{row.trainerName}</td>
                  <td>{row.or ?? '—'}</td>
                  <td>{row.formText}</td>
                  <td>{row.oddsText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rd-grid">
        <section className="rd-panel" aria-label="패독">
          <h4>패독</h4>
          <ul className="rd-list">
            {brief.paddock.map((note) => (
              <li key={note.horseId} className={note.horseId === brief.horseId ? 'is-mine' : undefined}>
                <strong>{horseName(note.horseId)}</strong>{' '}
                <span className={paddockToneClass(note.tone)}>{note.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rd-panel" aria-label="코멘트">
          <h4>코멘트</h4>
          {brief.comments.length === 0 && <p className="hint">코멘트가 없습니다.</p>}
          {brief.comments.map((comment) => (
            <p key={`${comment.speaker}:${comment.personId}`} className="rd-bubble">
              <strong>
                {comment.name} · {commentSpeakerKo(comment)}
              </strong>
              <span>{comment.text}</span>
            </p>
          ))}
        </section>

        <section className="rd-panel" aria-label="작전 지시">
          <h4>작전 지시</h4>
          <div role="radiogroup" aria-label="작전">
            {TACTIC_CHOICES.map((choice) => (
              <label key={choice.style} className={`rd-tactic ${brief.tactic === choice.style ? 'is-current' : ''}`}>
                <input
                  type="radio"
                  name={`tactic-${brief.raceId}`}
                  value={choice.style}
                  checked={brief.tactic === choice.style}
                  onChange={() => onTactic(choice.style)}
                />
                <span className="rd-tactic__text">
                  <strong>{choice.label}</strong>
                  {choice.style === brief.recommendedTactic && <span className="rd-badge">조교사 추천</span>}
                  <span className="hint">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="hint">현재 지시: {tacticLabelKo(brief.tactic)}</p>
        </section>
      </div>

      <footer className="rd-actions">
        <button type="button" className="btn btn--primary" onClick={() => onStart(true)}>
          출주 — 레이스 보기
        </button>
        <button type="button" className="btn" onClick={() => onStart(false)}>
          결과만 보기
        </button>
      </footer>
    </>
  );
}
