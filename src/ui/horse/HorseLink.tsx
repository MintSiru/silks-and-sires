import { createContext, useContext, type ReactNode } from 'react';
import type { GameState } from '../../engine/types';
import { displayName } from '../../engine/naming/register';

export type HorseTab =
  | 'overview'
  | 'plan'
  | 'record'
  | 'pedigree'
  | 'events'
  | 'breeding'
  | 'foals'
  | 'book'
  | 'offspring';
export const HorseNavigation = createContext<{
  state: GameState | null;
  openHorse: (id: string, tab?: HorseTab) => void;
}>({ state: null, openHorse: () => {} });

/** ID 우선, 기존 화면의 표시명도 같은 상세 진입점으로 연결한다. */
export default function HorseLink({
  horseId,
  name,
  children,
}: {
  horseId?: string | null;
  name?: string;
  children?: ReactNode;
}) {
  const { state, openHorse } = useContext(HorseNavigation);
  const horse =
    state === null
      ? undefined
      : horseId
        ? state.horses[horseId]
        : Object.values(state.horses).find((h) => displayName(state, h) === name);
  const label = children ?? name ?? (horse && state ? displayName(state, horse) : '—');
  return horse ? (
    <button
      type="button"
      className="link-btn horse-link"
      onClick={(e) => {
        e.stopPropagation();
        openHorse(horse.id);
      }}
    >
      {label}
    </button>
  ) : (
    <>{label}</>
  );
}
