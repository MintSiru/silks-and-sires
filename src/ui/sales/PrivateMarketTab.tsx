import { useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { GameState } from '../../engine/types';
import { privateOfferErrorKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import { HorseNavigation } from '../horse/HorseLink';
import { useNotify } from '../shell/notify';
import { InspectBox } from './SalesLotDetail';
import { privateMarketEmptyKo, privateMarketRows, purchaseConfirmView } from './privateMarketView';

interface PrivateMarketTabProps {
  game: GameApi;
  state: GameState;
  locked: boolean;
}

/**
 * 세일 화면의 '개인 거래' 탭(M7-G2). 시장·문의·관계 제안을 한 목록으로 보인다.
 * 행 조작: [상세] 말 상세, [검사] 조교사 검사(기존 InspectBox), [구매] 확인창, [거절].
 */
export function PrivateMarketTab({ game, state, locked }: PrivateMarketTabProps): JSX.Element {
  const notify = useNotify();
  const { openHorse } = useContext(HorseNavigation);
  const rows = useMemo(() => privateMarketRows(state), [state]);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [buyId, setBuyId] = useState<string | null>(null);
  const confirmPanel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = confirmPanel.current;
    if (buyId === null || dialog === null) return;
    const previous = document.activeElement;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [buyId]);

  const inspected = rows.find((row) => row.offerId === inspectId);
  const confirm = buyId === null ? null : purchaseConfirmView(state, buyId);

  const handleBuy = (): void => {
    if (buyId === null) return;
    const result = game.acceptPrivateOffer(buyId);
    setBuyId(null);
    if (inspectId === buyId) setInspectId(null);
    if (result.ok) notify('구매했습니다.');
    else notify(privateOfferErrorKo(result.error), 'error');
  };

  const handleDecline = (offerId: string): void => {
    const result = game.declinePrivateOffer(offerId);
    if (result.ok) notify('제안을 거절했습니다.');
    else notify(privateOfferErrorKo(result.error), 'error');
  };

  return (
    <div className="sales-private">
      <section className="panel sales-offers" aria-label="개인 거래 매물">
        <h2>
          개인 거래 <span className="badge">{rows.length}건</span>
        </h2>
        <p className="hint">
          시장에 나온 말과 AI 마주가 문의에 응한 말입니다. 호가는 기한까지 유효하고, 사면 그날부터 내 말입니다.
        </p>
        <div className="sales-fill">
          {rows.length === 0 ? (
            <p className="hint">{privateMarketEmptyKo(state.date)}</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {['출처', '말', 'OR(추정)', '최근 성적', '추정 범위', '호가', '만료', '조작'].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.offerId}>
                    <td>
                      <span className={row.sourceClass}>{row.sourceKo}</span>
                    </td>
                    <td>
                      <span className="sales-name">{row.horseName}</span>
                      <span className="sales-sub">{row.horseSubKo}</span>
                      <span className="sales-sub">마주 {row.ownerName}</span>
                    </td>
                    <td>{row.orKo}</td>
                    <td className="sales-wrap">{row.formKo}</td>
                    <td>{row.estimateKo}</td>
                    <td className="sales-num">{row.priceKo}</td>
                    <td>{row.expiresKo}</td>
                    <td>
                      <button type="button" className="btn" onClick={() => openHorse(row.horseId)}>
                        상세
                      </button>{' '}
                      <button type="button" className="btn" title="조교사 검사" onClick={() => setInspectId(row.offerId)}>
                        검사
                      </button>{' '}
                      <button
                        type="button"
                        className="btn"
                        disabled={locked}
                        onClick={() => setBuyId(row.offerId)}
                      >
                        구매
                      </button>{' '}
                      <button type="button" className="btn" onClick={() => handleDecline(row.offerId)}>
                        거절
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {inspected !== undefined && (
            <InspectBox
              key={inspected.offerId}
              state={state}
              horseId={inspected.horseId}
              offerId={inspected.offerId}
            />
          )}
        </div>
      </section>

      <dialog
        ref={confirmPanel}
        className="horse-detail sales-detail sales-confirm"
        aria-label="구매 확인"
        onCancel={(e) => {
          e.preventDefault();
          setBuyId(null);
        }}
      >
        <div className="horse-detail__head">
          <h2>구매 확인</h2>
        </div>
        {confirm === null ? (
          <p className="hint">이 제안은 이미 없어졌습니다.</p>
        ) : (
          <>
            <p>{confirm.horseName}을(를) 호가에 삽니다. 조교사는 그대로 맡깁니다.</p>
            <dl className="sales-confirm__facts">
              <div>
                <dt>호가</dt>
                <dd>{confirm.priceKo}</dd>
              </div>
              <div>
                <dt>현재 자금</dt>
                <dd>{confirm.fundsKo}</dd>
              </div>
              <div>
                <dt>구매 뒤 자금</dt>
                <dd>{confirm.afterKo}</dd>
              </div>
            </dl>
            {confirm.blockedKo !== null && <p className="hint">{confirm.blockedKo}</p>}
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={locked || !confirm.canBuy}
                onClick={handleBuy}
              >
                구매 확인
              </button>
              <button type="button" className="btn" onClick={() => setBuyId(null)}>
                취소
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
