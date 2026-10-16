import { silksDesignOf } from '../../engine/people/silks';
import type { GameState } from '../../engine/types';
import SilksSvg from '../silks/SilksSvg';
import { rivalRows, type RivalRow } from './legacyView';

export function RivalIdentity({ state, row }: { state: GameState; row: RivalRow }) {
  const owner = state.owners[row.ownerId];
  return <div className="legacy-rival__identity">
    {owner && <SilksSvg design={silksDesignOf(owner.silks, owner.id)} size={36} />}
    <strong>{row.name}</strong><span>맞대결 {row.record}</span>
  </div>;
}

export default function RivalCard({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const rows = rivalRows(state).filter((row) => row.active).slice(0, 2);
  return <section className="panel home-rivals">
    <div className="legacy-card-head"><h3>라이벌</h3><button type="button" className="link-btn" onClick={onOpen}>기록 보기 →</button></div>
    {rows.length === 0 && <p className="hint">아직 지정된 라이벌이 없습니다.</p>}
    {rows.map((row) => <div className="home-rival-row" key={row.ownerId}>
      <RivalIdentity state={state} row={row} />
      <span className="hint">{row.recentClash ?? '아직 맞대결이 없습니다.'}</span>
    </div>)}
  </section>;
}
