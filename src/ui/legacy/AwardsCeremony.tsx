import { useEffect, useRef, useState } from 'react';
import { displayName } from '../../engine/naming/register';
import type { GameEvent, GameState } from '../../engine/types';
import HorseLink from '../horse/HorseLink';
import { ceremonyView, type CeremonyView } from './legacyView';

export function CeremonyContent({ view }: { view: CeremonyView }) {
  return <>
    <p className="notice status-good">내 수상 {view.honors.length}건 · 명성 보상 합계 +{view.reputation}</p>
    <div className="ceremony-grid">
      <section>
        <h3>Laurel 부문별 수상마</h3>
        <table className="data-table"><thead><tr><th>부문</th><th>수상마</th></tr></thead>
          <tbody>{view.laurel.map((row) => <tr key={row.category} className={row.mine ? 'ceremony-mine' : undefined}>
            <td>{row.label}</td><td><HorseLink horseId={row.horseId} name={row.horseName ?? '해당 없음'} />{row.mine && <span className="badge">내 말</span>}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <section>
        <h3>유럽 리딩 상위 3</h3>
        {view.leading.map((section) => <div key={section.category}>
          <h4>{section.label}</h4>
          {section.rows.length === 0 && <p className="hint">기록 없음</p>}
          <ol className="ceremony-leading">{section.rows.map((row) => <li key={row.id} className={row.mine ? 'ceremony-mine' : undefined}>
            {section.category === 'sire' ? <HorseLink horseId={row.id} name={row.name} /> : row.name}
            {row.mine && <span className="badge">내 기록</span>}
          </li>)}</ol>
        </div>)}
      </section>
    </div>
    <section><h3>내 수상 내역</h3>
      {view.honors.length === 0 ? <p className="hint">이번 시즌 수상 내역이 없습니다.</p>
        : <ul>{view.honors.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    </section>
    <section><h3>{view.year}년 내 연대기 하이라이트</h3>
      {view.highlights.length === 0 ? <p className="hint">아직 하이라이트가 없습니다.</p>
        : <ul>{view.highlights.map((text, index) => <li key={index}>{text}</li>)}</ul>}
    </section>
  </>;
}

export function CeremonyDialog({ view, onClose }: { view: CeremonyView; onClose: () => void }) {
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = panel.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={panel} className="awards-ceremony" aria-labelledby="ceremony-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="legacy-card-head"><h2 id="ceremony-title">{view.year}년 연말 시상식</h2>
      <button type="button" className="btn" aria-label="시상식 닫기" onClick={onClose}>닫기</button>
    </div>
    <div className="ceremony-body"><CeremonyContent view={view} />
      <p className="hint">다시 보기: 경주 › 순위·시상 › 지난 시상</p>
    </div>
  </dialog>;
}

/** 진행 결과 이벤트만 관찰한다. 닫은 이벤트는 화면 전환·다른 작업 뒤에도 다시 열지 않는다. */
export default function AwardsCeremony({ state, events }: { state: GameState; events: GameEvent[] }) {
  const [dismissed, setDismissed] = useState<GameEvent[]>([]);
  const event = events.find((event) => event.type === 'awards_announced' && !dismissed.includes(event)
    && state.awardsHistory.some((awards) => awards.year === event.year));
  if (!event || event.type !== 'awards_announced') return null;
  const view = ceremonyView(state, event.year, (id) => state.horses[id] ? displayName(state, state.horses[id]!) : id);
  if (view === null) return null;
  return <CeremonyDialog key={event.year} view={view} onClose={() => setDismissed((previous) => [...previous, event])} />;
}
