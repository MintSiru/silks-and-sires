import { approveMating, approveAllMatings, changeMating, removeMating, replanMatings, setMatingFeeCap } from '../../engine/breeding/matingPlan';
import { sellToNhStore } from '../../engine/sales/nhStore';
import { FARM_NAME_ERROR_KO } from './text';
import { upcomingRaces, type UpcomingRaceWeek } from '../../engine/season/lookahead';
import { approvePlan, removePlan, replanHorse, setRacePlan } from '../../engine/season/racePlan';
import { nameSuggestions, registerHorseName } from '../../engine/naming/register';
import { FarmNameValidationError, renameFarm } from '../../engine/farm/naming';
import { NAME_SUGGESTION_COUNT } from '../../engine/config/naming';
import { purchaseFarm } from '../../engine/farm/purchase';
import { startFacilityUpgrade } from '../../engine/farm/facilities';
import { setPlayerSilks, validateSilksDesign } from '../../engine/people/silks';
import { SILKS_ERROR_KO } from '../silks/silksText';
import { placeBet, cancelBet, type BetError } from '../../engine/betting/betting';
import { acceptPrivateOffer, declinePrivateOffer, type AcceptPrivateOfferError, type DeclinePrivateOfferError } from '../../engine/sales/privateTrade';
import { useCallback, useRef, useState } from 'react';
import { WEEKS_PER_YEAR, EVENT_LOG_LIMIT } from '../../engine/config/game';
import { createGameSystems, type GameStaticData } from '../../engine/state/systems';
import { bootstrapGame, type BootstrapData } from '../../engine/state/bootstrap';
import { advanceWeekGated, submitYearEnd } from '../../engine/stud/yearEnd';
import type { StallionSaleMode, YearEndSubmission } from '../../engine/types/stud';
import { isInPhase } from '../../engine/time/calendar';
import { bookCovering, type BookingResult } from '../../engine/breeding/season';
import { leaseStallion, sellStallion } from '../../engine/stud/trade';
import { retirePlayerStallion } from '../../engine/stud/fertility';
import { setStallionPrivate } from '../../engine/stud/private';
import { chooseTreatment, orderVetExam } from '../../engine/horse/injury';
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
  Difficulty,
  FacilityKind,
  EconomyMode,
  GameEvent,
  GameState,
  HomeCountry,
  HorseId,
  PlannedRace,
  MatingProposal,
  InjuryTreatment,
  Money,
  RaceId,
  Silks,
  SilksDesign,
  StartType,
  TrainerId,
  WeeklySystem,
} from '../../engine/types';
import {
  createIndexedDbSaveStore,
  type SaveSlotMeta,
  type SaveStore,
} from '../storage/saveStore';

/** 새 게임 폼에서 고른 값(bootstrapGame 옵션과 같은 이름). 승부복을 포함한다. */
export interface NewGameInput {
  silks: Silks;
  seed: number;
  playerName: string;
  economyMode: EconomyMode;
  startType: StartType;
  difficulty: Difficulty;
  homeCountry: HomeCountry;
  catastrophicInjuries: boolean;
  grantRacehorses: boolean;
  farmName?: string;
}

