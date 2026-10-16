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
import type { CountryCode, EconomyMode, GameState, Owner, Silks } from '../types';
import { createEmptySeasonState } from '../season/state';
import { DEFAULT_GAME_SETTINGS, uniformFacilities } from '../config/farm';

export interface NewGameOptions {
  seed: number;
  playerName: string;
  silks: Silks;
  country?: CountryCode;
  studName?: string | null;
  /** 경제 모드(M4-A). 생략하면 DEFAULT_ECONOMY_MODE */
  economyMode?: EconomyMode;
}

/** 새 게임 초기 상태. 2026년 1주, 플레이어 마주 1명, 나머지 레코드는 비어 있다. */
export function createNewGame(opts: NewGameOptions): GameState {
  const playerName = opts.playerName.trim();
  if (playerName === '') {
    throw new RangeError('playerName 은 공백이 아닌 문자열이어야 한다');
  }

  const owner: Owner = {
    id: PLAYER_OWNER_ID,
    name: playerName,
    country: opts.country ?? 'GB',
    isPlayer: true,
    silks: { ...opts.silks },
    funds: STARTING_FUNDS,
    studName: opts.studName ?? null,
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
    // M4-E0: 기본은 보통 난이도 오너브리더(설정 화면·bootstrap 옵션은 E0 티켓에서 연결). 시설은 모두 1단계
    settings: { ...DEFAULT_GAME_SETTINGS },
    farm: { owned: true, country: 'GB', size: 'medium', name: opts.studName ?? null,
      facilities: uniformFacilities(1), acquiredYear: START_YEAR },
    farmListings: [],
  };
}
