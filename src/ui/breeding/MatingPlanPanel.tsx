import { useMemo, useState } from 'react';
import { bookingSeasonOf } from '../../engine/breeding/season';
import { getNicks, getStallionRecords } from '../../engine/data/staticData';
import type { GameState } from '../../engine/types';
import type { GameApi } from '../game/useGame';
import HorseLink from '../horse/HorseLink';
import { matingPlanErrorKo, matingPlanRows } from './matingPlanView';

export default function MatingPlanPanel({
  state, game, locked,
}: { state: GameState; game: GameApi; locked: boolean }) {
  const rows = useMemo(() => matingPlanRows(state, {
    nicks: getNicks(), stallionRecords: getStallionRecords(),
  }), [state]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const unavailable = locked || bookingSeasonOf(state.date) === null;
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
  return (
    <section className="panel" aria-label="교배 제안 검토">
      <h2>교배 제안</h2>
      <p className="hint">
        교배 담당이 번식 암말의 상대를 제안합니다. 승인하면 대안까지 차례로 확인해 바로 예약하고 종부료를 냅니다.
      </p>
      <div className="actions">
        <button
          type="button" className="btn" disabled={unavailable || !rows.some((r) => r.canApprove)}
          onClick={() => show(game.approveAllMatings(), '교배 제안을 모두 승인했습니다.')}
        >모두 승인</button>
        <button
          type="button" className="btn" disabled={unavailable}
          onClick={() => show(game.proposeMatings(), '교배 담당이 제안을 다시 짰습니다.')}
        >교배 담당에게 다시 짜기</button>
        <label className="field">
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
        <label className="field">
          한 두당 종부료 상한 (€)
          <input
            type="number" min="0" step="1" disabled={locked} placeholder="암말 수준에 맞춤"
            value={cap ?? (state.settings.matingFeeCap == null ? '' : String(state.settings.matingFeeCap))}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>
        <button type="button" className="btn" disabled={locked} onClick={applyCap}>상한 적용</button>
      </div>
      <p className="hint">자동 승인은 새로 생기는 제안부터 적용합니다. 상한을 비우면 암말 수준에 맞춥니다.</p>
      {unavailable && (
        <p className="hint">{locked ? '현재 진행이 잠겨 있습니다.' : '예약 창이 열리면 제안을 검토할 수 있습니다.'}</p>
      )}
      {notice && <p className={`notice notice--${notice.ok ? 'ok' : 'error'}`} role="status">{notice.text}</p>}
      {rows.length === 0 ? (
        <p className="empty-state">현재 교배 제안이 없습니다. 예약 창에서 교배 담당에게 다시 짜기를 요청하세요.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table plan-table">
            <thead>
              <tr>
                {['암말 / 수준', '1순위 종마 / 예약 종마', '종부료', '니크', '근친', '거리 보완', '메모', '상태', '검토'].map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.season}:${r.mareId}`}>
                  <th scope="row">
                    <HorseLink horseId={r.mareId} name={r.mareName} />
                    <p className="hint">{r.quality}</p>
                  </th>
                  <td><HorseLink horseId={r.stallionId} name={r.stallionName} /></td>
                  <td>{r.fee}</td>
                  <td>{r.nick}</td>
                  <td>{r.inbreeding}</td>
                  <td>{r.distance}</td>
                  <td>{r.note}</td>
                  <td>
                    <span className={`status-chip status-chip--${r.status === 'proposed' || r.status === 'skipped' ? 'caution' : 'good'}`}>
                      {r.season} · {r.statusLabel}
                    </span>
                  </td>
                  <td className="actions">
                    {r.canApprove && <>
                      <button
                        type="button" className="btn" disabled={unavailable}
                        onClick={() => show(game.approveMating(r.mareId), '교배 제안을 승인했습니다.')}
                      >승인</button>
                      <select
                        aria-label={`${r.mareName} 대안으로 바꾸기`} value=""
                        disabled={unavailable || r.alternatives.length === 0}
                        onChange={(e) => show(game.changeMating(r.mareId, e.target.value), '교배 상대를 바꿨습니다. 검토 후 승인하세요.')}
                      >
                        <option value="">대안으로 바꾸기</option>
                        {r.alternatives.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                      <button
                        type="button" className="btn" disabled={unavailable}
                        onClick={() => show(game.removeMating(r.mareId), '이번 시즌 교배 제안에서 뺐습니다.')}
                      >빼기</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
