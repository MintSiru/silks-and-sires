import {
  PLAYER_OWNER_ID,
  SAVE_SCHEMA_VERSION,
  START_YEAR,
  STARTING_FUNDS,
} from '../config/game';
import { DEFAULT_ECONOMY_MODE } from '../config/economy';
import { STUD_BASE_SLOTS } from '../config/stud';
import {
  createEmptyBettingState,
  createEmptyEconomyState,
  createEmptyRelationsState,
  createEmptySalesState,
} from '../economy/state';
import { createRng } from '../rng';
import { seasonForYear } from '../time/calendar';
import type { CountryCode, Difficulty, EconomyMode, GameState, HomeCountry, Owner, Silks, StartType } from '../types';
import { createEmptySeasonState } from '../season/state';
import { DEFAULT_GAME_SETTINGS, emptyFarm, STARTING_PACKAGES, uniformFacilities } from '../config/farm';

export interface NewGameOptions {
  seed: number;
  playerName: string;
  silks: Silks;
  country?: CountryCode;
  studName?: string | null;
  /** 경제 모드(M4-A). 생략하면 DEFAULT_ECONOMY_MODE */
  economyMode?: EconomyMode;
  startType?: StartType;
  difficulty?: Difficulty;
  homeCountry?: HomeCountry;
  catastrophicInjuries?: boolean;
  /** 오너브리더의 현역마 지급 여부. 기본 true. */
  grantRacehorses?: boolean;
}

/** 새 게임 초기 상태. 2026년 1주, 플레이어 마주 1명, 나머지 레코드는 비어 있다. */
export function createNewGame(opts: NewGameOptions): GameState {
  const playerName = opts.playerName.trim();
  if (playerName === '') {
    throw new RangeError('playerName 은 공백이 아닌 문자열이어야 한다');
  }

  // difficulty 생략 시 기존 저장 상태·난수 경로를 그대로 유지한다.
  const start = opts.difficulty === undefined ? undefined : STARTING_PACKAGES[opts.difficulty];
  const settings = {
    startType: start === undefined ? DEFAULT_GAME_SETTINGS.startType : (opts.startType ?? DEFAULT_GAME_SETTINGS.startType),
    difficulty: opts.difficulty ?? DEFAULT_GAME_SETTINGS.difficulty,
    catastrophicInjuries: opts.catastrophicInjuries ?? DEFAULT_GAME_SETTINGS.catastrophicInjuries,
  };
  const homeCountry = opts.homeCountry ?? 'GB';
  const studName = settings.startType === 'owner' ? null : (opts.studName ?? null);
  const owner: Owner = {
    id: PLAYER_OWNER_ID,
    name: playerName,
    country: start === undefined ? (opts.country ?? 'GB') : homeCountry,
    isPlayer: true,
    silks: { ...opts.silks },
    funds: start?.funds ?? STARTING_FUNDS,
    studName,
    retainedJockeyId: null,
    horseIds: [],
    tier: 'small',
    persona: { commercial: 0.5, prestige: 0.5, patience: 0.5 },
    namePrefix: null,
  };

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    initialSeed: opts.seed,
    rng: createRng(opts.seed).getState(),
    date: { year: START_YEAR, week: 1 },
    season: seasonForYear(START_YEAR),
    playerOwnerId: PLAYER_OWNER_ID,
    horses: {},
    stallions: {},
    mares: {},
    owners: { [PLAYER_OWNER_ID]: owner },
    breeders: {},
    trainers: {},
    jockeys: {},
    breeding: { revealedNicks: [] },
    nextHorseNumber: 1,
    raceResults: [],
    seasonState: createEmptySeasonState(START_YEAR),
    awardsHistory: [],
    sireStats: {},
    eventLog: [],
    economy: createEmptyEconomyState(opts.economyMode ?? DEFAULT_ECONOMY_MODE),
    relations: createEmptyRelationsState(),
    sales: createEmptySalesState(),
    betting: createEmptyBettingState(),
    // 시작 연도는 연말 정산을 이미 마친 것으로 둔다(첫해에는 화면이 뜨지 않음, M4-D1)
    yearEnd: { lastSubmittedYear: START_YEAR, declinedRenewals: [] },
    stud: { slots: STUD_BASE_SLOTS, seasons: [], nominations: [], leases: [], sales: [] },
    settings,
    farm: settings.startType === 'owner' ? emptyFarm() : {
      owned: true, country: start === undefined ? 'GB' : homeCountry,
      size: start?.farmSize ?? 'medium', name: studName,
      facilities: uniformFacilities(start?.facilityLevel ?? 1), acquiredYear: START_YEAR,
    },
    farmListings: [],
  };
}
