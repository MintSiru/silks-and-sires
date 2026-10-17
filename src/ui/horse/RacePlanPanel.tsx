import { useMemo, useState } from 'react';
import { assessForPlayer } from '../../engine/horse/playerView';
import type { Horse } from '../../engine/types';
import { formatDateKo } from '../../engine/time/calendar';
import { GradeBadge, StatusBadge } from '../common/Badge';
import type { GameApi } from '../game/useGame';
import {
  emptyRacePlanHint,
  planStatusView,
  racePlanErrorKo,
  racePlanRows,
  racePlanSections,
} from '../season/racePlanView';
import { useNotify } from '../shell/notify';
import { planChoices } from './horseDetailView';
import './racePlan.css';

type PlanRow = ReturnType<typeof racePlanRows>[number];

/**
 * 메모 칸. 거리 판단 문구가 주 문구이면(noteFolded) 엔진 메모 원문은 '조교사 메모' 펼침 안에 둔다.
 * 힌트 안이면 원문을 그대로 보인다.
 */
function PlanNote({ row }: { row: PlanRow }) {
  if (!row.noteFolded) return <>{row.note}</>;
  return (
    <>
      <span>{row.note}</span>
      <details className="plan-note__memo">
        <summary>조교사 메모</summary>
        <p className="hint">{row.engineNote}</p>
      </details>
    </>
  );
}

export default function RacePlanPanel({
  horse,
  game,
  locked,
}: {
  horse: Horse;
  game: GameApi;
  locked: boolean;
}) {
  const plans = game.racePlan(horse.id);
  const state = game.state;
  const requireApproval = state?.settings.autoApproveRacePlans === false;
  // 거리 힌트는 개요와 같은 계산(assessForPlayer)을 쓴다. 말이 상태에 없으면 힌트 비교를 생략한다.
  const distanceHint = useMemo(
    () =>
      state === null || state === undefined || state.horses[horse.id] === undefined
        ? undefined
        : assessForPlayer(state, horse.id).distanceHint,
    [state, horse.id],
  );
  const context = {
    requireApproval,
    distanceHint,
    currentDate: state?.date,
    country: (horse.trainerId === null ? undefined : state?.trainers[horse.trainerId]?.country) ?? horse.countryOfBirth,
  };
  const sections = racePlanSections(plans);
  const rows = racePlanRows(sections.active, context);
  const history = racePlanRows(sections.history, context);
  const weeks = useMemo(() => game.upcomingRaces(12), [game]);
  const choices = useMemo(() => planChoices(horse.id, weeks), [horse.id, weeks]);
  const [weekPick, setWeekPick] = useState('');
  const [pick, setPick] = useState('');
  const notify = useNotify();
  const unavailable = locked || horse.status !== 'in_training' || horse.trainerId === null;
  const weekKey = weekPick || `${weeks[0]?.date.year}-${weeks[0]?.date.week}`;
  const available = choices.filter((c) => `${c.plan.date.year}-${c.plan.date.week}` === weekKey);
  const show = (result: ReturnType<GameApi['approvePlan']>, text: string) =>
    result.ok ? notify(text, 'ok') : notify(racePlanErrorKo(result.error), 'error');
  return (
    <section aria-label="출주 계획 검토">
      <h3>출주 계획</h3>
      <p className="hint">
        {requireApproval
          ? '승인한 계획만 해당 주에 자동으로 출주 신청합니다. 승인 대기 계획은 승인하거나 제외하세요.'
          : '제외하지 않은 계획은 해당 주에 자동으로 출주 신청합니다.'}
      </p>
      {horse.trainerId === null && <p className="notice">개요에서 조교사를 배정하세요.</p>}
      {horse.status === 'resting' && <p className="notice">휴양 중에는 계획을 변경할 수 없습니다.</p>}
      {rows.length === 0 ? (
        <p className="empty-state">
          {state ? emptyRacePlanHint(state, horse) : '현재 제안된 계획이 없습니다.'}
        </p>
      ) : (
        <div className="table-scroll plan-table-scroll">
          <table className="data-table plan-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>레이스 / 조건</th>
                <th>조교사 메모</th>
                <th>상태</th>
                <th>조작</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = planStatusView(r.status, requireApproval, r.searching);
                return (
                  <tr key={r.id}>
                    <td className="plan-table__date">{r.dateLabel}</td>
                    <td className="plan-table__race">
                      <div className="plan-table__title">
                        <GradeBadge grade={r.gradeLabel} />
                        <span className="plan-table__name">{r.titleLine}</span>
                        <span className="plan-table__conditions">
                          {r.conditionLine}
                          {r.away}
                        </span>
                      </div>
                    </td>
                    <td className="plan-table__note">
                      <PlanNote row={r} />
                    </td>
                    <td>
                      <StatusBadge tone={status.tone} label={status.label} />
                    </td>
                    <td className="actions">
                      {requireApproval && r.canApprove && (
                        <button
                          type="button"
                          className="btn"
                          disabled={unavailable}
                          onClick={() => show(game.approvePlan(horse.id, r.id), '출주 계획을 승인했습니다.')}
                        >
                          승인
                        </button>
                      )}
                      {r.canRemove && (
                        <button
                          type="button"
                          className="btn"
                          disabled={unavailable}
                          onClick={() => show(game.removePlan(horse.id, r.id), '출주 계획에서 제외했습니다.')}
                        >
                          제외
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {history.length > 0 && (
        <details className="plan-history">
          <summary>지난 계획 · 최근 {history.length}건 (전체 {sections.historyCount}건)</summary>
          <ul className="task-list">
            {history.map((r) => (
              <li key={r.id}>
                {r.dateLabel} · {r.name}
                {r.away} · {r.statusLabel}
                <div className="hint">
                  <PlanNote row={r} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button
        type="button"
        className="btn"
        disabled={unavailable}
        onClick={() => show(game.proposeRacePlan(horse.id), '조교사가 계획을 다시 짰습니다.')}
      >
        조교사에게 다시 짜기
      </button>
      <details className="plan-add">
        <summary>앞으로 12주에서 골라 추가</summary>
        <p className="hint">
          고정 일정 또는 일반 경주 조건을 추가하세요. {requireApproval ? '추가한 뒤 승인해야 진행됩니다. ' : '제외하지 않으면 예정대로 진행됩니다. '}같은 주에는 한 계획만 둘 수 있습니다.
        </p>
        <label className="field">
          주 선택
          <select
            value={weekKey}
            onChange={(e) => {
              setWeekPick(e.target.value);
              setPick('');
            }}
          >
            {weeks.map((w) => (
              <option key={`${w.date.year}-${w.date.week}`} value={`${w.date.year}-${w.date.week}`}>
                {formatDateKo(w.date)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          레이스 또는 조건
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">추가할 레이스 선택</option>
            {available.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={unavailable || !pick}
          onClick={() => {
            const choice = available.find((c) => c.key === pick);
            if (!choice) return;
            if (
              plans.some(
                (p) => p.date.year === choice.plan.date.year && p.date.week === choice.plan.date.week,
              )
            ) {
              notify('그 주에는 이미 계획이 있습니다. 기존 계획을 제외한 뒤 추가하세요.', 'error');
              return;
            }
            show(
              game.setRacePlan(horse.id, [...plans, choice.plan]),
              requireApproval ? '계획에 추가했습니다. 목록에서 승인하세요.' : '계획에 추가했습니다. 예정된 주에 진행합니다.',
            );
            setPick('');
          }}
        >
          계획에 추가
        </button>
      </details>
    </section>
  );
}