export interface GameApi {
  matingProposals(): MatingProposal[];
  proposeMatings(): ReturnType<typeof replanMatings>;
  approveMating(mareId: HorseId): ReturnType<typeof approveMating>;
  approveAllMatings(): ReturnType<typeof approveAllMatings>;
  changeMating(mareId: HorseId, stallionId: HorseId): ReturnType<typeof changeMating>;
  removeMating(mareId: HorseId): ReturnType<typeof removeMating>;
  /** true: 제안 즉시 예약 / undefined: 기본(1월 2주에 빼지 않은 제안 예약) / false: 승인한 것만 */
  setAutoApproveMatings(mode: boolean | undefined): void;
  setMatingFeeCap(cap: Money | null): ReturnType<typeof setMatingFeeCap>;
  racePlan(horseId: HorseId): PlannedRace[];
  proposeRacePlan(horseId: HorseId): ReturnType<typeof replanHorse>;
  approvePlan(horseId: HorseId, planId: string): ReturnType<typeof approvePlan>;
  removePlan(horseId: HorseId, planId: string): ReturnType<typeof removePlan>;
  setRacePlan(horseId: HorseId, plans: PlannedRace[]): ReturnType<typeof setRacePlan>;
  upcomingRaces(weeks: number): UpcomingRaceWeek[];
  setAutoApproveRacePlans(enabled: boolean): void;
  placeBet(input: Parameters<typeof placeBet>[1]): PlayerResult<BetError>;
  cancelBet(betId: string): ReturnType<typeof cancelBet>;
  state: GameState | null;
  lastEvents: GameEvent[];          // 마지막 진행에서 나온 이벤트
  newGame(options: NewGameInput): void;   // bootstrapGame(세계·인물·현역마·첫 개최), 경제 모드·시작 유형·난이도 등은 새 게임 때 고른다
  advance(weeks: number): void;     // createGameSystems(data) 로 advanceWeek 반복, 이벤트 누적
  advanceToPhase(phase: CalendarPhaseId): void;  // 그 단계가 시작되는 주까지(최대 52주)
  advanceUntil(stop: (s: GameState) => boolean, maxWeeks: number): void;  // 매 주 진행 후 stop(state) 가 true 면 멈춤(최대 maxWeeks 주)
  submitYearEnd(submission: YearEndSubmission): ReturnType<typeof submitYearEnd>;
  book(mareId: HorseId, stallionId: HorseId): BookingResult;   // 성공 시 state 갱신
  /** 내 종마를 판다(국내는 교배권 0~2, 해외는 0). 성공 시 state 갱신·이벤트 기록, 실패하면 사유를 돌려준다 */
  sellToNhStore(horseId: HorseId): ReturnType<typeof sellToNhStore>;
  sellStallion(horseId: HorseId, mode: StallionSaleMode, nominations: number): ReturnType<typeof sellStallion>;
  /** 내 부상 말에 검사를 받아 확진한다(검사비 VET_EXAM_COST). 성공 시 state 갱신·이벤트 기록 */
  orderVetExam(horseId: HorseId): ReturnType<typeof orderVetExam>;
  /** 확진된 부상에 치료를 고른다(rest 휴양 / medical 치료 / surgery 수술). 성공 시 state 갱신·이벤트 기록 */
  chooseTreatment(horseId: HorseId, treatment: InjuryTreatment): ReturnType<typeof chooseTreatment>;
  /** 내 종마를 셔틀(returnSeason 생략) 또는 장기(returnSeason 필수) 임대한다. 성공 시 state 갱신·이벤트 기록 */
  leaseStallion(horseId: HorseId, kind: 'shuttle' | 'long', returnSeason?: number): ReturnType<typeof leaseStallion>;
  /** 내 종마를 직접 은퇴시킨다(거래 창 28~43주, 임대 아님). 성공 시 state 갱신·이벤트 기록, 실패하면 사유를 돌려준다 */
  retireStallion(horseId: HorseId): ReturnType<typeof retirePlayerStallion>;
  /** 내 종마를 비공개(makePrivate true, 내 암말 전용) 또는 공개로 바꾼다(거래 창 28~43주, 임대 아님). 이벤트는 남기지 않는다. 성공 시 state 갱신 */
  setStallionPrivate(horseId: HorseId, makePrivate: boolean): ReturnType<typeof setStallionPrivate>;
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
  registerHorseName(horseId: HorseId, name: string): ReturnType<typeof registerHorseName>;
  nameSuggestions(horseId: HorseId, round?: number): string[];
  renameFarm(name: string): ReturnType<typeof renameFarm>;
  purchaseFarm(listingId: string, name?: string): ReturnType<typeof purchaseFarm>;
  startFacilityUpgrade(kind: FacilityKind): ReturnType<typeof startFacilityUpgrade>;
  setSilks(design: SilksDesign): Promise<ReturnType<typeof setPlayerSilks>>;
  save(): Promise<void>;            // createIndexedDbSaveStore, 슬롯 id 'autosave'
  load(): Promise<boolean>;
}

/** 거래 이벤트를 eventLog 끝에 붙이고 상한으로 자른다(book 과 같은 방식). */
function appendEvents(state: GameState, events: GameEvent[]): GameState {
  const merged = [...state.eventLog, ...events];
  const trimmed = merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged;
  return { ...state, eventLog: trimmed };
}

