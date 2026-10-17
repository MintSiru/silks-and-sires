import HorseLink from '../horse/HorseLink';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { GameState, Money } from '../../engine/types';
import { StatusBadge } from '../common/Badge';
import { feeKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import {
  expenseShares,
  fundsBanner,
  ledgerDisplayName,
  ledgerWeekGroups,
  operatingVerdict,
  pnlHistory,
  recentLedger,
  yearPnl,
  type LedgerWeekGroup,
  type PnlLine,
  type YearPnlView,
} from './economyView';
import './economy.css';

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

/** 금액 색: 수입·이익은 좋음 색, 지출은 보조색(중립), 적자는 위험 색 */
function incomeClass(amount: Money): string {
  if (amount > 0) return 'economy-amount economy-amount--income';
  if (amount < 0) return 'economy-amount economy-amount--expense';
  return 'economy-amount';
}

function netClass(net: Money): string {
  return net < 0 ? 'economy-amount economy-amount--danger' : 'economy-amount economy-amount--income';
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface EconomyScreenProps {
  game: GameApi;
}

/** 게임이 없으면 안내만, 있으면 경영(장부) 화면을 보인다. */
export default function EconomyScreen({ game }: EconomyScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>경제</h2>
        <p className="hint">먼저 '번식·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <EconomyView state={game.state} />;
}

function EconomyView({ state }: { state: GameState }): JSX.Element {
  const history = useMemo(() => pnlHistory(state), [state]);
  const ledger = useMemo(() => recentLedger(state), [state]);
  const weeks = useMemo(() => ledgerWeekGroups(ledger), [ledger]);
  /** 지난 해 선택(null 이면 올해) */
  const [yearPick, setYearPick] = useState<number | null>(null);

  // 지난 해 목록은 최근 해가 위로 오게 뒤집는다
  const pastYears = useMemo(() => history.map((h) => h.year).reverse(), [history]);
  const selectedYear = yearPick !== null && pastYears.includes(yearPick) ? yearPick : null;
  const pnl = useMemo(
    () => (selectedYear === null ? yearPnl(state) : yearPnl(state, selectedYear)),
    [state, selectedYear],
  );
  const banner = fundsBanner(state);
  const verdict = pnl === null ? null : operatingVerdict({
    net: pnl.net,
    funds: banner.funds,
    debt: banner.debt,
    bankrupt: state.economy.bankrupt,
  });
  const period = pnl === null ? NO_VALUE : pnl.current ? '올해' : `${pnl.year}년`;

  return (
    <section className="economy-screen" aria-label="경제">
      <div className="economy-kpis">
        <KpiTile label={`${period} 총수입`} value={pnl === null ? NO_VALUE : signedFeeKo(pnl.incomeTotal)}
          className="economy-kpi--income" />
        <KpiTile label={`${period} 총지출`} value={pnl === null ? NO_VALUE : signedFeeKo(pnl.expenseTotal)}
          className="economy-kpi--expense" />
        <KpiTile label={`${period} 순손익`} value={pnl === null ? NO_VALUE : signedFeeKo(pnl.net)}
          className={pnl !== null && pnl.net < 0 ? 'economy-kpi--net-neg' : 'economy-kpi--net-pos'} />
        <div className="economy-verdict" title="순손익·현재 자금·빚 기준">
          <p className="economy-verdict__label">운영 판정</p>
          {verdict !== null && <StatusBadge tone={verdict.tone} label={verdict.label} />}
        </div>
      </div>

      <div className="economy-body">
        <section className="panel economy-pnl">
          <div className="economy-pnl__head">
            <h2>손익 ({pnl === null ? NO_VALUE : `${pnl.year}년${pnl.current ? ' · 올해' : ''}`})</h2>
            <label className="economy-year">
              연도{' '}
              <select
                value={selectedYear === null ? CURRENT_YEAR_VALUE : String(selectedYear)}
                onChange={(e) =>
                  setYearPick(e.target.value === CURRENT_YEAR_VALUE ? null : Number(e.target.value))
                }
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

        <section className="panel economy-ledger">
          <h2>최근 장부</h2>
          <p className="hint">주별로 묶었습니다. 펼치면 개별 거래를 봅니다.</p>
          {weeks.length === 0 ? (
            <p className="hint">아직 장부에 남은 거래가 없습니다.</p>
          ) : (
            <div className="table-scroll economy-scroll economy-ledger__list">
              {weeks.map((group) => (
                <LedgerWeek key={group.key} group={group} />
              ))}
            </div>
          )}
        </section>
      </div>

      <details className="panel economy-history">
        <summary>연도별 추이</summary>
        <p className="hint">지난 해의 순익과 연말 자금·빚입니다.</p>
        {history.length === 0 ? (
          <p className="hint">아직 한 해가 끝나지 않았습니다.</p>
        ) : (
          <div className="table-scroll economy-scroll">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>연도</th>
                  <th>순익</th>
                  <th className="num--right">연말 자금</th>
                  <th className="num--right">연말 빚</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.year}>
                    <td>{row.year}</td>
                    <td>
                      <div className="economy-history__net">
                        <span className={netClass(row.net)}>{signedFeeKo(row.net)}</span>
                        <span className="economy-bar" aria-hidden="true">
                          <span
                            className={`economy-bar__fill ${row.positive ? 'economy-bar__fill--good' : 'economy-bar__fill--danger'}`}
                            style={{ width: `${row.barPercent}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="num num--right">{feeKo(row.playerFunds)}</td>
                    <td className="num num--right">{feeKo(row.playerDebt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  );
}

function KpiTile({ label, value, className }: { label: string; value: string; className: string }): JSX.Element {
  return (
    <article className={`economy-kpi ${className}`}>
      <p className="economy-kpi__label">{label}</p>
      <p className="economy-kpi__value num">{value}</p>
    </article>
  );
}

/** 손익표: 수입 행 → 수입 합계 → 지출 행(비중 막대) → 지출 합계 → 순익 */
function PnlTable({ pnl }: { pnl: YearPnlView }): JSX.Element {
  if (pnl.income.length === 0 && pnl.expense.length === 0) {
    return <p className="hint">이 해에는 아직 거래가 없습니다.</p>;
  }
  const shares = expenseShares(pnl.expense, pnl.expenseTotal);
  return (
    <div className="table-scroll economy-scroll">
      <table className="economy-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>종류</th>
            <th className="num--right">금액</th>
            <th>지출 비중</th>
          </tr>
        </thead>
        <tbody>
          {pnl.income.map((line) => (
            <PnlRow key={`in-${line.category}`} line={line} />
          ))}
          <tr className="economy-sum">
            <td>수입 합계</td>
            <td />
            <td className={`num num--right ${incomeClass(pnl.incomeTotal)}`}>{signedFeeKo(pnl.incomeTotal)}</td>
            <td />
          </tr>
          {shares.map((share) => (
            <tr key={`out-${share.category}`}>
              <td>지출</td>
              <td>{share.label}</td>
              <td className={`num num--right ${incomeClass(share.amount)}`}>{signedFeeKo(share.amount)}</td>
              <td>
                <span className="economy-share" aria-hidden="true">
                  <span className="economy-share__fill" style={{ width: `${share.percent}%` }} />
                </span>
                <span className="num">{share.percent}%</span>
              </td>
            </tr>
          ))}
          <tr className="economy-sum">
            <td>지출 합계</td>
            <td />
            <td className={`num num--right ${incomeClass(pnl.expenseTotal)}`}>{signedFeeKo(pnl.expenseTotal)}</td>
            <td />
          </tr>
          <tr className="economy-net">
            <td>
              <strong>순익</strong>
            </td>
            <td />
            <td className={`num num--right ${netClass(pnl.net)}`}>
              <strong>{signedFeeKo(pnl.net)}</strong>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PnlRow({ line }: { line: PnlLine }): JSX.Element {
  return (
    <tr>
      <td>수입</td>
      <td>{ledgerDisplayName(line.category)}</td>
      <td className={`num num--right ${incomeClass(line.amount)}`}>{signedFeeKo(line.amount)}</td>
      <td />
    </tr>
  );
}

/** 주별 묶음 한 줄. 펼치면 그 주의 개별 거래가 보인다. */
function LedgerWeek({ group }: { group: LedgerWeekGroup }): JSX.Element {
  return (
    <details className="economy-week">
      <summary>
        <span className="economy-week__date">{group.dateLabel}</span>
        <span className="economy-week__count">{group.rows.length}건</span>
        <span className={`num num--right ${incomeClass(group.net)}`}>{signedFeeKo(group.net)}</span>
      </summary>
      <table className="economy-table economy-table--rows">
        <tbody>
          {group.rows.map((row, index) => (
            <tr key={`${group.key}-${index}`}>
              <td>{ledgerDisplayName(row.category)}</td>
              <td className={`num num--right ${incomeClass(row.amount)}`}>{signedFeeKo(row.amount)}</td>
              <td>
                <HorseLink name={row.horseName ?? NO_VALUE} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
