import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { GameState, Money } from '../../engine/types';
import { economyModeKo, feeKo, fundsWarningKo, ledgerCategoryKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import {
  fundsBanner,
  pnlHistory,
  recentLedger,
  yearPnl,
  type PnlLine,
  type YearPnlView,
} from './economyView';

/** 값이 없을 때 표시하는 기호 */
const NO_VALUE = '—';
/** 지난 해 선택 상자의 '올해' 값 */
const CURRENT_YEAR_VALUE = 'current';

/** 부호를 붙인 금액 표기. 수입 +€1,000 · 지출 -€1,000 */
function signedFeeKo(amount: Money): string {
  if (amount > 0) return `+${feeKo(amount)}`;
  if (amount < 0) return `-${feeKo(-amount)}`;
  return feeKo(0);
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface EconomyScreenProps {
  game: GameApi;
}

/** 게임이 없으면 안내만, 있으면 경제 화면을 보인다. */
export default function EconomyScreen({ game }: EconomyScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>경제</h2>
        <p className="hint">먼저 '목장·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <EconomyView state={game.state} />;
}

function EconomyView({ state }: { state: GameState }): JSX.Element {
  const banner = useMemo(() => fundsBanner(state), [state]);
  const history = useMemo(() => pnlHistory(state), [state]);
  const ledger = useMemo(() => recentLedger(state), [state]);
  /** 지난 해 선택(null 이면 올해) */
  const [yearPick, setYearPick] = useState<number | null>(null);

  // 지난 해 목록은 최근 해가 위로 오게 뒤집는다
  const pastYears = useMemo(() => history.map((h) => h.year).reverse(), [history]);
  const selectedYear = yearPick !== null && pastYears.includes(yearPick) ? yearPick : null;
  const pnl = useMemo(
    () => (selectedYear === null ? yearPnl(state) : yearPnl(state, selectedYear)),
    [state, selectedYear],
  );

  return (
    <section aria-label="경제">
      <section className="panel">
        <h2>자금</h2>
        <p className="topbar__info">
          <span>자금 {feeKo(banner.funds)}</span>
          {banner.debt > 0 && <span>빚 {feeKo(banner.debt)}</span>}
          <span>모드 {economyModeKo(banner.mode)}</span>
        </p>
        {banner.warning !== null && (
          <p
            className={banner.warning.kind === 'debt' ? 'hint' : 'notice notice--error'}
            role={banner.warning.kind === 'debt' ? undefined : 'alert'}
          >
            {fundsWarningKo(banner.warning)}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>손익 ({pnl === null ? NO_VALUE : `${pnl.year}년${pnl.current ? ' · 올해' : ''}`})</h2>
        <div className="field">
          <label>
            연도{' '}
            <select
              value={selectedYear === null ? CURRENT_YEAR_VALUE : String(selectedYear)}
              onChange={(e) => setYearPick(e.target.value === CURRENT_YEAR_VALUE ? null : Number(e.target.value))}
            >
              <option value={CURRENT_YEAR_VALUE}>올해 ({state.date.year}년)</option>
              {pastYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}년
                </option>
              ))}
            </select>
          </label>
        </div>
        {pnl === null ? <p className="hint">선택한 해의 기록이 없습니다.</p> : <PnlTable pnl={pnl} />}
      </section>

      <section className="panel">
        <h2>최근 장부</h2>
        <p className="hint">플레이어 장부의 최근 항목을 최신순으로 보입니다.</p>
        {ledger.length === 0 ? (
          <p className="hint">아직 장부에 남은 거래가 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>종류</th>
                <th>금액</th>
                <th>말</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row, index) => (
                <tr key={`${row.dateLabel}-${row.category}-${index}`}>
                  <td>{row.dateLabel}</td>
                  <td>{ledgerCategoryKo(row.category)}</td>
                  <td>{signedFeeKo(row.amount)}</td>
                  <td>{row.horseName ?? NO_VALUE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>연도별 추이</h2>
        <p className="hint">지난 해의 순익과 연말 자금·빚입니다.</p>
        {history.length === 0 ? (
          <p className="hint">아직 한 해가 끝나지 않았습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>연도</th>
                <th>순익</th>
                <th>연말 자금</th>
                <th>연말 빚</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{signedFeeKo(row.net)}</span>
                      <span style={{ display: 'inline-block', width: 160, background: '#161b22', borderRadius: 3 }}>
                        <span
                          style={{
                            display: 'block',
                            height: 8,
                            width: `${row.barPercent}%`,
                            borderRadius: 3,
                            background: row.positive ? '#2e8b57' : '#d62828',
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td>{feeKo(row.playerFunds)}</td>
                  <td>{feeKo(row.playerDebt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}

/** 손익표: 수입 행 → 수입 합계 → 지출 행 → 지출 합계 → 순익 */
function PnlTable({ pnl }: { pnl: YearPnlView }): JSX.Element {
  if (pnl.income.length === 0 && pnl.expense.length === 0) {
    return <p className="hint">이 해에는 아직 거래가 없습니다.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>구분</th>
          <th>종류</th>
          <th>금액</th>
        </tr>
      </thead>
      <tbody>
        {pnl.income.map((line) => (
          <PnlRow key={`in-${line.category}`} kind="수입" line={line} />
        ))}
        <tr>
          <td>수입 합계</td>
          <td />
          <td>{signedFeeKo(pnl.incomeTotal)}</td>
        </tr>
        {pnl.expense.map((line) => (
          <PnlRow key={`out-${line.category}`} kind="지출" line={line} />
        ))}
        <tr>
          <td>지출 합계</td>
          <td />
          <td>{signedFeeKo(pnl.expenseTotal)}</td>
        </tr>
        <tr>
          <td>
            <strong>순익</strong>
          </td>
          <td />
          <td>
            <strong>{signedFeeKo(pnl.net)}</strong>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PnlRow({ kind, line }: { kind: '수입' | '지출'; line: PnlLine }): JSX.Element {
  return (
    <tr>
      <td>{kind}</td>
      <td>{ledgerCategoryKo(line.category)}</td>
      <td>{signedFeeKo(line.amount)}</td>
    </tr>
  );
}
