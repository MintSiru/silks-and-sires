import { useMemo, useState } from 'react';
import type { Horse } from '../../engine/types';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameApi } from '../game/useGame';
import { emptyRacePlanHint, racePlanErrorKo, racePlanRows, racePlanSections } from '../season/racePlanView';
import { planChoices } from './horseDetailView';

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
  const requireApproval = game.state?.settings.autoApproveRacePlans === false;
  const context = { requireApproval, country: (horse.trainerId === null ? undefined : game.state?.trainers[horse.trainerId]?.country) ?? horse.countryOfBirth };
  const sections = racePlanSections(plans);
  const rows = racePlanRows(sections.active, context);
  const history = racePlanRows(sections.history, context);
  const weeks = useMemo(() => game.upcomingRaces(12), [game]);
  const choices = useMemo(() => planChoices(horse.id, weeks), [horse.id, weeks]);
  const [weekPick, setWeekPick] = useState('');
  const [pick, setPick] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const unavailable = locked || horse.status !== 'in_training' || horse.trainerId === null;
  const weekKey = weekPick || `${weeks[0]?.date.year}-${weeks[0]?.date.week}`;
  const available = choices.filter((c) => `${c.plan.date.year}-${c.plan.date.week}` === weekKey);
  const show = (result: ReturnType<GameApi['approvePlan']>, text: string) =>
    setNotice(result.ok ? { ok: true, text } : { ok: false, text: racePlanErrorKo(result.error) });
  return (
    <section aria-label="출주 계획 검토">
      <h3>출주 계획</h3>
      <p className="hint">
        {requireApproval ? '승인한 계획만 해당 주에 자동으로 출주 신청합니다.' : '조교사 제안은 빼지 않으면 해당 주에 자동으로 출주 신청합니다.'}
      </p>
      {horse.trainerId === null && <p className="notice">개요에서 조교사를 배정하세요.</p>}
      {horse.status === 'resting' && <p className="notice">휴양 중에는 계획을 변경할 수 없습니다.</p>}
      {notice && (
        <p className={`notice notice--${notice.ok ? 'ok' : 'error'}`} role="status">
          {notice.text}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="empty-state">
          {game.state ? emptyRacePlanHint(game.state, horse) : '현재 제안된 계획이 없습니다.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table plan-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>레이스 / 조건</th>
                <th>조교사 메모</th>
                <th>상태</th>
                <th>검토</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.dateLabel}</td>
                  <td>{r.name}{r.away}</td>
                  <td>{r.note}</td>
                  <td>
                    <span
                      className={`status-chip status-chip--${r.status === 'proposed' || r.status === 'skipped' ? 'caution' : 'good'}`}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="actions">
                    {r.canApprove && (
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
                        onClick={() => show(game.removePlan(horse.id, r.id), '출주 계획에서 뺐습니다.')}
                      >
                        빼기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history.length > 0 && (
        <details className="plan-history">
          <summary>지난 계획 · 최근 {history.length}건 (전체 {sections.historyCount}건)</summary>
          <ul className="task-list">
            {history.map((r) => <li key={r.id}>{r.dateLabel} · {r.name}{r.away} · {r.statusLabel}<div className="hint">{r.note}</div></li>)}
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
          고정 일정 또는 일반 경주 조건을 추가하세요. {requireApproval ? '추가한 뒤 승인해야 진행됩니다. ' : '빼지 않으면 예정대로 진행됩니다. '}같은 주에는 한 계획만 둘 수 있습니다.
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
              setNotice({ ok: false, text: '그 주에는 이미 계획이 있습니다. 기존 계획을 뺀 뒤 추가하세요.' });
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
