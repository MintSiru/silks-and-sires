import { useState } from 'react';
import type { JSX } from 'react';
import type { Horse } from '../../engine/types';
import { HORSE_NAME_ERROR_KO } from '../game/text';
import type { GameApi } from '../game/useGame';

export default function HorseNamingPanel({ game, horse, locked }: {
  game: GameApi; horse: Horse; locked: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button type="button" className="btn" disabled={locked}
    onClick={() => setOpen(true)}>이름 짓기</button>;
  const candidates = game.nameSuggestions(horse.id, round);
  return <section className="panel" aria-label="경주마 이름 등록">
    <p className="hint">2세 조교 전까지 등록하세요. 등록하지 않으면 자동 등록됩니다.</p>
    <div className="toolbar">{candidates.map(candidate => <button key={candidate} type="button"
      className="btn" disabled={locked} aria-pressed={name === candidate}
      onClick={() => { setName(candidate); setError(null); }}>{candidate}</button>)}</div>
    <button type="button" className="btn" disabled={locked}
      onClick={() => setRound(value => value + 1)}>다른 후보</button>
    <form onSubmit={event => {
      event.preventDefault();
      if (locked) return;
      const result = game.registerHorseName(horse.id, name);
      if (!result.ok) setError(HORSE_NAME_ERROR_KO[result.error]);
    }}>
      <label className="field"><span>직접 입력</span>
        <input type="text" value={name} disabled={locked} onChange={event => {
          setName(event.target.value); setError(null);
        }} />
      </label>
      {error !== null && <p className="notice notice--error" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={locked}>등록</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>닫기</button>
    </form>
  </section>;
}
