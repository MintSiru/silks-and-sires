import { useState } from 'react';
import type { JSX } from 'react';
import { FACILITY_BUILD_WEEKS } from '../../engine/config/farm';
import type { GameState } from '../../engine/types';
import { FARM_NAME_ERROR_KO, feeKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import { constructionBanner, facilityRows, farmSummary, listingRows } from './farmView';
import './farm.css';

const ERROR_KO = {
  ...FARM_NAME_ERROR_KO,
  no_farm: '목장을 먼저 구매하세요.',
  max_level: '이미 최대 단계입니다.',
  under_construction: '다른 시설 공사가 진행 중입니다. 완공 후 다시 시도하세요.',
  insufficient_funds: '자금이 부족하거나 빚이 있어 진행할 수 없습니다.',
  not_found: '해당 매물이 더 이상 없습니다.',
  too_small: '번식 암말을 모두 수용하기에는 너무 작은 목장입니다.',
};

export default function FarmScreen({ game, locked = false }: { game: GameApi; locked?: boolean }): JSX.Element {
  if (game.state === null) {
    return <section className="panel"><h2>목장</h2>
      <p className="hint">먼저 '번식·배합' 탭에서 새 게임을 시작하세요.</p></section>;
  }
  return <FarmView game={game} state={game.state} locked={locked} />;
}

function FarmView({ game, state, locked }: { game: GameApi; state: GameState; locked: boolean }): JSX.Element {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [farmName, setFarmName] = useState(state.farm.name ?? '');
  const [pending, setPending] = useState<ReturnType<typeof listingRows>[number] | null>(null);
  const [purchaseName, setPurchaseName] = useState('');
  const summary = farmSummary(state);
  const facilities = facilityRows(state);
  const listings = listingRows(state);
  const banner = constructionBanner(state);
  const lockReason = locked ? '파산 상태에서는 진행할 수 없습니다.' : null;

  return <section className="farm-screen" aria-label="목장">
    {banner !== null && <p className="farm-construction" role="status" data-slot="farm-construction">
      공사 중 · {banner.text}</p>}
    {notice !== null && <p className={`notice notice--${notice.ok ? 'ok' : 'error'}`}
      role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}
    {lockReason !== null && <p className="notice notice--error" role="alert">{lockReason}</p>}
    <div className={`farm-layout${summary.owned ? '' : ' farm-layout--single'}`}>
    <div className="farm-column farm-column--left">
    {summary.owned ? <section className="panel">
        <h2>{summary.name}</h2>
        <button type="button" className="btn" disabled={locked} onClick={() => {
          setFarmName(state.farm.name ?? ''); setRenameOpen(true);
        }}>이름 바꾸기</button>
        {renameOpen && <form onSubmit={event => {
          event.preventDefault();
          if (locked) return;
          const result = game.renameFarm(farmName);
          if (result.ok) { setRenameOpen(false); setNotice({ ok: true, text: '목장 이름을 바꿨습니다.' }); }
          else setNotice({ ok: false, text: ERROR_KO[result.error] });
        }}>
          <label className="field"><span>목장 이름</span><input type="text" disabled={locked}
            value={farmName} onChange={event => setFarmName(event.target.value)} /></label>
          <button type="submit" className="btn" disabled={locked}>변경</button>
          <button type="button" className="btn" onClick={() => setRenameOpen(false)}>취소</button>
        </form>}
        <dl className="preview__facts">
          <dt>소재국·규모</dt><dd>{summary.countryKo} · {summary.sizeKo}</dd>
          <dt>취득 연도</dt><dd>{summary.acquiredYear ?? '—'}년</dd>
          <dt>번식 암말</dt><dd>{summary.broodmareCount} / {summary.mareCapacity}두
            {' '}(기본 {summary.baseCapacity} + 마방 증축 {summary.stableBonus})</dd>
          <dt>연 시설 유지비</dt><dd>{feeKo(summary.annualUpkeep)}</dd>
          <dt>종마 칸</dt><dd>{summary.stallionSlots}칸</dd>
        </dl>
      </section> : <section className="panel"><h2>목장 없음</h2>
        <p>목장을 사면 오너브리더가 됩니다.</p></section>}
    <details className="panel farm-listings" open={summary.owned ? undefined : true}>
      <summary>목장 매물 ({listings.length}곳)</summary>
      {pending !== null && <form className="panel" aria-label="목장 구매·이전 확인" onSubmit={event => {
        event.preventDefault();
        if (locked) return;
        const result = game.purchaseFarm(pending.id, purchaseName);
        if (result.ok) { setPending(null); setNotice({ ok: true, text: '목장 구매·이전을 마쳤습니다.' }); }
        else setNotice({ ok: false, text: ERROR_KO[result.error] });
      }}>
        <p>{pending.name} · 매물 값 {feeKo(pending.price)} − 기존 목장 매각가 {feeKo(pending.resale)}</p>
        <p>{pending.netCost < 0 ? `환급 ${feeKo(-pending.netCost)}` : `순지출 ${feeKo(pending.netCost)}`}</p>
        <p className="hint">{summary.owned ? '현재 시설 단계와 진행 중인 공사를 유지합니다.' : '모든 시설은 1단계로 시작합니다.'}</p>
        <label className="field"><span>구매·이전 후 목장 이름</span><input type="text" disabled={locked}
          value={purchaseName} onChange={event => setPurchaseName(event.target.value)} /></label>
        <button type="submit" className="btn" disabled={locked}>확인</button>
        <button type="button" className="btn" onClick={() => setPending(null)}>취소</button>
      </form>}
      <p className="hint">수용 한도에는 {summary.owned ? '현재' : '구매 시 기본 1단계'} 마방 증축 보너스가 포함됩니다.</p>
      {listings.length === 0 ? <p>현재 매물이 없습니다. 다음 주에 다시 확인하세요.</p>
        : <div className="table-scroll farm-table-scroll"><table className="data-table">
          <thead><tr><th>이름</th><th>나라·규모</th><th>번식 암말 수용</th><th>값</th>
            {summary.owned && <th>순지출</th>}<th>구매·이전</th></tr></thead>
          <tbody>{listings.map((row) => {
            const reason = lockReason ?? row.disabledReason;
            return <tr key={row.id}>
              <th scope="row">{row.name}</th><td>{row.countryKo} · {row.sizeKo}</td>
              <td>{row.capacity}두</td><td>{feeKo(row.price)}</td>
              {summary.owned && <td>{row.netCost < 0 ? `환급 ${feeKo(-row.netCost)}` : feeKo(row.netCost)}</td>}
              <td><button type="button" className="btn" disabled={reason !== null} title={reason ?? undefined}
                onClick={() => { setPending(row); setPurchaseName(row.name); }}>{summary.owned ? '이전' : '구매'}</button>
                {reason !== null && <p className="hint">{reason}</p>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </details>
    </div>
    {summary.owned && <div className="farm-column farm-column--right">
      <section className="panel">
        <h2>시설 공사</h2>
        <p className="hint">공사는 한 번에 하나씩, {FACILITY_BUILD_WEEKS}주가 걸립니다. 완공될 때 새 단계 효과가 적용됩니다.</p>
        <div className="table-scroll farm-table-scroll"><table className="data-table farm-facility-table">
          <thead><tr><th>시설</th><th>단계</th><th>효과 (현재 → 다음 단계)</th><th>다음 단계 비용</th><th>공사</th></tr></thead>
          <tbody>{facilities.map((row) => {
            const reason = lockReason ?? row.disabledReason;
            return <tr key={row.kind}>
              <th scope="row">{row.name}</th>
              <td><span className="farm-stage" role="img" aria-label={row.stageLabel}>{row.stageGlyph}</span></td>
              <td><ul className="farm-effects">{row.effects.map((part) => <li key={part.label}>
                {part.label} {part.current}
                {part.next !== null && <> → <span className={part.improved ? 'farm-delta--up' : undefined}>{part.next}</span></>}
              </li>)}</ul></td>
              <td>{row.nextCost === null ? '최대 단계' : feeKo(row.nextCost)}</td>
              <td>{row.constructionKo !== null && <p>{row.constructionKo}</p>}
                <button type="button" className="btn" disabled={reason !== null} title={reason ?? undefined}
                  onClick={() => {
                    const result = game.startFacilityUpgrade(row.kind);
                    setNotice(result.ok ? { ok: true, text: `${row.name} 공사를 시작했습니다.` }
                      : { ok: false, text: ERROR_KO[result.error] });
                  }}>공사 시작</button>
                {reason !== null && <p className="hint farm-disabled-reason">{reason}</p>}
              </td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>
    </div>}
    </div>
  </section>;
}
