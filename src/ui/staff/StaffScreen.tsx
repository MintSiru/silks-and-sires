import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { RETAINER_MAX_PER_KIND, RETAINER_TERMINATION_PENALTY_RATE } from '../../engine/config/economy';
import { contractFor } from '../../engine/economy/contractQuery';
import type { RetainerKind } from '../../engine/economy/contracts';
import type { GameState } from '../../engine/types';
import {
  countryKo,
  retainerRefusalKo,
  signConfirmKo,
  terminateConfirmKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import { reputationView, staffRows, type StaffRow } from './staffView';

/** 값이 없을 때 칸을 채우는 표기 */
const NO_VALUE = '—';
/** 종류 선택 순서와 표기 */
const KINDS: readonly RetainerKind[] = ['trainer', 'jockey'];
const KIND_LABEL: Record<RetainerKind, string> = { trainer: '조교사', jockey: '기수' };

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface StaffScreenProps {
  game: GameApi;
}

/** 게임이 없으면 안내만, 있으면 인맥 화면을 보인다. */
export default function StaffScreen({ game }: StaffScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>인맥</h2>
        <p className="hint">먼저 '목장·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <StaffView game={game} state={game.state} />;
}

function StaffView({ game, state }: { game: GameApi; state: GameState }): JSX.Element {
  const [kind, setKind] = useState<RetainerKind>('trainer');
  const [onlyKnown, setOnlyKnown] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const reputation = reputationView(state);
  const rows = useMemo(() => staffRows(state, kind, { onlyKnown }), [state, kind, onlyKnown]);

  /** 전속 제의: 제의가 가능할 때만 누를 수 있고, 계약금을 확인한 뒤 체결한다 */
  const handleSign = (row: StaffRow): void => {
    if (!row.quote.ok) return;
    if (!window.confirm(signConfirmKo(row.quote.feeKo))) return;
    const result = game.signRetainer(kind, row.personId);
    if (result.ok) setNotice({ tone: 'ok', text: `${row.name} 전속 계약을 맺었습니다.` });
    else setNotice({ tone: 'error', text: retainerRefusalKo(result.error) });
  };

  /** 계약 해지: 위약금(연간 계약금 × 위약금 비율, 엔진과 같은 식)을 확인한 뒤 해지한다 */
  const handleTerminate = (row: StaffRow): void => {
    const contract = contractFor(state, kind, row.personId);
    if (contract === undefined) {
      setNotice({ tone: 'error', text: retainerRefusalKo('not_contracted') });
      return;
    }
    const penalty = Math.round(contract.annualFee * RETAINER_TERMINATION_PENALTY_RATE);
    if (!window.confirm(terminateConfirmKo(penalty))) return;
    const result = game.terminateRetainer(kind, row.personId);
    if (result.ok) setNotice({ tone: 'ok', text: `${row.name} 전속 계약을 해지했습니다.` });
    else setNotice({ tone: 'error', text: retainerRefusalKo(result.error) });
  };

  return (
    <section aria-label="인맥">
      <section className="panel">
        <h2>인맥</h2>
        <p className="hint">
          관계가 쌓인 조교사·기수에게 전속을 제의합니다. 전속 자리는 종류마다 {RETAINER_MAX_PER_KIND}명뿐이며, 해지하면 위약금이 나갑니다.
        </p>
        <p>
          명성 <strong>{reputation.reputation.toFixed(1)}</strong> · {reputation.labelKo}
        </p>
      </section>

      <section className="panel">
        <div className="sales-filter">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={k === kind ? 'tab tab--active' : 'tab'}
              aria-pressed={k === kind}
              onClick={() => {
                setKind(k);
                setNotice(null);
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
          <label>
            <input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} /> 아는 사람만
          </label>
        </div>
        <NoticeLine notice={notice} />

        {rows.length === 0 ? (
          <p className="hint">
            {onlyKnown
              ? `아직 관계가 쌓인 ${KIND_LABEL[kind]}가 없습니다. '아는 사람만'을 끄면 전체 목록을 봅니다.`
              : `${KIND_LABEL[kind]} 목록이 비어 있습니다.`}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>나라</th>
                  <th>나이</th>
                  <th>관계</th>
                  <th>전속 상태</th>
                  <th>제의 조건</th>
                  <th>행동</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const contracted = row.contractKo !== null;
                  return (
                    <tr key={row.personId} className={contracted ? 'is-selected' : undefined}>
                      <td>{row.name}</td>
                      <td>{countryKo(row.country)}</td>
                      <td>{row.age}세</td>
                      <td>
                        {row.relation.toFixed(1)} · {row.tierKo}
                      </td>
                      <td>{row.contractKo ?? NO_VALUE}</td>
                      <td>
                        {contracted
                          ? NO_VALUE
                          : row.quote.ok
                            ? `계약금 ${row.quote.feeKo}`
                            : row.quote.reasonKo}
                      </td>
                      <td>
                        {contracted ? (
                          <button type="button" className="btn" onClick={() => handleTerminate(row)}>
                            계약 해지
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            disabled={!row.quote.ok}
                            onClick={() => handleSign(row)}
                          >
                            전속 제의
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
      </section>
    </section>
  );
}

function NoticeLine({ notice }: { notice: Notice | null }): JSX.Element | null {
  if (notice === null) return null;
  return (
    <p className={`notice notice--${notice.tone}`} role="status">
      {notice.text}
    </p>
  );
}
