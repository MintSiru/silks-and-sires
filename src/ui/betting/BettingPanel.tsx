import { useState, type JSX } from 'react';
import { silksDesignOf } from '../../engine/people/silks';
import SilksSvg from '../silks/SilksSvg';
import { BET_MIN_STAKE } from '../../engine/config/betting';
import { getBookmakers } from '../../engine/data/staticData';
import type { BetKind, GameState } from '../../engine/types';
import { betErrorKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import { myBetsView, raceBettingView } from './bettingView';

interface Props {
  state: GameState;
  game: GameApi;
  meetingId: string;
  raceId: string;
  locked: boolean;
}

export default function BettingPanel({ state, game, meetingId, raceId, locked }: Props): JSX.Element {
  const race = raceBettingView(state, meetingId, raceId);
  const bets = myBetsView(state);
  const bookmakers = getBookmakers();
  const [bookmakerId, setBookmakerId] = useState(bookmakers[0]?.id ?? '');
  const [horseId, setHorseId] = useState('');
  const [kind, setKind] = useState<BetKind>('win');
  const [stake, setStake] = useState('100');
  const [message, setMessage] = useState('');
  const amount = Number(stake);
  const validAmount = stake.trim() !== '' && Number.isSafeInteger(amount) && amount >= BET_MIN_STAKE;

  const submit = (): void => {
    if (locked || !validAmount) return;
    const result = game.placeBet({ bookmakerId, meetingId, raceId, horseId, kind, stake: amount });
    setMessage(result.ok ? '베팅을 접수했습니다.' : betErrorKo(result.error));
  };
  const cancel = (betId: string): void => {
    const result = game.cancelBet(betId);
    setMessage(result.ok ? '베팅을 취소하고 지출을 돌려받았습니다.'
      : result.error === 'bet_not_found' ? '취소할 베팅을 찾을 수 없습니다.' : betErrorKo(result.error));
  };

  return (
    <section className="panel" aria-label="베팅 패널">
      <p className="hint">예상 오즈는 참고용이며 실제 배당은 레이스 확정 오즈(SP)로 정산됩니다. 연승은 금액의 2배가 나갑니다.</p>
      {race !== null && <>
        <h2>{race.raceName} · {race.dateKo}</h2>
        <p>{race.eachWayKo} · 남은 지출 한도 {race.limitLeftKo}</p>
        <table>
          <thead><tr><th>번호</th><th>승부복</th><th>말</th><th>예상 오즈</th></tr></thead>
          <tbody>{race.runners.map((r) => {
            const ownerId = state.horses[r.horseId]?.ownerId;
            const owner = ownerId == null ? undefined : state.owners[ownerId];
            return <tr key={r.horseId}>
              <td>{r.saddle}</td>
              <td>{owner !== undefined && <SilksSvg design={silksDesignOf(owner.silks, owner.id)} size={40} />}</td>
              <td>{r.name}{r.isMine ? ' (내 말)' : ''}</td>
              <td>{r.forecastKo}</td>
            </tr>;
          })}</tbody>
        </table>
        {race.runners.length === 0 && <p className="hint">아직 출주 선언된 말이 없습니다. 출주 선언 후 베팅할 수 있습니다.</p>}
        {race.canBet && <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label>베팅 회사 <select value={bookmakerId} onChange={(e) => setBookmakerId(e.target.value)}>
            {bookmakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>{' '}
          <label>말 <select value={horseId} onChange={(e) => setHorseId(e.target.value)}>
            <option value="">말 선택</option>
            {race.runners.map((r) => <option key={r.horseId} value={r.horseId}>{r.saddle}. {r.name}{r.isMine ? ' (내 말)' : ''}</option>)}
          </select></label>{' '}
          <label>종류 <select value={kind} onChange={(e) => setKind(e.target.value as BetKind)}>
            <option value="win">단승</option><option value="each_way" disabled={!race.eachWayAvailable}>연승</option>
          </select></label>{' '}
          <label>금액 (€) <input type="number" min={BET_MIN_STAKE} step="1" required value={stake} onChange={(e) => setStake(e.target.value)} /></label>{' '}
          <button className="btn" type="submit" disabled={locked || !validAmount || horseId === '' || (kind === 'each_way' && !race.eachWayAvailable)}>베팅</button>
        </form>}
      </>}
      {message !== '' && <p role="status">{message}</p>}
      <h3>내 베팅</h3>
      <p>올해 베팅 손익 {bets.yearNetKo}</p>
      <h4>미정산</h4>
      {bets.open.length === 0 && <p className="hint">미정산 베팅이 없습니다.</p>}
      <ul>{bets.open.map((b) => <li key={b.id}>
        {b.horseName} · {b.raceName} · {b.kindKo} · 지출 {b.outlayKo} · {b.bookmakerName}{' '}
        <button className="btn" type="button" disabled={!b.canCancel} onClick={() => cancel(b.id)}>취소</button>
      </li>)}</ul>
      <h4>최근 정산 (최대 20건)</h4>
      {bets.history.length === 0 && <p className="hint">정산 기록이 없습니다.</p>}
      <ul>{bets.history.map((b) => <li key={b.id}>
        {b.horseName} · {b.raceName} · {b.kindKo} · SP {b.startingPriceKo} · {b.positionKo} · 지출 {b.outlayKo} · 회수 {b.returnedKo} · 손익 {b.netKo}
      </li>)}</ul>
    </section>
  );
}
