import {
  PLAYER_OWNER_ID,
  SAVE_SCHEMA_VERSION,
  START_YEAR,
  STARTING_FUNDS,
} from '../config/game';
import { createRng } from '../rng';
import { seasonForYear } from '../time/calendar';
import type { CountryCode, GameState, Owner, Silks } from '../types';

export interface NewGameOptions {
  seed: number;
  playerName: string;
  silks: Silks;
  country?: CountryCode;
  studName?: string | null;
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
    trainers: {},
    jockeys: {},
    breeding: { revealedNicks: [] },
    nextHorseNumber: 1,
    raceResults: [],
    eventLog: [],
  };
}
