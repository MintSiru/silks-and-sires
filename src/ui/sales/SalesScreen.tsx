import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { StatusBadge } from '../common/Badge';
import { statusTone } from '../common/badges';
import HorseLink from '../horse/HorseLink';
import { displayName } from '../../engine/naming/register';
import { canSellToNhStore, nhStoreOpen } from '../../engine/sales/nhStore';
import { nhStoreQuote } from '../../engine/stud/nh';
import { compareDates } from '../../engine/time/calendar';
import type { GameState } from '../../engine/types';
import {
  consignErrorKo,
  consignWithdrawErrorKo,
  countryKo,
  feeKo,
  nhStoreErrorKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import {
  sellProposalEmptyKo,
  sellProposalErrorKo,
  sellProposalGuideKo,
  sellProposalPendingCount,
  sellProposalRows,
  type SellProposalRow,
} from './sellProposalView';
import {
  catalogueRows,
  consignableRows,
  consignCancelReasonKo,
  consignStatusKo,
  lotDetailView,
  patronBadge,
  saleCalendarRows,
  type CatalogueFilter,
  type ConsignableRow,
  type LotDetailView,
  type SaleCalendarRow,
} from './salesView';
import {
  defaultSalesTab,
  nearSaleCalendar,
  nearestSaleKey,
  patronProgressView,
  saleActionLabelKo,
  saleScheduleNoticeKo,
  saleSubLineKo,
  type SaleKey,
  type SalesTab,
} from './salesLayoutView';
import { LotDetail } from './SalesLotDetail';
import { PrivateMarketTab } from './PrivateMarketTab';
import { useNotify } from '../shell/notify';
import { NO_VALUE, SALES_DATA, eventOf } from './salesCommon';
import { useFillHeight } from './useFillHeight';
import './sales.css';

export { LotDetail };

/** 북 선택 상자의 '전체' 값 */
const ALL_BOOKS = 'all';
/** 화면 아래 여백(px). app.css 의 .shell-main 아래 패딩과 맞춘다. 칸 높이는 창 아래 끝에서 이만큼 뺀다. */
const SALES_BOTTOM_GAP = 16;
/** 하위 탭 순서와 문구. 기본 탭은 salesLayoutView.defaultSalesTab 이 고른다. */
const SALES_TABS: readonly (readonly [SalesTab, string])[] = [
  ['buy', '구매'],
  ['sell', '판매'],
  ['private', '개인 거래'],
];

interface SalesScreenProps {
  game: GameApi;
  /** true 면 입찰·출품 버튼과 진행 버튼을 막는다(레거시 파산). */
  locked?: boolean;
}

/** 게임이 없으면 안내만, 있으면 세일 화면을 보인다. */
export default function SalesScreen({ game, locked = false }: SalesScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>세일</h2>
        <p className="hint">먼저 '번식·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <SalesView game={game} state={game.state} locked={locked} />;
}

interface SalesViewProps {
  game: GameApi;
  state: GameState;
  locked: boolean;
}

/** 구매 탭 필터: 북 · 부 이름 · 내 입찰만 */
interface BuyFilters {
  book: string;
  query: string;
  onlyMine: boolean;
}

const EMPTY_FILTERS: BuyFilters = { book: ALL_BOOKS, query: '', onlyMine: false };

/** 세일 화면 뼈대: 후원 등급 한 줄, 구매/판매 하위 탭. 탭을 바꿔도 고른 세일과 필터는 남는다. */
function SalesView({ game, state, locked }: SalesViewProps): JSX.Element {
  const [tabPick, setTabPick] = useState<SalesTab | null>(null);
  const [picked, setPicked] = useState<SaleKey | null>(null);
  const [filters, setFilters] = useState<BuyFilters>(EMPTY_FILTERS);
  const calendar = useMemo(() => saleCalendarRows(state, SALES_DATA), [state]);
  const sellRows = useMemo(() => sellProposalRows(state, SALES_DATA), [state]);
  const consignRows = useMemo(() => consignableRows(state, SALES_DATA), [state]);
  const tab: SalesTab = tabPick ?? defaultSalesTab(sellRows.length);
  // 고른 세일이 없으면 가장 가까운 열람 가능 세일(없으면 가장 가까운 발표 전 세일)
  const active: SaleKey | null = picked ?? nearestSaleKey(calendar, state.date);
  const badge = patronBadge(state);
  const progress = patronProgressView(state);
  // 상단 바 높이가 바뀌어도 화면이 창 아래 끝에 맞도록 칸 높이를 잰다
  const screenRef = useRef<HTMLElement>(null);
  const fillHeight = useFillHeight(screenRef, SALES_BOTTOM_GAP);

  return (
    <section
      aria-label="세일"
      className="sales-screen"
      ref={screenRef}
      style={fillHeight === null ? undefined : { height: fillHeight }}
    >
      <div className="sales-head">
        <h2>세일</h2>
        <span className={progress.badgeClass} title={`후원 혜택: ${badge.benefitsKo.join(' · ')}`}>
          후원 {progress.tierKo}
        </span>
        <div className="sales-tier">
          <span className="sales-tier__next">{progress.nextKo}</span>
          <span
            className="sales-tier__bar"
            role="progressbar"
            aria-label="후원 등급 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </span>
          <span className="sales-tier__pct">{progress.percent}%</span>
          <span className="sales-tier__spend">최근 2년 구매 {progress.spendKo}</span>
        </div>
      </div>
      <nav className="tabs sales-tabs" aria-label="세일 구분">
        {SALES_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab${tab === id ? ' tab--active' : ''}`}
            aria-pressed={tab === id}
            onClick={() => setTabPick(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'buy' && (
        <BuyTab
          game={game}
          state={state}
          locked={locked}
          calendar={calendar}
          active={active}
          onPick={setPicked}
          filters={filters}
          onFilters={setFilters}
        />
      )}
      {tab === 'sell' && (
        <SellTab game={game} state={state} locked={locked} sellRows={sellRows} consignRows={consignRows} />
      )}
      {tab === 'private' && <PrivateMarketTab game={game} state={state} locked={locked} />}
    </section>
  );
}

// ── 구매 탭: 일정 · 카탈로그 · 로트 상세 ─────────────────────────

interface BuyTabProps extends SalesViewProps {
  calendar: SaleCalendarRow[];
  active: SaleKey | null;
  onPick: (key: SaleKey) => void;
  filters: BuyFilters;
  onFilters: (next: BuyFilters) => void;
}

function BuyTab({ game, state, locked, calendar, active, onPick, filters, onFilters }: BuyTabProps): JSX.Element {
  const [lotNo, setLotNo] = useState<number | null>(null);
  const detailPanel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (lotNo === null) return;
    const dialog = detailPanel.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [lotNo]);

  const activeRow =
    active === null ? undefined : calendar.find((r) => r.saleId === active.saleId && r.year === active.year);
  const catalogue =
    active === null
      ? undefined
      : state.sales.catalogues.find((c) => c.saleId === active.saleId && c.year === active.year);
  const activeEvent = active === null ? undefined : eventOf(active.saleId);
  const activeName = activeEvent?.name ?? active?.saleId ?? '';
  // 발표 전 세일은 카탈로그가 이미 만들어졌어도 후원 등급의 공개 주 전이라 보이지 않는다
  const showLots = catalogue !== undefined && activeRow?.status !== 'upcoming';
  // 로트 목록이 없고 안내 문구만 있으면 카탈로그 칸을 내용 높이만큼만 쓴다(로트 목록이 있으면 칸을 채운다)
  const catalogueCompact = !showLots;
  // 엔진 일정에서 빠진 마감 카탈로그(결과 보기용)
  const closedOnly = state.sales.catalogues.filter(
    (c) => c.status === 'closed' && !calendar.some((r) => r.saleId === c.saleId && r.year === c.year),
  );
  const near = nearSaleCalendar(calendar, state.date);

  const filter: CatalogueFilter = {
    book: filters.book === ALL_BOOKS ? undefined : Number(filters.book),
    sireQuery: filters.query,
    onlyMyBids: filters.onlyMine,
  };
  const lots =
    active === null || !showLots ? [] : catalogueRows(state, active.saleId, active.year, SALES_DATA, filter);
  const detail: LotDetailView | null =
    active === null || lotNo === null || !showLots
      ? null
      : lotDetailView(state, active.saleId, active.year, lotNo, SALES_DATA);
  const open = catalogue?.status === 'catalogued' && detail !== null && detail.result === null;
  const liveActive = open && detail !== null && compareDates(detail.saleWeek, state.date) === 0;

  const pickSale = (key: SaleKey): void => {
    onPick(key);
    setLotNo(null);
    onFilters({ ...filters, book: ALL_BOOKS });
  };

  const renderCalendar = (rows: SaleCalendarRow[]): JSX.Element => (
    <table className="data-table sales-table">
      <thead>
        <tr>
          <th>세일</th>
          <th className="sales-num">로트 수</th>
          <th>카탈로그</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const selected = active !== null && row.saleId === active.saleId && row.year === active.year;
          const newYear = index === 0 || rows[index - 1]?.year !== row.year;
          return (
            <Fragment key={`${row.saleId}-${row.year}`}>
              {newYear && (
                <tr className="sales-year-row">
                  <th colSpan={3} scope="colgroup">
                    {row.year}년
                  </th>
                </tr>
              )}
              <tr className={selected ? 'is-selected' : undefined}>
                <td>
                  <span className="sales-name">{row.name}</span>
                  <span className="sales-sub" title={`${row.companyName} · ${countryKo(row.country)}`}>
                    {saleSubLineKo(row)}
                  </span>
                </td>
                <td className="sales-num">{row.lots ?? NO_VALUE}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={selected}
                    onClick={() => pickSale({ saleId: row.saleId, year: row.year })}
                  >
                    {saleActionLabelKo(row)}
                  </button>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  const catalogueBody =
    active === null ? (
      <p className="hint">세일 일정에서 세일을 고르세요.</p>
    ) : activeRow?.status === 'upcoming' ? (
      <div className="sales-schedule">
        <p>{saleScheduleNoticeKo(activeRow)}</p>
        <p className="hint">발표 주에 카탈로그와 로트가 열리고, 판매 주까지 입찰할 수 있습니다.</p>
      </div>
    ) : catalogue === undefined ? (
      <p className="hint">이 세일의 카탈로그가 없습니다.</p>
    ) : (
      <>
        <p className="hint">
          {catalogue.status === 'catalogued'
            ? '로트를 누르면 상세가 열립니다. 판매 주까지 입찰할 수 있습니다.'
            : '마감된 세일입니다. 로트의 낙찰 결과만 볼 수 있습니다.'}
        </p>
        <div className="sales-filter">
          <label>
            북{' '}
            <select value={filters.book} onChange={(e) => onFilters({ ...filters, book: e.target.value })}>
              <option value={ALL_BOOKS}>전체</option>
              {(activeEvent?.books ?? []).map((b) => (
                <option key={b.book} value={String(b.book)}>
                  {b.book}북
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            className="search"
            placeholder="부(父) 이름 검색"
            aria-label="부 이름 검색"
            value={filters.query}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
          />
          <label>
            <input
              type="checkbox"
              checked={filters.onlyMine}
              onChange={(e) => onFilters({ ...filters, onlyMine: e.target.checked })}
            />{' '}
            내 입찰만
          </label>
        </div>
        <div className="sales-fill">
          {lots.length === 0 ? (
            <p className="hint">조건에 맞는 로트가 없습니다.</p>
          ) : (
            <table className="data-table sales-lots">
              <thead>
                <tr>
                  <th>로트</th>
                  <th>북</th>
                  <th>말</th>
                  <th>부 × 모부(외조부)</th>
                  <th>판매자</th>
                  <th>추정가</th>
                  <th>내 입찰</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((row) => (
                  <tr
                    key={row.lotNo}
                    className={row.lotNo === lotNo ? 'is-selected' : 'is-clickable'}
                    onClick={() => setLotNo(row.lotNo)}
                  >
                    <td>
                      <button type="button" className="link-btn" onClick={() => setLotNo(row.lotNo)}>
                        {row.lotNo}번
                      </button>
                    </td>
                    <td className="sales-num">{row.book}</td>
                    <td>
                      <HorseLink horseId={row.horseId} name={row.horseName} />
                      <span className="sales-sub">{row.sexAgeKo}</span>
                    </td>
                    <td>
                      <HorseLink name={row.sireName} />
                      {' × '}
                      <HorseLink name={row.damsireName} />
                      {row.surfaceNoteKo !== null && (
                        <span className="sale-surface-note"> ⚠ {row.surfaceNoteKo}</span>
                      )}
                    </td>
                    <td>{row.vendorKo}</td>
                    <td>{row.estimateKo}</td>
                    <td className="sales-num">{row.myBid === null ? NO_VALUE : feeKo(row.myBid)}</td>
                    <td>{row.resultKo ?? NO_VALUE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );

  return (
    <div className="sales-buy">
      <section className="panel" aria-label="세일 일정">
        <h2>세일 일정 · 앞으로 3개월</h2>
        <p className="hint">세일을 고르면 카탈로그가 열립니다. 발표 전 세일은 발표 주에 나옵니다.</p>
        <div className="sales-fill">
          {near.length === 0 ? (
            // 3개월 안에 세일이 없으면 전체 일정을 바로 보인다(자동 선택 세일이 이 목록에 있어야 한다)
            <>
              <p className="hint">앞으로 3개월에 세일이 없어 전체 일정을 보입니다.</p>
              {renderCalendar(calendar)}
            </>
          ) : (
            <>
              {renderCalendar(near)}
              <details className="sales-all">
                <summary>전체 일정 ({calendar.length}건)</summary>
                {renderCalendar(calendar)}
              </details>
            </>
          )}
          {closedOnly.length > 0 && (
            <>
              <h3>마감된 세일 (결과 보기)</h3>
              <ul className="sales-closed">
                {closedOnly.map((c) => (
                  <li key={`${c.saleId}-${c.year}`}>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => pickSale({ saleId: c.saleId, year: c.year })}
                    >
                      {eventOf(c.saleId)?.name ?? c.saleId} ({c.year}년) · 로트 {c.lots.length}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section
        className={catalogueCompact ? 'panel sales-catalogue--compact' : 'panel'}
        aria-label="카탈로그"
      >
        <h2>카탈로그{activeName === '' ? '' : ` · ${activeName}`}</h2>
        {catalogueBody}
      </section>

      <dialog
        ref={detailPanel}
        className="horse-detail sales-detail"
        aria-label="로트 상세"
        onCancel={(e) => {
          e.preventDefault();
          setLotNo(null);
        }}
      >
        <div className="horse-detail__head">
          <h2>로트 상세</h2>
          <button type="button" className="btn" onClick={() => setLotNo(null)}>
            로트 상세 닫기
          </button>
        </div>
        {active === null || detail === null || lotNo === null ? (
          <p className="hint">카탈로그에서 로트를 고르세요.</p>
        ) : (
          <LotDetail
            key={`${active.saleId}|${active.year}|${lotNo}`}
            game={game}
            state={state}
            saleId={active.saleId}
            year={active.year}
            detail={detail}
            event={activeEvent}
            open={open}
            liveActive={liveActive}
            locked={locked}
          />
        )}
      </dialog>
    </div>
  );
}

// ── 판매 탭: 판매 제안 · 내 말 출품 · NH 스토어 ─────────────────

interface SellTabProps extends SalesViewProps {
  sellRows: SellProposalRow[];
  consignRows: ConsignableRow[];
}

/** 배치: 위 두 칸(판매 제안 · NH 스토어)은 내용 높이, 아래 내 말 출품은 전체 폭. 개인 거래 매물은 개인 거래 탭이 맡는다 */
function SellTab({ game, state, locked, sellRows, consignRows }: SellTabProps): JSX.Element {
  return (
    <div className="sales-sell">
      <SellProposalPanel game={game} state={state} locked={locked} rows={sellRows} />
      {nhStoreOpen(state) && (
        <div className="sales-col">
          <NhStore game={game} state={state} locked={locked} />
        </div>
      )}
      <ConsignPanel game={game} locked={locked} rows={consignRows} />
    </div>
  );
}

// ── 판매 제안 칸(M6-0b2) ───────────────────────────────────────

interface SellProposalPanelProps extends SalesViewProps {
  rows: SellProposalRow[];
}

/** 판매 담당이 낸 세일 위탁 제안. 플레이어는 빼거나 지금 위탁만 한다(빼지 않으면 엔진이 마감 전 주에 위탁). */
function SellProposalPanel({ game, state, locked, rows }: SellProposalPanelProps): JSX.Element {
  const notify = useNotify();
  const autoSell = state.settings.autoSell !== false;

  const handleRemove = (row: SellProposalRow): void => {
    const result = game.removeSellProposal(row.horseId);
    if (result.ok) notify(`${row.horseName} 판매 제안을 뺐습니다.`);
    else notify(sellProposalErrorKo(result.error), 'error');
  };

  const handleConsign = (row: SellProposalRow): void => {
    const result = game.consignProposal(row.horseId);
    if (result.ok) notify(`${row.horseName} 말을 ${row.saleLabel}에 위탁했습니다.`);
    else notify(sellProposalErrorKo(result.error), 'error');
  };

  // 제안이 없으면 한 줄(제목·0두·안내)로 접는다
  if (rows.length === 0) {
    return (
      <section className="panel sell-proposals is-empty" aria-label="판매 제안">
        <p className="sales-oneline">
          <strong>판매 제안</strong>
          <span className="badge">0두</span>
          <span className="hint">{sellProposalEmptyKo()}</span>
        </p>
      </section>
    );
  }

  return (
    <section className="panel sell-proposals" aria-label="판매 제안">
      <h2>
        판매 제안 <span className="badge">{sellProposalPendingCount(rows)}두</span>
      </h2>
      <p className="hint">{sellProposalGuideKo(autoSell)}</p>
      <div className="sales-fill">
        <table className="data-table">
          <thead>
            <tr>
              <th>말</th>
              <th>세일</th>
              <th>유보가</th>
              <th>이유</th>
              <th>상태</th>
              <th>조작</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.saleId}:${row.horseId}`}>
                <td>
                  <HorseLink horseId={row.horseId} name={row.horseName} />
                </td>
                <td>{row.saleLabel}</td>
                <td>{row.reserveKo}</td>
                <td className="sales-wrap">{row.note}</td>
                <td>
                  <StatusBadge tone={statusTone(row.statusTone)} label={row.statusKo} />
                </td>
                <td>
                  {row.canRemove && (
                    <>
                      <button type="button" className="btn" onClick={() => handleRemove(row)}>
                        빼기
                      </button>{' '}
                      <button
                        type="button"
                        className="btn"
                        disabled={locked}
                        onClick={() => handleConsign(row)}
                      >
                        지금 위탁
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── 내 말 출품: 위탁 기한·취소 가능 시점을 이 칸 한곳에 둔다 ──────

interface ConsignPanelProps {
  game: GameApi;
  locked: boolean;
  rows: ConsignableRow[];
}

function ConsignPanel({ game, locked, rows }: ConsignPanelProps): JSX.Element {
  return (
    <section className="panel sales-consign" aria-label="내 말 출품">
      <h2>
        내 말 출품 <span className="badge">{rows.length}두</span>
      </h2>
      <p className="hint">
        위탁 기한 주까지 세일에 말을 올립니다. 유보가를 비우면 유보 없음입니다. 발표 주부터는 취소할 수 없습니다.
      </p>
      {rows.length === 0 ? (
        <p className="hint">출품할 내 말이 없습니다.</p>
      ) : (
        <div className="sales-fill">
          <table className="data-table">
            <thead>
              <tr>
                <th>말</th>
                <th>상태</th>
                <th>세일</th>
                <th>위탁 기한</th>
                <th>유보가(€)</th>
                <th>출품</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ConsignItem key={row.horseId} row={row} game={game} locked={locked} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface ConsignItemProps {
  row: ConsignableRow;
  game: GameApi;
  locked: boolean;
}

/** 말 한 마리의 출품 행. 세일 선택·유보가 입력·출품·출품 취소. 결과 문구는 토스트로 알린다. */
function ConsignItem({ row, game, locked }: ConsignItemProps): JSX.Element {
  const notify = useNotify();
  const [saleId, setSaleId] = useState(row.options[0]?.saleId ?? '');
  const [reserveText, setReserveText] = useState('');
  const chosen = row.options.find((o) => o.saleId === saleId) ?? row.options[0];
  const consigned = row.consignedSaleName !== null;
  // 취소 불가 사유가 있으면 버튼을 막고 사유를 title·보조 글자로 보인다(카탈로그에 올라간 말은 취소 불가)
  const cancelReason = consignCancelReasonKo(row);

  const handleConsign = (): void => {
    if (chosen === undefined) return;
    // 빈칸 = 유보 없음(null). 숫자가 아니면 엔진이 invalid_reserve 로 거절한다.
    const reserve = reserveText.trim() === '' ? null : Number(reserveText);
    const result = game.consignToSale(row.horseId, chosen.saleId, reserve);
    if (result.ok) notify(`${chosen.name} 에 출품했습니다.`);
    else notify(consignErrorKo(result.error), 'error');
  };

  const handleWithdraw = (): void => {
    const result = game.withdrawConsignment(row.horseId);
    if (result.ok) notify('출품을 취소했습니다.');
    else notify(consignWithdrawErrorKo(), 'error');
  };

  return (
    <tr>
      <td>
        <HorseLink horseId={row.horseId} name={row.horseName} />
      </td>
      <td>
        <span className="badge badge--muted">{consignStatusKo(row)}</span>
      </td>
      <td>
        {consigned ? (
          row.consignedSaleName
        ) : row.options.length === 0 ? (
          <span className="hint">출품 가능한 세일이 없습니다</span>
        ) : (
          <select
            aria-label={`${row.horseName} 출품 세일`}
            value={chosen?.saleId ?? ''}
            onChange={(e) => setSaleId(e.target.value)}
          >
            {row.options.map((o) => (
              <option key={o.saleId} value={o.saleId}>
                {o.name} · {o.kindKo}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {consigned ? (
          row.consignedDeadlineKo === null ? (
            <>
              <span>카탈로그 등록</span>
              <span className="sales-sub">취소 불가</span>
            </>
          ) : (
            <>
              <span>{row.consignedDeadlineKo}</span>
              <span className="sales-sub">이 주까지 취소 가능</span>
            </>
          )
        ) : chosen === undefined ? (
          NO_VALUE
        ) : (
          <>
            <span>{chosen.deadlineKo}</span>
            <span className="sales-sub">발표 {chosen.announceKo}</span>
            <span className="sales-sub">이후 위탁 불가</span>
          </>
        )}
      </td>
      <td>
        <input
          type="number"
          min={0}
          step={1}
          aria-label={`${row.horseName} 유보가`}
          placeholder="없음"
          value={reserveText}
          disabled={consigned}
          onChange={(e) => setReserveText(e.target.value)}
        />
      </td>
      <td>
        {/* 미출품 행은 [출품] 만, 출품된 행은 [출품 취소] 만 보인다. 카탈로그 등록 뒤에는 사유 문구만 보인다. */}
        {!consigned && (
          <button
            type="button"
            className="btn"
            disabled={locked || chosen === undefined}
            onClick={handleConsign}
          >
            출품
          </button>
        )}
        {consigned && cancelReason === null && (
          <button type="button" className="btn" onClick={handleWithdraw}>
            출품 취소
          </button>
        )}
        {consigned && cancelReason !== null && <span className="sales-sub">{cancelReason}</span>}
      </td>
    </tr>
  );
}

// ── NH 스토어 세일 ─────────────────────────────────────────────

function NhStore({ game, state, locked }: SalesViewProps): JSX.Element {
  const notify = useNotify();
  const horses = Object.values(state.horses)
    .filter((horse) => canSellToNhStore(state, horse.id) === null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    <section className="panel sales-nh" aria-label="NH 스토어 세일">
      <h2>NH 스토어 세일</h2>
      <p className="hint">3~4세 수말·거세마를 NH 시장에 판매합니다. 판매한 말은 평지 경주에서 은퇴합니다.</p>
      {horses.length === 0 ? (
        <p className="hint">판매 가능한 말이 없습니다.</p>
      ) : (
        <div className="sales-fill">
          <table className="data-table">
            <thead>
              <tr>
                <th>말</th>
                <th>견적</th>
                <th>판매</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((horse) => (
                <tr key={horse.id}>
                  <td>
                    <HorseLink horseId={horse.id} name={displayName(state, horse)} />
                  </td>
                  <td className="sales-num">{feeKo(nhStoreQuote(state, horse.id)!)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      disabled={locked}
                      onClick={() => {
                        const result = game.sellToNhStore(horse.id);
                        if (result.ok) notify('NH 시장에 판매했습니다.');
                        else notify(nhStoreErrorKo(result.error), 'error');
                      }}
                    >
                      판매
                    </button>
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
