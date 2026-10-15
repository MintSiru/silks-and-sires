import { placeBet, cancelBet, type BetError } from '../../engine/betting/betting';
import { acceptPrivateOffer, declinePrivateOffer, type AcceptPrivateOfferError, type DeclinePrivateOfferError } from '../../engine/sales/privateTrade';
import { useCallback, useRef, useState } from 'react';
import { WEEKS_PER_YEAR, EVENT_LOG_LIMIT } from '../../engine/config/game';
import { createGameSystems, type GameStaticData } from '../../engine/state/systems';
import { bootstrapGame, type BootstrapData } from '../../engine/state/bootstrap';
import { advanceWeekGated, submitYearEnd } from '../../engine/stud/yearEnd';
import type { YearEndSubmission } from '../../engine/types/stud';
import { isInPhase } from '../../engine/time/calendar';
import { bookCovering, type BookingResult } from '../../engine/breeding/season';
import { deserializeGame, serializeGame } from '../../engine/save/serialize';
import {
  getBookmakers,
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../engine/data/staticData';
import {
  assignTrainer,
  declarePlayerHorse,
  withdrawPlayerHorse,
  type AssignTrainerError,
  type DeclareError,
  type PlayerResult,
  type WithdrawError,
} from '../../engine/season/player';
import {
  signRetainer,
  terminateRetainer,
  type RetainerKind,
  type RetainerRefusal,
} from '../../engine/economy/contracts';
import { clearMaxBid, setMaxBid, type BidError } from '../../engine/sales/bidding';
import { consignToSale, withdrawConsignment, type ConsignError } from '../../engine/sales/player';
import type { SalesStaticData } from '../../engine/sales/system';
import type {
  CalendarPhaseId,
  EconomyMode,
  GameEvent,
  GameState,
  HorseId,
  Money,
  RaceId,
  Silks,
  TrainerId,
  WeeklySystem,
} from '../../engine/types';
import {
  createIndexedDbSaveStore,
  type SaveSlotMeta,
  type SaveStore,
} from '../storage/saveStore';

export interface GameApi {
  placeBet(input: Parameters<typeof placeBet>[1]): PlayerResult<BetError>;
  cancelBet(betId: string): ReturnType<typeof cancelBet>;
  state: GameState | null;
  lastEvents: GameEvent[];          // 마지막 진행에서 나온 이벤트
  newGame(seed: number, playerName: string, economyMode: EconomyMode): void;   // bootstrapGame(세계·인물·현역마·첫 개최), 경제 모드는 새 게임 때 고른다
  advance(weeks: number): void;     // createGameSystems(data) 로 advanceWeek 반복, 이벤트 누적
  advanceToPhase(phase: CalendarPhaseId): void;  // 그 단계가 시작되는 주까지(최대 52주)
  advanceUntil(stop: (s: GameState) => boolean, maxWeeks: number): void;  // 매 주 진행 후 stop(state) 가 true 면 멈춤(최대 maxWeeks 주)
  submitYearEnd(submission: YearEndSubmission): ReturnType<typeof submitYearEnd>;
  book(mareId: HorseId, stallionId: HorseId): BookingResult;   // 성공 시 state 갱신
  /** 플레이어 말 출주 접수(성공 시 state 갱신). meetingId 는 seasonState.meetings 의 개최 id */
  declarePlayerHorse(meetingId: string, raceId: RaceId, horseId: HorseId): PlayerResult<DeclareError>;
  withdrawPlayerHorse(meetingId: string, raceId: RaceId, horseId: HorseId): PlayerResult<WithdrawError>;
  /** 플레이어 말을 조교사에게 맡긴다(성공 시 state 갱신) */
  assignTrainer(horseId: HorseId, trainerId: TrainerId): PlayerResult<AssignTrainerError>;
  /** 플레이어 말을 올해 세일에 위탁한다(성공 시 state 갱신). reserve: null 이면 유보 없음 */
  consignToSale(horseId: HorseId, saleId: string, reserve: Money | null): PlayerResult<ConsignError>;
  /** 발표 전 위탁을 취소한다(성공 시 state 갱신) */
  withdrawConsignment(horseId: HorseId): PlayerResult<'not_consigned'>;
  /** 로트에 플레이어 입찰 상한을 건다(같은 로트는 덮어쓴다). year 는 카탈로그 연도 */
  setMaxBid(saleId: string, year: number, lotNo: number, maxBid: Money): PlayerResult<BidError>;
  /** 플레이어 입찰 상한을 지운다 */
  clearMaxBid(saleId: string, year: number, lotNo: number): PlayerResult<'bid_not_found'>;
  /** 조교사·기수와 전속 계약을 맺는다(성공 시 state 갱신) */
  signRetainer(kind: RetainerKind, personId: string): PlayerResult<RetainerRefusal | 'insufficient_funds'>;
  /** 전속 계약을 해지한다(위약금 포함, 성공 시 state 갱신) */
  terminateRetainer(kind: RetainerKind, personId: string): PlayerResult<'not_contracted'>;
  acceptPrivateOffer(offerId: string): PlayerResult<AcceptPrivateOfferError>;
  declinePrivateOffer(offerId: string): PlayerResult<DeclinePrivateOfferError>;
  save(): Promise<void>;            // createIndexedDbSaveStore, 슬롯 id 'autosave'
  load(): Promise<boolean>;
}

/** 플레이어 승부복(고정). 띠 뷰어 원판 색은 primary. */
const PLAYER_SILKS: Silks = { primary: '#1f4e9c', secondary: '#f5c518', pattern: 'hoops' };
const AUTOSAVE_SLOT_ID = 'autosave';
const AUTOSAVE_NAME = '자동 저장';

/** 주 시스템이 쓰는 정적 데이터(데이터 파일은 모듈 안에서 한 번만 검증된다) */
function gameStaticData(): GameStaticData {
  return {
    nicks: getNicks(),
    naming: getNamingData(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
    courses: getRacecourses(),
    templates: getRaceTemplates(),
    series: getSeriesDefinitions(),
    sales: getSalesData(),
  };
}

/** 새 게임 초기화용 정적 데이터 전체 */
function bootstrapData(): BootstrapData {
  return {
    ...gameStaticData(),
    ...getPeopleData(),
  };
}

/** 세일 API 가 쓰는 정적 데이터(gameStaticData 의 sales) */
function salesStaticData(): SalesStaticData {
  return { sales: gameStaticData().sales };
}

function gameSystems(): WeeklySystem[] {
  return createGameSystems(gameStaticData());
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

  const newGame = useCallback((seed: number, playerName: string, economyMode: EconomyMode): void => {
    const world = bootstrapGame({ seed, playerName, silks: PLAYER_SILKS, economyMode }, bootstrapData());
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
        const result = advanceWeekGated(current, systems);
        current = result.state;
        events.push(...result.events);
        if (result.blocked !== null) break;
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
        const result = advanceWeekGated(current, systems);
        current = result.state;
        events.push(...result.events);
        if (result.blocked !== null) break;
      }
      stateRef.current = current;
      setState(current);
      setLastEvents(events);
    },
    [requireState],
  );

  const advanceUntil = useCallback(
    (stop: (s: GameState) => boolean, maxWeeks: number): void => {
      if (!Number.isInteger(maxWeeks) || maxWeeks < 0) {
        throw new RangeError(`advanceUntil: maxWeeks 는 0 이상의 정수여야 한다: ${maxWeeks}`);
      }
      let current = requireState();
      const systems = gameSystems();
      const events: GameEvent[] = [];
      for (let i = 0; i < maxWeeks; i++) {
        const result = advanceWeekGated(current, systems);
        current = result.state;
        events.push(...result.events);
        if (result.blocked !== null) break;
        if (stop(current)) break;
      }
      stateRef.current = current;
      setState(current);
      setLastEvents(events);
    },
    [requireState],
  );

  const submitYearEndWith = useCallback(
    (submission: YearEndSubmission): ReturnType<typeof submitYearEnd> => {
      const result = submitYearEnd(requireState(), submission);
      if (!result.ok) return result;
      const merged = [...result.state.eventLog, ...result.events];
      const next: GameState = { ...result.state, eventLog: merged.slice(-EVENT_LOG_LIMIT) };
      stateRef.current = next;
      setState(next);
      setLastEvents(result.events);
      return { ...result, state: next };
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

  /** 플레이어 API 결과가 성공이면 상태를 갱신한다. 실패 사유는 호출자에게 그대로 돌려준다. */
  const applyPlayerResult = useCallback(<E extends string>(result: PlayerResult<E>): PlayerResult<E> => {
    if (result.ok) {
      stateRef.current = result.state;
      setState(result.state);
    }
    return result;
  }, []);

  const declarePlayer = useCallback(
    (meetingId: string, raceId: RaceId, horseId: HorseId): PlayerResult<DeclareError> =>
      applyPlayerResult(declarePlayerHorse(requireState(), meetingId, raceId, horseId)),
    [requireState, applyPlayerResult],
  );

  const withdrawPlayer = useCallback(
    (meetingId: string, raceId: RaceId, horseId: HorseId): PlayerResult<WithdrawError> =>
      applyPlayerResult(withdrawPlayerHorse(requireState(), meetingId, raceId, horseId)),
    [requireState, applyPlayerResult],
  );

  const assignTrainerTo = useCallback(
    (horseId: HorseId, trainerId: TrainerId): PlayerResult<AssignTrainerError> =>
      applyPlayerResult(assignTrainer(requireState(), horseId, trainerId)),
    [requireState, applyPlayerResult],
  );

  const consignHorse = useCallback(
    (horseId: HorseId, saleId: string, reserve: Money | null): PlayerResult<ConsignError> =>
      applyPlayerResult(consignToSale(requireState(), horseId, saleId, reserve, salesStaticData())),
    [requireState, applyPlayerResult],
  );

  const withdrawConsign = useCallback(
    (horseId: HorseId): PlayerResult<'not_consigned'> =>
      applyPlayerResult(withdrawConsignment(requireState(), horseId)),
    [requireState, applyPlayerResult],
  );

  const setBid = useCallback(
    (saleId: string, year: number, lotNo: number, maxBid: Money): PlayerResult<BidError> =>
      applyPlayerResult(setMaxBid(requireState(), saleId, year, lotNo, maxBid, salesStaticData())),
    [requireState, applyPlayerResult],
  );

  const acceptOffer = useCallback(
    (offerId: string) => applyPlayerResult(acceptPrivateOffer(requireState(), offerId)),
    [requireState, applyPlayerResult],
  );
  const declineOffer = useCallback(
    (offerId: string) => applyPlayerResult(declinePrivateOffer(requireState(), offerId)),
    [requireState, applyPlayerResult],
  );

  const clearBid = useCallback(
    (saleId: string, year: number, lotNo: number): PlayerResult<'bid_not_found'> =>
      applyPlayerResult(clearMaxBid(requireState(), saleId, year, lotNo)),
    [requireState, applyPlayerResult],
  );

  const signRetainerWith = useCallback(
    (kind: RetainerKind, personId: string): PlayerResult<RetainerRefusal | 'insufficient_funds'> =>
      applyPlayerResult(signRetainer(requireState(), kind, personId)),
    [requireState, applyPlayerResult],
  );

  const terminateRetainerWith = useCallback(
    (kind: RetainerKind, personId: string): PlayerResult<'not_contracted'> =>
      applyPlayerResult(terminateRetainer(requireState(), kind, personId)),
    [requireState, applyPlayerResult],
  );

  const placePlayerBet = useCallback(
    (input: Parameters<typeof placeBet>[1]) =>
      applyPlayerResult(placeBet(requireState(), input, { bookmakers: getBookmakers() })),
    [requireState, applyPlayerResult],
  );
  const cancelPlayerBet = useCallback(
    (betId: string) => applyPlayerResult(cancelBet(requireState(), betId)),
    [requireState, applyPlayerResult],
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

  return {
    state,
    placeBet: placePlayerBet,
    cancelBet: cancelPlayerBet,
    lastEvents,
    newGame,
    advance,
    advanceToPhase,
    advanceUntil,
    book,
    submitYearEnd: submitYearEndWith,
    declarePlayerHorse: declarePlayer,
    withdrawPlayerHorse: withdrawPlayer,
    assignTrainer: assignTrainerTo,
    consignToSale: consignHorse,
    withdrawConsignment: withdrawConsign,
    setMaxBid: setBid,
    clearMaxBid: clearBid,
    acceptPrivateOffer: acceptOffer,
    declinePrivateOffer: declineOffer,
    signRetainer: signRetainerWith,
    terminateRetainer: terminateRetainerWith,
    save,
    load,
  };
}
