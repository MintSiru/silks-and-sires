import { useContext, type ReactNode } from 'react';
import type { GameEvent } from '../../engine/types';
import { displayName } from '../../engine/naming/register';
import { eventKo } from '../game/text';
import HorseLink, { HorseNavigation } from './HorseLink';
/** 이벤트에 포함된 ID만 연결하므로 사람 이름과 말 이름이 섞이지 않는다. */
export default function HorseEventText({ event }: { event: GameEvent }) {
  const { state } = useContext(HorseNavigation);
  const ids = new Set<string>();
  if ('horseId' in event) ids.add(event.horseId);
  if ('mareId' in event) ids.add(event.mareId);
  if ('stallionId' in event) ids.add(event.stallionId);
  if ('foalId' in event) ids.add(event.foalId);
  if (event.type === 'race_run') {
    ids.add(event.winnerId);
    event.playerHorseIds.forEach((id) => ids.add(id));
  }
  const nameOf = (id: string) => (state?.horses[id] ? displayName(state, state.horses[id]!) : '—');
  const names = [...ids]
    .filter((id) => state?.horses[id])
    .map((id) => ({ id, name: nameOf(id) }))
    .sort((a, b) => b.name.length - a.name.length);
  let remaining = eventKo(event, nameOf, (id) => state?.owners[id]?.name ?? id);
  const nodes: ReactNode[] = [];
  while (remaining.length) {
    const match = names
      .map((h) => ({ ...h, index: remaining.indexOf(h.name) }))
      .filter((h) => h.index >= 0)
      .sort((a, b) => a.index - b.index || b.name.length - a.name.length)[0];
    if (!match) {
      nodes.push(remaining);
      break;
    }
    nodes.push(
      remaining.slice(0, match.index),
      <HorseLink key={nodes.length} horseId={match.id} name={match.name} />,
    );
    remaining = remaining.slice(match.index + match.name.length);
  }
  return <>{nodes}</>;
}
