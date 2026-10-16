import { inspectOfferHorse } from '../../engine/sales/privateTrade';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { getSalesData, getSireLines } from '../../engine/data/staticData';
import { bidIncrement } from '../../engine/sales/auction';
import { liveAuctionSteps } from '../../engine/sales/bidding';
import { eligibleInspectors, inspectLot } from '../../engine/sales/inspection';
import type { SalesStaticData } from '../../engine/sales/system';
import { ageInYear, compareDates, formatDateKo } from '../../engine/time/calendar';
import type { Assessment, GameState, HorseId, Money, SaleEventDef } from '../../engine/types';
import HorseCard from '../breeding/HorseCard';
import {
  bidErrorKo,
  bidMinimumKo,
  clearBidErrorKo,
  consignErrorKo,
  consignWithdrawErrorKo,
  countryKo,
  feeKo,
  inspectErrorKo,
  privateOfferErrorKo,
  inspectNoneKo,
  liveClosedKo,
  liveFinalNoticeKo,
  saleAnnounceKo,
  saleStatusKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import {
  patronBadge,
  privateOfferRows,
  catalogueRows,
  consignableRows,
  lotDetailView,
  liveAuctionView,
  saleCalendarRows,
  type CatalogueFilter,
  type ConsignableRow,
  type LotDetailView,
} from './salesView';

/** 세일 정적 데이터(useGame 과 같은 원천). 화면은 세일 이름·호가·북 정보만 쓴다. */
const SALES_DATA: SalesStaticData = { sales: getSalesData() };
/** 계통 id → 계통 표시명 */
const SIRE_LINE_LABEL: ReadonlyMap<string, string> = new Map(
  getSireLines().map((line) => [line.id, line.label]),
);
/** 값이 없을 때 칸을 채우는 표기 */
const NO_VALUE = '—';
/** 북 선택 상자의 '전체' 값 */
const ALL_BOOKS = 'all';
/** 실시간 보기 첫 단계 번호. 화면 연출 값(밸런스 아님) */
const FIRST_STEP = 1;
/** 실시간 보기 한 단계 표시 간격(ms). 화면 연출 값(밸런스 아님) */
const LIVE_STEP_MS = 400;

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/** 화면에서 고른 세일(saleId + 카탈로그 연도) */
interface SaleKey {
  saleId: string;
  year: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.';
}

function eventOf(saleId: string): SaleEventDef | undefined {
  return SALES_DATA.sales?.events.find((e) => e.id === saleId);
}

function lineLabelOf(sireLineId: string | null): string {
  if (sireLineId === null) return NO_VALUE;
  return SIRE_LINE_LABEL.get(sireLineId) ?? sireLineId;
}

function nameOrDash(state: GameState, id: HorseId | null): string {
  if (id === null) return NO_VALUE;
  return state.horses[id]?.name ?? NO_VALUE;
}

function NoticeLine({ notice }: { notice: Notice | null }): JSX.Element | null {
  if (notice === null) return null;
  return (
    <p className={`notice notice--${notice.tone}`} role="status">
      {notice.text}
    </p>
  );
}

// ── 화면 진입점 ─────────────────────────────────────────────────

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

function SalesView({ game, state, locked }: SalesViewProps): JSX.Element {
  const [picked, setPicked] = useState<SaleKey | null>(null);
  const [lotNo, setLotNo] = useState<number | null>(null);
  const [book, setBook] = useState(ALL_BOOKS);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [advanceNotice, setAdvanceNotice] = useState<Notice | null>(null);

  const owner = state.owners[state.playerOwnerId];
  const badge = patronBadge(state);
  const calendar = useMemo(() => saleCalendarRows(state, SALES_DATA), [state]);
  const consignRows = useMemo(() => consignableRows(state, SALES_DATA), [state]);

  // 고른 세일이 없으면 판매 중인 카탈로그를 연다
  const openCatalogue = state.sales.catalogues.find((c) => c.status === 'catalogued');
  const active: SaleKey | null =
    picked ??
    (openCatalogue === undefined ? null : { saleId: openCatalogue.saleId, year: openCatalogue.year });
  const activeRow =
    active === null ? undefined : calendar.find((r) => r.saleId === active.saleId && r.year === active.year);
  const catalogue =
    active === null
      ? undefined
      : state.sales.catalogues.find((c) => c.saleId === active.saleId && c.year === active.year);
  const activeEvent = active === null ? undefined : eventOf(active.saleId);
  const activeName = activeEvent?.name ?? active?.saleId ?? '';
  // 엔진 일정에서 빠진 마감 카탈로그(결과 보기용)
  const closedOnly = state.sales.catalogues.filter(
    (c) => c.status === 'closed' && !calendar.some((r) => r.saleId === c.saleId && r.year === c.year),
  );

  const filter: CatalogueFilter = {
    book: book === ALL_BOOKS ? undefined : Number(book),
    sireQuery: query,
    onlyMyBids: onlyMine,
  };
  const lots =
    active === null || catalogue === undefined
      ? []
      : catalogueRows(state, active.saleId, active.year, SALES_DATA, filter);

  const detail: LotDetailView | null =
    active === null || lotNo === null ? null : lotDetailView(state, active.saleId, active.year, lotNo, SALES_DATA);
  const open = catalogue?.status === 'catalogued' && detail !== null && detail.result === null;
  const liveActive = open && detail !== null && compareDates(detail.saleWeek, state.date) === 0;

  const pickSale = (key: SaleKey): void => {
    setPicked(key);
    setLotNo(null);
    setBook(ALL_BOOKS);
  };

  const advanceBy = (weeks: number): void => {
    try {
      game.advance(weeks);
      setAdvanceNotice({ tone: 'ok', text: `${weeks}주 진행했습니다.` });
    } catch (error) {
      setAdvanceNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  return (
    <section aria-label="세일">
      <header className="topbar panel">
        <div className="topbar__info">
          <span className="topbar__date">{formatDateKo(state.date)}</span>
          <span>마주 {owner?.name ?? NO_VALUE}</span>
          <span>자금 {feeKo(owner?.funds ?? 0)}</span>
        </div>
        <p className="hint">
          위에서 아래로: 개인 거래 제안 → 세일 일정 → 카탈로그 → 로트 상세(검사·입찰·실시간 보기). 맨 아래에서 내 말을 출품합니다.
          {' '}<span className="badge">후원 {badge.tierKo}</span>
        </p>
        <p className="hint">최근 2년 구매액 {badge.spendKo} · {badge.nextKo} · {badge.benefitsKo.join(' · ')}</p>
        <div className="topbar__buttons">
          <button type="button" className="btn" disabled={locked} onClick={() => advanceBy(1)}>
            1주 진행
          </button>
          <button type="button" className="btn" disabled={locked} onClick={() => advanceBy(4)}>
            4주 진행
          </button>
        </div>
        <NoticeLine notice={advanceNotice} />
      </header>

      <section className="panel">
        <h2>개인 거래 제안</h2>
        <PrivateOffers game={game} state={state} locked={locked} />
      </section>

      <section className="panel">
        <h2>세일 일정</h2>
        <p className="hint">세일을 누르면 카탈로그가 열립니다. 발표 전 세일은 발표 주에 카탈로그가 나옵니다.</p>
        {calendar.length === 0 ? (
          <p className="hint">세일 일정이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>세일</th>
                  <th>종류</th>
                  <th>월</th>
                  <th>상태</th>
                  <th>로트</th>
                  <th>내 입찰</th>
                  <th>내 위탁</th>
                </tr>
              </thead>
              <tbody>
                {calendar.map((row) => {
                  const selected = active !== null && row.saleId === active.saleId && row.year === active.year;
                  return (
                    <tr
                      key={`${row.saleId}-${row.year}`}
                      className={selected ? 'is-selected' : 'is-clickable'}
                      onClick={() => pickSale({ saleId: row.saleId, year: row.year })}
                    >
                      <td>
                        {row.name}
                        <br />
                        <span className="sales-sub">
                          {row.companyName} · {countryKo(row.country)} · {row.year}년
                        </span>
                      </td>
                      <td>{row.kindKo}</td>
                      <td>{row.monthKo}</td>
                      <td>{row.statusKo}</td>
                      <td>{row.lots ?? NO_VALUE}</td>
                      <td>{row.myBids}</td>
                      <td>{row.myConsignments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
      </section>

      <div className="sales-layout">
        <section className="panel">
          <h2>카탈로그{activeName === '' ? '' : ` · ${activeName}`}</h2>
          {active === null ? (
            <p className="hint">세일 일정에서 세일을 고르세요.</p>
          ) : catalogue === undefined ? (
            activeRow !== undefined && activeRow.statusKo === saleStatusKo('upcoming') ? (
              <p className="hint">{saleAnnounceKo(activeRow.year, state.date.year, activeRow.announceWeek)}</p>
            ) : (
              <p className="hint">이 세일의 카탈로그가 없습니다.</p>
            )
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
                  <select value={book} onChange={(e) => setBook(e.target.value)}>
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
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label>
                  <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />{' '}
                  내 입찰만
                </label>
              </div>
              {lots.length === 0 ? (
                <p className="hint">조건에 맞는 로트가 없습니다.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>로트</th>
                        <th>북</th>
                        <th>말</th>
                        <th>성별·나이</th>
                        <th>부</th>
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
                          <td>{row.lotNo}</td>
                          <td>{row.book}</td>
                          <td>
                            <button type="button" className="link-btn" onClick={() => setLotNo(row.lotNo)}>
                              {row.horseName}
                            </button>
                          </td>
                          <td>{row.sexAgeKo}</td>
                          <td>
                            {row.sireName}
                            {row.surfaceNoteKo !== null && <span className="sale-surface-note"> ⚠ {row.surfaceNoteKo}</span>}
                          </td>
                          <td>{row.vendorKo}</td>
                          <td>{row.estimateKo}</td>
                          <td>{row.myBid === null ? NO_VALUE : feeKo(row.myBid)}</td>
                          <td>{row.resultKo ?? NO_VALUE}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel sales-detail">
          <h2>로트 상세</h2>
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
        </section>
      </div>

      <section className="panel">
        <h2>내 말 출품 ({consignRows.length}두)</h2>
        <p className="hint">
          발표 주 전에 세일을 골라 말을 올립니다. 유보가를 비우면 유보 없음입니다. 발표 뒤에는 취소할 수 없습니다.
        </p>
        {consignRows.length === 0 ? (
          <p className="hint">출품할 내 말이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>말</th>
                  <th>출품 상태</th>
                  <th>세일</th>
                  <th>유보가(€)</th>
                  <th>출품</th>
                </tr>
              </thead>
              <tbody>
                {consignRows.map((row) => (
                  <ConsignItem key={row.horseId} row={row} game={game} locked={locked} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

// ── 로트 상세 ───────────────────────────────────────────────────

interface LotDetailProps {
  game: GameApi;
  state: GameState;
  saleId: string;
  year: number;
  detail: LotDetailView;
  event: SaleEventDef | undefined;
  /** 카탈로그가 진행 중이고 이 로트가 아직 팔리지 않았다 */
  open: boolean;
  /** 판매 주이고 로트가 열려 있다(실시간 보기 활성) */
  liveActive: boolean;
  locked: boolean;
}

function LotDetail({ game, state, saleId, year, detail, event, open, liveActive, locked }: LotDetailProps): JSX.Element {
  const lotNo = detail.lot.lotNo;
  return (
    <>
      <h3>
        {lotNo}번 {detail.lot.horseName}
      </h3>
      <dl className="sales-facts">
        <dt>부</dt>
        <dd>
          {detail.sireName}
          {detail.surfaceNoteKo !== null && <span className="sale-surface-note"> ⚠ {detail.surfaceNoteKo}</span>}
        </dd>
        <dt>모</dt>
        <dd>{detail.damName}</dd>
        <dt>판매자</dt>
        <dd>{detail.vendorKo}</dd>
        <dt>판매일</dt>
        <dd>{detail.saleDateKo}</dd>
        <dt>추정가</dt>
        <dd>{detail.estimateKo}</dd>
        {detail.reserveKo !== null && (
          <>
            <dt>유보가</dt>
            <dd>{detail.reserveKo}</dd>
          </>
        )}
      </dl>
      <InspectBox state={state} saleId={saleId} year={year} lotNo={lotNo} horseId={detail.lot.horseId} />
      <BidBox
        game={game}
        saleId={saleId}
        year={year}
        lotNo={lotNo}
        myBid={detail.myBid}
        event={event}
        open={open}
        locked={locked}
      />
      <LiveBox
        game={game}
        state={state}
        saleId={saleId}
        year={year}
        lotNo={lotNo}
        myBid={detail.myBid}
        active={liveActive}
        dateKo={formatDateKo(detail.saleWeek)}
        locked={locked}
      />
    </>
  );
}

type InspectView = { ok: true; assessment: Assessment; trainerName: string } | { ok: false; text: string };

interface InspectBoxProps {
  state: GameState;
  saleId: string;
  year: number;
  lotNo: number;
  horseId: HorseId;
}

/** 조교사 검사: 동행 가능한 조교사를 고르고 소견을 HorseCard 로 보인다 */
function InspectBox(props: InspectBoxProps | { state: GameState; horseId: HorseId; offerId: string }): JSX.Element {
  const { state, horseId } = props;
  const eligible = useMemo(() => eligibleInspectors(state), [state]);
  const [pickId, setPickId] = useState<string | null>(null);
  const [view, setView] = useState<InspectView | null>(null);
  const picked = eligible.find((e) => e.trainerId === pickId) ?? eligible[0];
  const horse = state.horses[horseId];

  const handleInspect = (): void => {
    if (picked === undefined) return;
    if ('offerId' in props) {
      const result = inspectOfferHorse(state, props.offerId, picked.trainerId);
      if (result.ok) setView({ ok: true, assessment: result.assessment, trainerName: picked.name });
      else setView({ ok: false, text: privateOfferErrorKo(result.error) });
    } else {
      const result = inspectLot(state, props.saleId, props.year, props.lotNo, picked.trainerId);
      if (result.ok) setView({ ok: true, assessment: result.assessment, trainerName: picked.name });
      else setView({ ok: false, text: inspectErrorKo(result.error) });
    }
  };

  return (
    <section className="sales-block">
      <h3>조교사 검사</h3>
      <p className="hint">동행할 조교사를 고르면 그 사람의 소견을 얻습니다. 검사에는 돈이 들지 않습니다.</p>
      {eligible.length === 0 ? (
        <p className="hint">{inspectNoneKo()}</p>
      ) : (
        <div className="sales-inline">
          <select
            aria-label="검사 조교사"
            value={picked?.trainerId ?? ''}
            onChange={(e) => setPickId(e.target.value)}
          >
            {eligible.map((e) => (
              <option key={e.trainerId} value={e.trainerId}>
                {e.name} ({e.reason === 'retained' ? '전속' : '관계'})
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={handleInspect}>
            검사
          </button>
        </div>
      )}
      {view !== null && !view.ok && (
        <p className="notice notice--error" role="status">
          {view.text}
        </p>
      )}
      {view !== null && view.ok && horse !== undefined && (
        <>
          <p className="hint">{view.trainerName} 의 소견</p>
          <HorseCard
            horse={horse}
            assessment={view.assessment}
            ageYears={ageInYear(horse.birthYear, state.date.year)}
            parentage={{
              sire: nameOrDash(state, horse.sireId),
              dam: nameOrDash(state, horse.damId),
              damsire: nameOrDash(state, horse.damId === null ? null : (state.horses[horse.damId]?.sireId ?? null)),
            }}
            lineLabel={lineLabelOf(horse.sireLineId)}
          />
        </>
      )}
    </section>
  );
}

interface BidBoxProps {
  game: GameApi;
  saleId: string;
  year: number;
  lotNo: number;
  myBid: Money | null;
  event: SaleEventDef | undefined;
  open: boolean;
  locked: boolean;
}

/** 입찰: 상한을 걸거나 취소한다. 실패 사유는 bidErrorKo 로 바로 보인다. */
function BidBox({ game, saleId, year, lotNo, myBid, event, open, locked }: BidBoxProps): JSX.Element {
  const [amountText, setAmountText] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const handleBid = (): void => {
    // 빈칸은 NaN 으로 넘겨 엔진이 invalid_amount 로 거절하게 한다
    const amount = amountText.trim() === '' ? Number.NaN : Number(amountText);
    const result = game.setMaxBid(saleId, year, lotNo, amount);
    if (result.ok) setNotice({ tone: 'ok', text: `상한 ${feeKo(amount)} 로 입찰했습니다.` });
    else setNotice({ tone: 'error', text: bidErrorKo(result.error) });
  };

  const handleClear = (): void => {
    const result = game.clearMaxBid(saleId, year, lotNo);
    if (result.ok) setNotice({ tone: 'ok', text: '입찰 상한을 취소했습니다.' });
    else setNotice({ tone: 'error', text: clearBidErrorKo() });
  };

  return (
    <section className="sales-block">
      <h3>입찰</h3>
      <p className="hint">
        {open && event !== undefined
          ? `${bidMinimumKo(event.minimumBid)}. 상한을 걸면 경매에서 상한 안에서 자동으로 응찰합니다.`
          : '마감된 로트는 입찰할 수 없습니다.'}
      </p>
      <p>현재 내 상한: {myBid === null ? '없음' : feeKo(myBid)}</p>
      <div className="sales-inline">
        <input
          type="number"
          inputMode="numeric"
          min={event?.minimumBid}
          step={1}
          aria-label="입찰 상한"
          placeholder="€ 금액"
          value={amountText}
          disabled={!open}
          onChange={(e) => setAmountText(e.target.value)}
        />
        <button type="button" className="btn" disabled={locked || !open} onClick={handleBid}>
          상한 설정
        </button>
        <button type="button" className="btn" disabled={locked || !open || myBid === null} onClick={handleClear}>
          입찰 취소
        </button>
      </div>
      <NoticeLine notice={notice} />
    </section>
  );
}

interface LiveBoxProps {
  game: GameApi;
  state: GameState;
  saleId: string;
  year: number;
  lotNo: number;
  myBid: Money | null;
  /** 판매 주이고 로트가 열려 있을 때만 true */
  active: boolean;
  dateKo: string;
  locked: boolean;
}

/**
 * 실시간 보기: 호가 단계를 LIVE_STEP_MS 간격으로 하나씩 보인다.
 * '+ 한 호가 올리기' 는 상한을 (현재 가격 + 호가 단위)로 올리고, 단계를 다시 계산해 이어 보여 준다.
 * 타이머는 effect 에서 만들고 cleanup 에서 지운다(화면 해제·판매 주 종료·단계 변경 때).
 */
function LiveBox({ game, state, saleId, year, lotNo, myBid, active, dateKo, locked }: LiveBoxProps): JSX.Element {
  const [shown, setShown] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // 화면 문구용 단계(liveAuctionView)와 호가 계산용 원시 단계(liveAuctionSteps)는 같은 입력에서 나온다
  const live = useMemo(
    () => liveAuctionView(state, saleId, year, lotNo, myBid, SALES_DATA),
    [state, saleId, year, lotNo, myBid],
  );
  const rawSteps = useMemo(
    () => liveAuctionSteps(state, saleId, year, lotNo, myBid, SALES_DATA),
    [state, saleId, year, lotNo, myBid],
  );
  const total = live.steps.length;
  const visible = shown === null ? 0 : Math.min(shown, total);
  const running = active && shown !== null && visible < total;
  const finished = shown !== null && visible >= total;

  useEffect(() => {
    if (!active || shown === null || shown >= total) return undefined;
    const id = window.setTimeout(() => setShown(shown + 1), LIVE_STEP_MS);
    return () => window.clearTimeout(id);
  }, [active, shown, total]);

  const raise = (): void => {
    const current = rawSteps[visible - 1];
    if (current === undefined) return;
    const target = current.price + bidIncrement(current.price);
    if (myBid !== null && target <= myBid) {
      setNotice({
        tone: 'error',
        text: `지금 상한 ${feeKo(myBid)} 이 다음 호가 ${feeKo(target)} 보다 높아 올릴 필요가 없습니다.`,
      });
      return;
    }
    const result = game.setMaxBid(saleId, year, lotNo, target);
    if (result.ok) setNotice({ tone: 'ok', text: `상한을 ${feeKo(target)} 로 올렸습니다. 이어서 보여 줍니다.` });
    else setNotice({ tone: 'error', text: bidErrorKo(result.error) });
  };

  return (
    <section className={`sales-block sales-live${active && shown !== null ? ' sales-live--active' : ''}`}>
      <h3>실시간 보기</h3>
      <p className="hint">{liveFinalNoticeKo()}</p>
      {!active && <p className="hint">{liveClosedKo(dateKo)}</p>}
      <div className="sales-inline">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!active || running}
          onClick={() => setShown(FIRST_STEP)}
        >
          {shown === null ? '실시간 보기' : '처음부터 다시 보기'}
        </button>
        <button type="button" className="btn" disabled={locked || !running} onClick={raise}>
          + 한 호가 올리기
        </button>
      </div>
      {active && shown !== null && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>단계</th>
                <th>가격</th>
                <th>선두</th>
                <th>이탈</th>
              </tr>
            </thead>
            <tbody>
              {live.steps.slice(0, visible).map((step, index) => (
                <tr key={index} className={index === visible - 1 ? 'is-current' : undefined}>
                  <td>{index + 1}</td>
                  <td>{step.priceKo}</td>
                  <td>{step.leaderKo}</td>
                  <td>{step.droppedKo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {finished && (
            <p className="sales-live__result" role="status">
              {live.resultKo}
            </p>
          )}
        </>
      )}
      <NoticeLine notice={notice} />
    </section>
  );
}

// ── 내 말 출품 ──────────────────────────────────────────────────

interface ConsignItemProps {
  row: ConsignableRow;
  game: GameApi;
  locked: boolean;
}

/** 말 한 마리의 출품 행. 세일 선택·유보가 입력·출품·출품 취소, 결과 문구는 행 안에 보인다. */
function ConsignItem({ row, game, locked }: ConsignItemProps): JSX.Element {
  const [saleId, setSaleId] = useState(row.options[0]?.saleId ?? '');
  const [reserveText, setReserveText] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const chosen = row.options.find((o) => o.saleId === saleId) ?? row.options[0];
  const consigned = row.consignedSaleName !== null;

  const handleConsign = (): void => {
    if (chosen === undefined) return;
    // 빈칸 = 유보 없음(null). 숫자가 아니면 엔진이 invalid_reserve 로 거절한다.
    const reserve = reserveText.trim() === '' ? null : Number(reserveText);
    const result = game.consignToSale(row.horseId, chosen.saleId, reserve);
    if (result.ok) setNotice({ tone: 'ok', text: `${chosen.name} 에 출품했습니다.` });
    else setNotice({ tone: 'error', text: consignErrorKo(result.error) });
  };

  const handleWithdraw = (): void => {
    const result = game.withdrawConsignment(row.horseId);
    if (result.ok) setNotice({ tone: 'ok', text: '출품을 취소했습니다.' });
    else setNotice({ tone: 'error', text: consignWithdrawErrorKo() });
  };

  return (
    <tr>
      <td>{row.horseName}</td>
      <td>{row.consignedSaleName ?? NO_VALUE}</td>
      <td>
        {row.options.length === 0 ? (
          <span className="hint">출품 가능한 세일이 없습니다</span>
        ) : (
          <select
            aria-label={`${row.horseName} 출품 세일`}
            value={chosen?.saleId ?? ''}
            disabled={consigned}
            onChange={(e) => setSaleId(e.target.value)}
          >
            {row.options.map((o) => (
              <option key={o.saleId} value={o.saleId}>
                {o.name} · {o.kindKo} · 발표 {o.announceWeek}주
              </option>
            ))}
          </select>
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
        <button
          type="button"
          className="btn"
          disabled={locked || consigned || chosen === undefined}
          onClick={handleConsign}
        >
          출품
        </button>{' '}
        <button type="button" className="btn" disabled={!consigned} onClick={handleWithdraw}>
          출품 취소
        </button>
        <NoticeLine notice={notice} />
      </td>
    </tr>
  );
}

function PrivateOffers({ game, state, locked }: SalesViewProps): JSX.Element {
  const rows = privateOfferRows(state);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const inspected = rows.find((row) => row.offerId === inspectId);
  const act = (offerId: string, buy: boolean): void => {
    const row = rows.find((entry) => entry.offerId === offerId);
    if (buy && (locked || !window.confirm(`${row?.horseName ?? ''}을 ${row?.priceKo ?? ''}에 구매합니다. 계속할까요?`))) return;
    const result = buy ? game.acceptPrivateOffer(offerId) : game.declinePrivateOffer(offerId);
    setNotice(result.ok
      ? { tone: 'ok', text: buy ? '구매했습니다.' : '제안을 거절했습니다.' }
      : { tone: 'error', text: privateOfferErrorKo(result.error) });
  };
  return <>
    <NoticeLine notice={notice} />
    {rows.length === 0 ? <p className="hint">관계가 좋은 오너브리더가 1~3월에 유망주를 개인적으로 제안합니다(관계 20 이상 또는 명성 35 이상)</p> :
      <div className="table-scroll"><table>
        <thead><tr>{['말', '성별 나이', '부', '제안 마주', '가격', '추정가', '기한', '행동'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.offerId}>
          <td>{row.horseName}</td><td>{row.sexAgeKo}</td><td>{row.sireName}</td><td>{row.ownerName}</td>
          <td>{row.priceKo}</td><td>{row.estimateKo}</td><td>{row.expiresKo}</td>
          <td><button type="button" className="btn" onClick={() => setInspectId(row.offerId)}>조교사 검사</button>
            <button type="button" className="btn" disabled={locked} onClick={() => act(row.offerId, true)}>구매</button>
            <button type="button" className="btn" onClick={() => act(row.offerId, false)}>거절</button></td>
        </tr>)}</tbody>
      </table></div>}
    {inspected !== undefined && <InspectBox key={inspected.offerId} state={state} horseId={inspected.horseId} offerId={inspected.offerId} />}
  </>;
}
