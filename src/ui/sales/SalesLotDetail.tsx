import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getSireLines } from '../../engine/data/staticData';
import { bidIncrement } from '../../engine/sales/auction';
import { liveAuctionSteps } from '../../engine/sales/bidding';
import { eligibleInspectors, inspectLot } from '../../engine/sales/inspection';
import { inspectOfferHorse } from '../../engine/sales/privateTrade';
import type { SaleEventDef, Assessment, GameState, HorseId, Money } from '../../engine/types';
import { ageInYear, formatDateKo } from '../../engine/time/calendar';
import HorseCard from '../breeding/HorseCard';
import { parentageOf } from '../breeding/pedigreeNames';
import HorseLink from '../horse/HorseLink';
import {
  bidErrorKo,
  bidMinimumKo,
  clearBidErrorKo,
  feeKo,
  inspectErrorKo,
  inspectNoneKo,
  liveClosedKo,
  liveFinalNoticeKo,
  privateOfferErrorKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import { NO_VALUE, NoticeLine, SALES_DATA, type Notice } from './salesCommon';
import { liveAuctionView, type LotDetailView } from './salesView';

/** 계통 id → 계통 표시명 */
const SIRE_LINE_LABEL: ReadonlyMap<string, string> = new Map(
  getSireLines().map((line) => [line.id, line.label]),
);
/** 실시간 보기 첫 단계 번호. 화면 연출 값(밸런스 아님) */
const FIRST_STEP = 1;
/** 실시간 보기 한 단계 표시 간격(ms). 화면 연출 값(밸런스 아님) */
const LIVE_STEP_MS = 400;

function lineLabelOf(sireLineId: string | null): string {
  if (sireLineId === null) return NO_VALUE;
  return SIRE_LINE_LABEL.get(sireLineId) ?? sireLineId;
}

export interface LotDetailProps {
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

/** 로트 상세: 부·모·판매 정보, 조교사 검사, 입찰 상한, 실시간 보기 */
export function LotDetail({
  game,
  state,
  saleId,
  year,
  detail,
  event,
  open,
  liveActive,
  locked,
}: LotDetailProps): JSX.Element {
  const lotNo = detail.lot.lotNo;
  return (
    <>
      <h3>
        {lotNo}번 <HorseLink horseId={detail.lot.horseId} name={detail.lot.horseName} />
      </h3>
      <dl className="sales-facts">
        <dt>부</dt>
        <dd>
          <HorseLink name={detail.sireName} />
          {detail.surfaceNoteKo !== null && (
            <span className="sale-surface-note"> ⚠ {detail.surfaceNoteKo}</span>
          )}
        </dd>
        <dt>모</dt>
        <dd>
          <HorseLink name={detail.damName} />
        </dd>
        <dt>모부(외조부)</dt>
        <dd><HorseLink name={detail.damsireName} /></dd>
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
export function InspectBox(
  props: InspectBoxProps | { state: GameState; horseId: HorseId; offerId: string },
): JSX.Element {
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
            state={state}
            horse={horse}
            assessment={view.assessment}
            ageYears={ageInYear(horse.birthYear, state.date.year)}
            parentage={parentageOf(state, horse)}
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
        <button
          type="button"
          className="btn"
          disabled={locked || !open || myBid === null}
          onClick={handleClear}
        >
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
function LiveBox({
  game,
  state,
  saleId,
  year,
  lotNo,
  myBid,
  active,
  dateKo,
  locked,
}: LiveBoxProps): JSX.Element {
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
    if (result.ok)
      setNotice({ tone: 'ok', text: `상한을 ${feeKo(target)} 로 올렸습니다. 이어서 보여 줍니다.` });
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
          className="btn"
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