/** 새 게임 승부복 기본값. 띠 뷰어 원판 색은 primary. */
export const PLAYER_SILKS: Silks = { primary: '#1f4e9c', secondary: '#f5c518', pattern: 'hoops' };
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

  const newGame = useCallback((options: NewGameInput): void => {
    if (options.silks.design !== undefined) {
      const error = validateSilksDesign(options.silks.design);
      if (error !== null) throw new Error(SILKS_ERROR_KO[error]);
    }
    let world: GameState;
    try {
      const data = bootstrapData();
      world = bootstrapGame(options, data);
      // 첫 주를 넘기기 전에도 홈·말 상세에서 자동 제안을 검토할 수 있다.
      for (const horse of Object.values(world.horses)) {
        if (horse.ownerId !== world.playerOwnerId || horse.status !== 'in_training' || horse.trainerId === null) continue;
        const result = replanHorse(world, data, horse.id);
        if (result.ok) world = result.state;
      }
    }
    catch (error) {
      if (error instanceof FarmNameValidationError) throw new Error(FARM_NAME_ERROR_KO[error.reason], { cause: error });
      throw error;
    }
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

  const sellToNhStoreWith = useCallback(
    (horseId: HorseId): ReturnType<typeof sellToNhStore> => {
      const result = sellToNhStore(requireState(), horseId);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ...result, state: next };
    },
    [requireState],
  );

  const sellStallionWith = useCallback(
    (horseId: HorseId, mode: StallionSaleMode, nominations: number): ReturnType<typeof sellStallion> => {
      const result = sellStallion(requireState(), horseId, mode, nominations);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const orderVetExamWith = useCallback(
    (horseId: HorseId): ReturnType<typeof orderVetExam> => {
      const result = orderVetExam(requireState(), horseId);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const chooseTreatmentWith = useCallback(
    (horseId: HorseId, treatment: InjuryTreatment): ReturnType<typeof chooseTreatment> => {
      const result = chooseTreatment(requireState(), horseId, treatment);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const leaseStallionWith = useCallback(
    (horseId: HorseId, kind: 'shuttle' | 'long', returnSeason?: number): ReturnType<typeof leaseStallion> => {
      const result = leaseStallion(requireState(), horseId, kind, returnSeason);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const retireStallionWith = useCallback(
    (horseId: HorseId): ReturnType<typeof retirePlayerStallion> => {
      const result = retirePlayerStallion(requireState(), horseId);
      if (!result.ok) return result;
      const next = appendEvents(result.state, result.events);
      stateRef.current = next;
      setState(next);
      return { ok: true, state: next, events: result.events };
    },
    [requireState],
  );

  const setStallionPrivateWith = useCallback(
    (horseId: HorseId, makePrivate: boolean): ReturnType<typeof setStallionPrivate> => {
      const result = setStallionPrivate(requireState(), horseId, makePrivate);
      if (!result.ok) return result;
      stateRef.current = result.state;
      setState(result.state);
      return result;
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

  const applyMatingResult = useCallback(<E extends string>(result: PlayerResult<E>): PlayerResult<E> => {
    if (!result.ok) return result;
    const next = appendEvents(result.state, result.events);
    stateRef.current = next;
    setState(next);
    setLastEvents(result.events);
    return { ...result, state: next };
  }, []);
  const matingProposals = useCallback((): MatingProposal[] => {
    const current = requireState();
    return structuredClone((current.stud.matingProposals ?? []).filter((p) => current.horses[p.mareId]?.ownerId === current.playerOwnerId));
  }, [requireState]);
  const proposeMatings = useCallback(() => applyMatingResult(replanMatings(requireState(), gameStaticData())), [requireState, applyMatingResult]);
  const approveMatingWith = useCallback((mareId: HorseId) => applyMatingResult(approveMating(requireState(), mareId)), [requireState, applyMatingResult]);
  const approveAllMatingsWith = useCallback(() => applyMatingResult(approveAllMatings(requireState())), [requireState, applyMatingResult]);
  const changeMatingWith = useCallback((mareId: HorseId, stallionId: HorseId) => applyMatingResult(changeMating(requireState(), mareId, stallionId)), [requireState, applyMatingResult]);
  const removeMatingWith = useCallback((mareId: HorseId) => applyMatingResult(removeMating(requireState(), mareId)), [requireState, applyMatingResult]);
  const setMatingFeeCapWith = useCallback((cap: Money | null) => applyMatingResult(setMatingFeeCap(requireState(), cap)), [requireState, applyMatingResult]);
  const setAutoApproveMatings = useCallback((mode: boolean | undefined): void => {
    const current = requireState();
    const settings = { ...current.settings };
    if (mode === undefined) delete settings.autoApproveMatings;
    else settings.autoApproveMatings = mode;
    const next = { ...current, settings };
    stateRef.current = next;
    setState(next);
  }, [requireState]);

  const racePlan = useCallback((horseId: HorseId): PlannedRace[] => {
    const current = requireState();
    if (current.horses[horseId]?.ownerId !== current.playerOwnerId) return [];
    return structuredClone(current.seasonState.racePlans?.[horseId] ?? []);
  }, [requireState]);

  const proposePlans = useCallback((horseId: HorseId) =>
    applyPlayerResult(replanHorse(requireState(), gameStaticData(), horseId)), [requireState, applyPlayerResult]);
  const approveRacePlan = useCallback((horseId: HorseId, planId: string) =>
    applyPlayerResult(approvePlan(requireState(), horseId, planId)), [requireState, applyPlayerResult]);
  const removeRacePlan = useCallback((horseId: HorseId, planId: string) =>
    applyPlayerResult(removePlan(requireState(), horseId, planId)), [requireState, applyPlayerResult]);
  const setPlans = useCallback((horseId: HorseId, plans: PlannedRace[]) =>
    applyPlayerResult(setRacePlan(requireState(), horseId, plans)), [requireState, applyPlayerResult]);
  const upcoming = useCallback((weeks: number): UpcomingRaceWeek[] => {
    const current = requireState();
    return upcomingRaces(current, gameStaticData(), current.date, weeks);
  }, [requireState]);
  const setAutoApproveRacePlans = useCallback((enabled: boolean): void => {
    const current = requireState();
    const next = { ...current, settings: { ...current.settings, autoApproveRacePlans: enabled } };
    stateRef.current = next;
    setState(next);
  }, [requireState]);

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

  /** 목장 API 는 이벤트만 반환하므로 훅에서 누적한 뒤 자동 저장한다. */
  const applyFarmResult = useCallback(<E extends string>(result: PlayerResult<E>): PlayerResult<E> => {
    if (!result.ok) return result;
    const next = appendEvents(result.state, result.events);
    stateRef.current = next;
    setState(next);
    setLastEvents(result.events);
    void save().catch((error: unknown) => console.error('목장 자동 저장 실패', error));
    return { ...result, state: next };
  }, [save]);

  const registerName = useCallback((horseId: HorseId, name: string): ReturnType<typeof registerHorseName> => {
    const result = registerHorseName(requireState(), horseId, name);
    if (!result.ok) return result;
    const next = appendEvents(result.state, result.events);
    stateRef.current = next;
    setState(next);
    setLastEvents(result.events);
    return { ...result, state: next };
  }, [requireState]);

  const suggestHorseNames = useCallback((horseId: HorseId, round = 0): string[] =>
    nameSuggestions(requireState(), horseId, NAME_SUGGESTION_COUNT, round), [requireState]);

  const renameFarmTo = useCallback((name: string): ReturnType<typeof renameFarm> =>
    applyFarmResult(renameFarm(requireState(), name)), [requireState, applyFarmResult]);

  const purchaseFarmWith = useCallback(
    (listingId: string, name?: string): ReturnType<typeof purchaseFarm> =>
      applyFarmResult(purchaseFarm(requireState(), listingId, name)),
    [requireState, applyFarmResult],
  );

  const startFacilityUpgradeWith = useCallback(
    (kind: FacilityKind): ReturnType<typeof startFacilityUpgrade> =>
      applyFarmResult(startFacilityUpgrade(requireState(), kind)),
    [requireState, applyFarmResult],
  );

  const setSilks = useCallback(async (design: SilksDesign): Promise<ReturnType<typeof setPlayerSilks>> => {
    const result = setPlayerSilks(requireState(), design);
    if (!result.ok) return result;
    stateRef.current = result.state;
    setState(result.state);
    await save();
    return result;
  }, [requireState, save]);

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
    matingProposals,
    proposeMatings,
    approveMating: approveMatingWith,
    approveAllMatings: approveAllMatingsWith,
    changeMating: changeMatingWith,
    removeMating: removeMatingWith,
    setMatingFeeCap: setMatingFeeCapWith,
    setAutoApproveMatings,
    racePlan,
    proposeRacePlan: proposePlans,
    approvePlan: approveRacePlan,
    removePlan: removeRacePlan,
    setRacePlan: setPlans,
    upcomingRaces: upcoming,
    setAutoApproveRacePlans,
    state,
    placeBet: placePlayerBet,
    cancelBet: cancelPlayerBet,
    lastEvents,
    newGame,
    setSilks,
    purchaseFarm: purchaseFarmWith,
    renameFarm: renameFarmTo,
    registerHorseName: registerName,
    nameSuggestions: suggestHorseNames,
    startFacilityUpgrade: startFacilityUpgradeWith,
    advance,
    advanceToPhase,
    advanceUntil,
    book,
    sellToNhStore: sellToNhStoreWith,
    sellStallion: sellStallionWith,
    orderVetExam: orderVetExamWith,
    chooseTreatment: chooseTreatmentWith,
    leaseStallion: leaseStallionWith,
    retireStallion: retireStallionWith,
    setStallionPrivate: setStallionPrivateWith,
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
