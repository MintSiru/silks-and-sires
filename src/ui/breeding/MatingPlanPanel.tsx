import { useMemo, useState } from 'react';
import { bookingSeasonOf } from '../../engine/breeding/season';
import { getNicks, getStallionRecords } from '../../engine/data/staticData';
import type { GameState } from '../../engine/types';
import { GradeBadge, StatusBadge } from '../common/Badge';
import { feeKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import HorseLink from '../horse/HorseLink';
import {
  approvalSummary,
  bulkApproveState,
  matingPlanErrorKo,
  matingPlanRows,
  matingStatusTone,
  type ApprovalSummary,
  type MatingPlanRow,
} from './matingPlanView';
import './matingPlan.css';

/** 모두 승인 확인 창. 대상 두수·총 종부료·주의/위험 배합 수를 보여 주고, 확인해야 실행된다. */
export function MatingApproveDialog({
  summary, onConfirm, onCancel,
}: { summary: ApprovalSummary; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mating-plan__scrim">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mating-approve-title"
        className="mating-plan__dialog"
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      >
        <h3 id="mating-approve-title">교배 제안을 모두 승인할까요?</h3>
        <dl className="mating-plan__summary">
          <dt>대상</dt>
          <dd>{`${summary.count}두`}</dd>
          <dt>예상 총 종부료</dt>
          <dd>{feeKo(summary.totalFee)}</dd>
          <dt>주의 배합</dt>
          <dd>{`${summary.cautionCount}건`}</dd>
          <dt>위험 배합</dt>
          <dd>{`${summary.riskCount}건`}</dd>
        </dl>
        {summary.riskCount > 0 && (
          <p className="notice notice--error" role="note">
            위험 배합이 포함되어 있습니다. 건강·능력 저하 위험이 있습니다.
          </p>
        )}
        <p className="hint">승인하면 바로 예약됩니다. 실제 종부료는 자가 종마·교배권에 따라 줄고, 예산을 넘는 제안은 건너뜁니다.</p>
        <div className="mating-plan__dialog-actions">
          <button type="button" className="btn" autoFocus onClick={onCancel}>취소</button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>
            {`${summary.count}두 승인`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MatingPlanPanel({
  state, game, locked,
}: { state: GameState; game: GameApi; locked: boolean }) {
  const rows = useMemo(() => matingPlanRows(state, {
    nicks: getNicks(), stallionRecords: getStallionRecords(),
  }), [state]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const windowOpen = bookingSeasonOf(state.date) !== null;
  const unavailable = locked || !windowOpen;
  const bulk = bulkApproveState(rows, { locked, windowOpen });
  const summary = useMemo(() => approvalSummary(rows), [rows]);
  const show = (result: ReturnType<GameApi['approveMating']>, text: string) => {
    if (!result.ok) {
      setNotice({ ok: false, text: matingPlanErrorKo(result.error) });
      return;
    }
    const skipped = result.events.filter((e) => e.type === 'mating_proposal_skipped');
    setNotice({ ok: skipped.length === 0, text: skipped.length > 0 ? skipped.map((e) => e.reason).join(' · ') : text });
  };
  const applyCap = () => {
    const input = cap ?? (state.settings.matingFeeCap == null ? '' : String(state.settings.matingFeeCap));
    const result = game.setMatingFeeCap(input.trim() === '' ? null : Number(input));
    show(result, '종부료 상한을 적용했습니다. 다시 짜기를 누르면 새 상한으로 제안합니다.');
    if (result.ok) setCap(null);
  };
  const confirmApproveAll = () => {
    setConfirmOpen(false);
    show(game.approveAllMatings(), '교배 제안을 모두 승인했습니다.');
  };
  return (
    <section className="panel mating-plan" aria-label="교배 제안 검토">
      <h2>교배 제안</h2>
      <p className="hint">
        교배 담당이 번식 암말의 상대를 제안합니다. 승인하면 바로 예약하고 종부료를 냅니다. 근거는 행의 '근거'를 펼쳐 보세요.
      </p>
      <div className="mating-plan__toolbar">
        <div className="mating-plan__bulk">
          <button
            type="button" className="btn btn--primary" disabled={!bulk.enabled}
            onClick={() => setConfirmOpen(true)}
          >{bulk.label}</button>
          <button
            type="button" className="btn" disabled={unavailable}
            onClick={() => show(game.proposeMatings(), '교배 담당이 제안을 다시 짰습니다.')}
          >교배 담당에게 다시 짜기</button>
        </div>
        <label className="mating-plan__field">
          진행 방식
          <select
            disabled={locked}
            value={state.settings.autoApproveMatings === true ? 'now' : state.settings.autoApproveMatings === false ? 'manual' : 'default'}
            onChange={(e) => game.setAutoApproveMatings(e.target.value === 'now' ? true : e.target.value === 'manual' ? false : undefined)}
          >
            <option value="default">빼지 않으면 1월 2주에 예약</option>
            <option value="now">제안 즉시 예약</option>
            <option value="manual">승인한 것만 예약</option>
          </select>
        </label>
        <label className="mating-plan__field">
          한 두당 종부료 상한 (€)
          <input
            type="number" min="0" step="1" disabled={locked} placeholder="암말 수준에 맞춤"
            value={cap ?? (state.settings.matingFeeCap == null ? '' : String(state.settings.matingFeeCap))}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <button type="button" className="btn" disabled={locked} onClick={applyCap}>상한 적용</button>
      </div>
      {bulk.reason !== null && <p className="hint mating-plan__reason">{bulk.reason}</p>}
      <p className="hint">자동 승인은 새로 생기는 제안부터 적용합니다. 상한을 비우면 암말 수준에 맞춥니다.</p>
      {unavailable && (
        <p className="hint">{locked ? '현재 진행이 잠겨 있습니다.' : '예약 창이 열리면 제안을 검토할 수 있습니다.'}</p>
      )}
      {notice && <p className={`notice notice--${notice.ok ? 'ok' : 'error'}`} role="status">{notice.text}</p>}
      {rows.length === 0 ? (
        <p className="empty-state">현재 교배 제안이 없습니다. 예약 창에서 교배 담당에게 다시 짜기를 요청하세요.</p>
      ) : (
        <div className="table-scroll mating-plan__scroll">
          <table className="data-table mating-plan__table">
            <thead>
              <tr>
                <th scope="col">암말</th>
                <th scope="col">제안 종마</th>
                <th scope="col">종부료</th>
                <th scope="col">종합 판단</th>
                <th scope="col">상태·조작</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <MatingPlanTableRow
                key={`${r.season}:${r.mareId}`} row={r} unavailable={unavailable}
                onApprove={() => show(game.approveMating(r.mareId), '교배 제안을 승인했습니다.')}
                onChange={(stallionId) => show(game.changeMating(r.mareId, stallionId), '교배 상대를 바꿨습니다. 검토 후 승인하세요.')}
                onRemove={() => show(game.removeMating(r.mareId), '이번 시즌 교배 제안에서 뺐습니다.')}
              />)}
            </tbody>
          </table>
        </div>
      )}
      {confirmOpen && bulk.enabled && (
        <MatingApproveDialog
          summary={summary}
          onConfirm={confirmApproveAll}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </section>
  );
}

function MatingPlanTableRow({
  row: r, unavailable, onApprove, onChange, onRemove,
}: {
  row: MatingPlanRow;
  unavailable: boolean;
  onApprove: () => void;
  onChange: (stallionId: string) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <th scope="row" className="mating-plan__mare">
        <HorseLink horseId={r.mareId} name={r.mareName} />
        <GradeBadge grade={r.qualityGrade} />
        <details className="mating-plan__why">
          <summary>근거</summary>
          <dl>
            <dt>수준</dt>
            <dd>{r.quality}</dd>
            <dt>니크</dt>
            <dd>{r.nick}</dd>
            <dt>근친</dt>
            <dd>{r.inbreeding}</dd>
            <dt>거리 보완</dt>
            <dd>{r.distance}</dd>
            <dt>메모</dt>
            <dd>{r.note}</dd>
          </dl>
        </details>
      </th>
      <td className="mating-plan__stallion">
        <HorseLink horseId={r.stallionId} name={r.stallionName} />
        <span className="hint">{r.alternatives.length === 0 ? '대안 없음' : `대안 ${r.alternatives.length}두`}</span>
      </td>
      <td className="mating-plan__fee">{r.fee}</td>
      <td>
        <StatusBadge tone={r.judgement.tone} label={r.judgement.summary} />
      </td>
      <td className="mating-plan__actions">
        <StatusBadge tone={matingStatusTone(r.status)} label={r.statusLabel} />
        {r.canApprove && <div className="mating-plan__btns">
          <button type="button" className="btn" disabled={unavailable} onClick={onApprove}>승인</button>
          <select
            aria-label={`${r.mareName} 대안으로 바꾸기`} value=""
            disabled={unavailable || r.alternatives.length === 0}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">대안으로 바꾸기</option>
            {r.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button type="button" className="btn" disabled={unavailable} onClick={onRemove}>빼기</button>
        </div>}
      </td>
    </tr>
  );
}
