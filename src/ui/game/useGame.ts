import { useCallback, useRef, useState } from 'react';
import { WEEKS_PER_YEAR, EVENT_LOG_LIMIT } from '../../engine/config/game';
import { createGameSystems } from '../../engine/state/systems';
import { bootstrapWorld, type WorldStaticData } from '../../engine/state/world';
import { createNewGame } from '../../engine/state/newGame';
import { advanceWeek } from '../../engine/time/advance';
import { isInPhase } from '../../engine/time/calendar';
import { bookCovering, type BookingResult, type BreedingStaticData } from '../../engine/breeding/season';
import { deserializeGame, serializeGame } from '../../engine/save/serialize';
import {
  getHorseWords,
  getNicks,
  getStallionNames,
  getStallionRecords,
} from '../../engine/data/staticData';
import { createRng } from '../../engine/rng';
import type {
  CalendarPhaseId,
  GameEvent,
  GameState,
  HorseId,
  Silks,
  WeeklySystem,
} from '../../engine/types';
import {
  createIndexedDbSaveStore,
  type SaveSlotMeta,
  type SaveStore,
} from '../storage/saveStore';

export interface GameApi {
  state: GameState | null;
  lastEvents: GameEvent[];          // 마지막 진행에서 나온 이벤트
  newGame(seed: number, playerName: string): void;   // createNewGame → bootstrapWorld(createRng(seed).fork('world'))
  advance(weeks: number): void;     // createGameSystems(data) 로 advanceWeek 반복, 이벤트 누적
  advanceToPhase(phase: CalendarPhaseId): void;  // 그 단계가 시작되는 주까지(최대 52주)
  book(mareId: HorseId, stallionId: HorseId): BookingResult;   // 성공 시 state 갱신
  save(): Promise<void>;            // createIndexedDbSaveStore, 슬롯 id 'autosave'
  load(): Promise<boolean>;
}

/** 플레이어 승부복(고정). 띠 뷰어 원판 색은 primary. */
const PLAYER_SILKS: Silks = { primary: '#1f4e9c', secondary: '#f5c518', pattern: 'hoops' };
const AUTOSAVE_SLOT_ID = 'autosave';
const AUTOSAVE_NAME = '자동 저장';

function worldData(): WorldStaticData {
  return {
    stallionRecords: getStallionRecords(),
    stallionNames: getStallionNames(),
    nicks: getNicks(),
    words: getHorseWords(),
  };
}

function breedingData(): BreedingStaticData {
  return { nicks: getNicks(), words: getHorseWords() };
}

function gameSystems(): WeeklySystem[] {
  return createGameSystems(breedingData());
}

let storeInstance: SaveStore | null = null;

function saveStore(): SaveStore {
  if (storeInstance === null) {
    storeInstance = createIndexedDbSaveStore();
  }
  return storeInstance;
}

/** 단계 시작 주 판정. calendarSystem 의 발행 규칙(이전 주는 단계 밖)과 같다. */
function isPhaseStartWeek(week: number, phase: CalendarPhaseId): boolean {
  const prevWeek = week === 1 ? WEEKS_PER_YEAR : week - 1;
  return isInPhase(week, phase) && !isInPhase(prevWeek, phase);
}

/**
 * 게임 상태 훅. 상태 변경은 이 훅의 함수로만 한다.
 * 로직은 엔진 호출만 하며, 연속 호출에서도 최신 상태를 보도록 ref 로 함께 들고 있다.
 */
export function useGame(): GameApi {
  const [state, setState] = useState<GameState | null>(null);
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const stateRef = useRef<GameState | null>(null);

  const requireState = useCallback((): GameState => {
    const current = stateRef.current;
    if (current === null) {
      throw new Error('게임이 시작되지 않았습니다.');
    }
    return current;
  }, []);

  const newGame = useCallback((seed: number, playerName: string): void => {
    const base = createNewGame({ seed, playerName, silks: PLAYER_SILKS });
    const world = bootstrapWorld(base, worldData(), createRng(seed).fork('world'));
    stateRef.current = world;
    setState(world);
    setLastEvents([]);
  }, []);

  const advance = useCallback(
    (weeks: number): void => {
      if (!Number.isInteger(weeks) || weeks < 0) {
        throw new RangeError(`advance: weeks 는 0 이상의 정수여야 한다: ${weeks}`);
      }
      let current = requireState();
      const systems = gameSystems();
      const events: GameEvent[] = [];
      for (let i = 0; i < weeks; i++) {
        const result = advanceWeek(current, systems);
        current = result.state;
        events.push(...result.events);
      }
      stateRef.current = current;
      setState(current);
      setLastEvents(events);
    },
    [requireState],
  );

  const advanceToPhase = useCallback(
    (phase: CalendarPhaseId): void => {
      let current = requireState();
      const systems = gameSystems();
      const events: GameEvent[] = [];
      for (
        let i = 0;
        i < WEEKS_PER_YEAR && !isPhaseStartWeek(current.date.week, phase);
        i++
      ) {
        const result = advanceWeek(current, systems);
        current = result.state;
        events.push(...result.events);
      }
      stateRef.current = current;
      setState(current);
      setLastEvents(events);
    },
    [requireState],
  );

  const book = useCallback(
    (mareId: HorseId, stallionId: HorseId): BookingResult => {
      const current = requireState();
      const result = bookCovering(current, current.playerOwnerId, mareId, stallionId);
      if (!result.ok) return result;

      // bookCovering 은 eventLog 를 건드리지 않으므로 여기서 붙이고 상한으로 자른다.
      const merged = [...result.state.eventLog, ...result.events];
      const trimmed =
        merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged;
      const next: GameState = { ...result.state, eventLog: trimmed };

      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const save = useCallback(async (): Promise<void> => {
    const current = requireState();
    const savedAt = new Date().toISOString();
    const json = serializeGame(current, savedAt);
    const owner = current.owners[current.playerOwnerId];
    const meta: SaveSlotMeta = {
      id: AUTOSAVE_SLOT_ID,
      name: AUTOSAVE_NAME,
      savedAt,
      date: current.date,
      playerName: owner?.name ?? '',
    };
    await saveStore().save(meta, json);
  }, [requireState]);

  const load = useCallback(async (): Promise<boolean> => {
    const json = await saveStore().load(AUTOSAVE_SLOT_ID);
    if (json === null) return false;
    const result = deserializeGame(json);
    if (!result.ok) return false;
    stateRef.current = result.state;
    setState(result.state);
    setLastEvents([]);
    return true;
  }, []);

  return { state, lastEvents, newGame, advance, advanceToPhase, book, save, load };
}
