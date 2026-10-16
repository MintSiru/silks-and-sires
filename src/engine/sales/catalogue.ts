/**
 * 세일 카탈로그 생성(M4-C2a). 세일 하나의 그 해 카탈로그(SaleCatalogue)를 만든다.
 * draft 는 직접 바꾼다(로트 말을 state.horses 에 넣고 생산자 horseIds 를 갱신). state.sales 에 넣는 일은 C2b.
 * 난수는 인자로 받은 rng 와 로트별 가치 평가 스트림(createRng)만 쓴다. 같은 draft·같은 rng → 같은 카탈로그.
 * 설계: docs/m4-sales-design.md 1·2장.
 */
import { patronView } from './patron';
import { BREEDER_PICK_WEIGHT } from '../config/breeders';
import {
  POPULATION_ABILITY_SPREAD,
  POPULATION_COUNTRY_ORDER,
  POPULATION_DISTANCE_DEFAULT_MEDIAN,
  POPULATION_DISTANCE_SIRE_WEIGHT,
  POPULATION_TIER_LEVEL,
} from '../config/population';
import {
  SALE_HIT_MAX_PER_OWNER,
  SALE_HOME_SIRE_WEIGHT_MULT,
  SALE_HIT_MIN_AGE,
  SALE_HIT_MIN_OWNER_HORSES,
  SALE_HIT_OR_MAX,
  SALE_HIT_OR_MIN,
  SALE_LOT_SCALE,
  SALE_PATRON_BOOK_BONUS,
  SALE_MARE_AGE_MAX,
  SALE_MARE_AGE_MIN,
  SALE_RESERVE_SHARE,
  SALE_UNKNOWN_SIRE_TIER,
  SALE_VALUE_ROUND,
} from '../config/sales';
import { PROFILE_DISTANCE } from '../config/world';
import { generateHorse } from '../horse/generate';
import { makeNameRegistry, namingContextFor, type MutableNameRegistry } from '../naming/context';
import { nameForHorse } from '../naming/generate';
import type { NamingData } from '../naming/types';
import { createRng } from '../rng';
import { sortStallionRecords } from '../state/stallionHorses';
import { allocateHorseId } from '../state/world';
import type {
  BreederId,
  CommercialBreeder,
  CountryCode,
  GameState,
  Horse,
  HorseId,
  HorseStatus,
  Money,
  OwnerId,
  RealStallionRecord,
  Rng,
  SaleBookDef,
  SaleCatalogue,
  SaleEventDef,
  SaleKind,
  SaleLot,
  SaleVendor,
  SalesDataFile,
  Sex,
  Stallion,
  StallionNameTable,
} from '../types';
import { drawSexAndGelding, racingHorseIds } from '../world/population';
import { meanAbility, ratingFromAbility } from '../world/rating';
import { coverYearForFoal, filterSiresForCover } from '../world/sireWindow';
import { sirePoolFor, tierFromFee } from '../world/sirePool';
import { makeVirtualDam } from '../world/virtualDam';
import { valueLot } from './valuation';

/** 카탈로그 생성에 필요한 정적 데이터 */
export interface CatalogueStaticData {
  sales: SalesDataFile;
  stallionRecords: readonly RealStallionRecord[];
  naming: NamingData;
  stallionNames: StallionNameTable;
}

/** 부 시장 등급 범위(양끝 포함) */
export interface SireTierRange {
  min: number;
  max: number;
}

/** 부 후보: 실명 종마 레코드와 그 현역 Stallion(같은 key) */
interface SireCandidate {
  record: RealStallionRecord;
  stallion: Stallion;
}

/** 로트로 만들기 전 말 한 마리 */
interface PendingLot {
  bookNo: number;
  horse: Horse;
  vendor: SaleVendor;
  /** 위탁 로트의 유보가(null = 유보 없음). undefined 면 평가값에서 정한다 */
  consignedReserve: Money | null | undefined;
}

/** 현역마 판매 후보 한 두(마주 id 포함) */
interface HitPick {
  horse: Horse;
  ownerId: OwnerId;
}

/** 부 선택 완화 단계 수(①②③ 와 기본 단계). 0 부터 엄격한 순서 */
const SIRE_STAGE_COUNT = 4;

/** 한 번의 buildCatalogue 안에서만 쓰는 조회 문맥 */
interface Context {
  state: GameState;
  data: CatalogueStaticData;
  country: CountryCode;
  registry: MutableNameRegistry;
  /** 실명 종마 중 active 레코드(key 오름차순) */
  activeRecords: RealStallionRecord[];
  damRecords: RealStallionRecord[];
  /** 교배 연도 → 교배 가능 부 후보 캐시 */
  sireByCover: Map<number, SireCandidate[]>;
  /** 이 세일 나라의 상업 생산자(id 오름차순) */
  breeders: CommercialBreeder[];
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 북을 번호 순서로 정렬한 복사본. 북이 없으면 Error */
function sortedBooks(event: SaleEventDef): SaleBookDef[] {
  if (event.books.length === 0) {
    throw new RangeError(`세일 카탈로그: ${event.id} 에 북이 없다`);
  }
  return [...event.books].sort((a, b) => a.book - b.book);
}

/** 북 하나의 로트 수 = max(1, round(lotsTarget × SALE_LOT_SCALE)) */
function lotsForBook(book: SaleBookDef): number {
  return Math.max(1, Math.round(book.lotsTarget * SALE_LOT_SCALE));
}

/**
 * 북의 부 등급 범위. 북 1 은 [1, maxSireTier], 그 밖은 (앞 북 maxSireTier, 이 북 maxSireTier].
 * 앞 북과 maxSireTier 가 같으면 그 등급만 [max, max].
 * 북 번호가 없으면 RangeError.
 */
export function bookSireTierRange(event: SaleEventDef, bookNo: number): SireTierRange {
  const books = sortedBooks(event);
  const index = books.findIndex((b) => b.book === bookNo);
  const book = books[index];
  if (book === undefined) {
    throw new RangeError(`세일 카탈로그: ${event.id} 에 북 ${bookNo} 가 없다`);
  }
  const max = book.maxSireTier;
  if (index === 0) return { min: 1, max };
  const prev = (books[index - 1] as SaleBookDef).maxSireTier;
  return { min: prev === max ? max : prev + 1, max };
}

/** 플레이어 말 → 들어갈 북 번호(부 시장 등급 ≤ maxSireTier 인 첫 북, 없으면 마지막 북) */
export function bookForSire(event: SaleEventDef, sireTier: number): number {
  const books = sortedBooks(event);
  const hit = books.find((b) => sireTier <= b.maxSireTier);
  const chosen = hit ?? books[books.length - 1];
  if (chosen === undefined) {
    throw new RangeError(`세일 카탈로그: ${event.id} 에 북이 없다`);
  }
  return chosen.book;
}

/** 가중치로 항목 하나를 고른다. rng.next() 를 정확히 1회 쓴다. */
function pickByWeight<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  const weights = items.map(weightOf);
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) {
    throw new RangeError('세일 카탈로그: 가중치 합이 0 이하다');
  }
  const target = rng.next() * total;
  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += weights[i] ?? 0;
    if (target < cumulative) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/** 교배 연도의 교배 가능 부 후보(active, 교배 기간 안, firstSeasonYear ≤ 교배 연도). 같은 연도는 캐시한다 */
function sireCandidatesFor(ctx: Context, coverYear: number): SireCandidate[] {
  const cached = ctx.sireByCover.get(coverYear);
  if (cached !== undefined) return cached;
  const list: SireCandidate[] = [];
  for (const record of filterSiresForCover(sirePoolFor(ctx.state, ctx.activeRecords, coverYear), coverYear)) {
    const stallion = ctx.state.stallions[record.key];
    if (stallion === undefined || stallion.firstSeasonYear > coverYear) continue;
    list.push({ record, stallion });
  }
  ctx.sireByCover.set(coverYear, list);
  return list;
}

/**
 * 완화 단계별 후보 조건(권역 = 유럽 5개국 / 그 밖은 그 나라만).
 * 0: 같은 권역 계류 + 등급 범위. 1: 같은 권역 계류 + 등급 ≤ 북 max. 2: 모든 나라 + 등급 범위. 3: 모든 active.
 * 가중치는 세일 나라 계류 종마가 SALE_HOME_SIRE_WEIGHT_MULT 배(selectSire).
 */
/** 같은 권역인가: 둘 다 유럽 5개국이면 같은 권역, 아니면 같은 나라일 때만 */
function sameRegion(a: CountryCode, b: CountryCode): boolean {
  const europe: readonly CountryCode[] = POPULATION_COUNTRY_ORDER;
  return a === b || (europe.includes(a) && europe.includes(b));
}

function matchesStage(stage: number, c: SireCandidate, country: CountryCode, range: SireTierRange): boolean {
  const tier = c.record.marketTier;
  const inRange = tier >= range.min && tier <= range.max;
  switch (stage) {
    case 0:
      return sameRegion(c.stallion.standsIn, country) && inRange;
    case 1:
      return sameRegion(c.stallion.standsIn, country) && tier <= range.max;
    case 2:
      return inRange;
    default:
      return true;
  }
}

/** 부 한 마리: 단계별로 후보가 있는 첫 단계에서 (popularity + 1) × 자국 계류 가중 추첨 */
function selectSire(ctx: Context, coverYear: number, range: SireTierRange, rng: Rng): SireCandidate {
  const pool = sireCandidatesFor(ctx, coverYear);
  for (let stage = 0; stage < SIRE_STAGE_COUNT; stage++) {
    const list = pool.filter((c) => matchesStage(stage, c, ctx.country, range));
    if (list.length > 0) {
      return pickByWeight(
        rng,
        list,
        (c) => (c.stallion.popularity + 1) * (c.stallion.standsIn === ctx.country ? SALE_HOME_SIRE_WEIGHT_MULT : 1),
      );
    }
  }
  throw new RangeError(`세일 카탈로그: 교배 연도 ${coverYear} 의 부(父) 후보가 없다`);
}

/** 판매 생산자: 그 나라 상업 생산자 중 규모 가중 추첨 */
function pickBreeder(ctx: Context, rng: Rng): CommercialBreeder {
  if (ctx.breeders.length === 0) {
    throw new RangeError(`세일 카탈로그: ${ctx.country} 상업 생산자가 없다`);
  }
  return pickByWeight(rng, ctx.breeders, (b) => BREEDER_PICK_WEIGHT[b.scale]);
}

/** 종류별 새 말의 출생 연도. 번식 암말은 4~12세 난수다 */
function birthYearFor(kind: SaleKind, year: number, rng: Rng): number {
  switch (kind) {
    case 'foal':
      return year;
    case 'yearling':
      return year - 1;
    case 'breeze_up':
      return year - 2;
    case 'breeding_stock':
      return year - rng.int(SALE_MARE_AGE_MIN, SALE_MARE_AGE_MAX);
    default:
      throw new RangeError(`세일 카탈로그: ${kind} 종류는 새 말을 만들지 않는다`);
  }
}

/** 종류별 새 말의 상태(status) */
function statusFor(kind: SaleKind): HorseStatus {
  switch (kind) {
    case 'foal':
      return 'weanling';
    case 'breeding_stock':
      return 'broodmare';
    default:
      return 'yearling';
  }
}

/** 로트 말 한 마리를 만들어 state.horses 에 넣는다(이름 등록 포함) */
function createHorse(
  ctx: Context,
  args: { birthYear: number; year: number; status: HorseStatus; sex: Sex; sire: SireCandidate; breederId: BreederId; rng: Rng },
): Horse {
  const { rng, sire } = args;
  const id = allocateHorseId(ctx.state);
  const naming = namingContextFor(ctx.state, { ownerId: null, sireId: sire.record.key, damId: null }, ctx.data);
  const name = nameForHorse(naming, ctx.data.naming, rng, ctx.registry);
  ctx.registry.add(name);
  const distanceBias =
    POPULATION_DISTANCE_SIRE_WEIGHT * PROFILE_DISTANCE[sire.record.distanceProfile] +
    (1 - POPULATION_DISTANCE_SIRE_WEIGHT) * POPULATION_DISTANCE_DEFAULT_MEDIAN;
  const horse = generateHorse(rng, {
    id,
    name,
    sex: args.sex,
    birthYear: args.birthYear,
    currentYear: args.year,
    countryOfBirth: ctx.country,
    status: args.status,
    level: POPULATION_TIER_LEVEL[sire.record.marketTier],
    spread: POPULATION_ABILITY_SPREAD,
    sireId: sire.record.key,
    damId: null,
    familyId: null,
    sireLineId: sire.record.sireLineId,
    ownerId: null,
    distanceBias,
  });
  horse.breederId = args.breederId;
  const virtualDam = makeVirtualDam(ctx.state, ctx.data, ctx.damRecords, ctx.registry, horse, 'sale-dam',
    POPULATION_COUNTRY_ORDER.find(country => country === ctx.country));
  if (virtualDam !== null) horse.virtualDam = virtualDam;
  ctx.state.horses[id] = horse;
  return horse;
}

/** 생성 로트 한 개(1세·이유·브리즈업·번식 암말). 부·판매자·말을 정하고 판매자 horseIds 에 넣는다 */
function newStockLot(
  ctx: Context,
  kind: 'foal' | 'yearling' | 'breeze_up' | 'breeding_stock',
  year: number,
  bookNo: number,
  range: SireTierRange,
  rng: Rng,
): PendingLot {
  const birthYear = birthYearFor(kind, year, rng);
  const sire = selectSire(ctx, coverYearForFoal(birthYear), range, rng);
  const breeder = pickBreeder(ctx, rng);
  const sex: Sex = kind === 'breeding_stock' ? 'female' : drawSexAndGelding(rng, year - birthYear).sex;
  const horse = createHorse(ctx, {
    birthYear,
    year,
    status: statusFor(kind),
    sex,
    sire,
    breederId: breeder.id,
    rng,
  });
  if (kind === 'breeding_stock') {
    horse.officialRating = Math.round(ratingFromAbility(meanAbility(horse.ability)));
  }
  breeder.horseIds.push(horse.id);
  return { bookNo, horse, vendor: { kind: 'breeder', id: breeder.id }, consignedReserve: undefined };
}

/**
 * 현역마 판매 후보: 그 나라 태생 AI 현역마, SALE_HIT_MIN_AGE 이상, OR 이 [MIN, MAX] 안,
 * 마주가 현역마 SALE_HIT_MIN_OWNER_HORSES 두 이상. 무작위로 total 두를 고르되 마주당 최대 SALE_HIT_MAX_PER_OWNER 두.
 * 후보가 모자라면 있는 만큼만 돌려준다.
 */
function pickInTraining(ctx: Context, year: number, total: number, rng: Rng): HitPick[] {
  const racing = racingHorseIds(ctx.state)
    .map((id) => ctx.state.horses[id])
    .filter((h): h is Horse => h !== undefined);
  const ownedCount = new Map<OwnerId, number>();
  for (const h of racing) {
    if (h.ownerId !== null) ownedCount.set(h.ownerId, (ownedCount.get(h.ownerId) ?? 0) + 1);
  }
  const eligible: HitPick[] = [];
  for (const h of racing) {
    const ownerId = h.ownerId;
    const or = h.officialRating;
    if (ownerId === null || or === null) continue;
    if (h.countryOfBirth !== ctx.country) continue;
    if (year - h.birthYear < SALE_HIT_MIN_AGE) continue;
    if (or < SALE_HIT_OR_MIN || or > SALE_HIT_OR_MAX) continue;
    if ((ownedCount.get(ownerId) ?? 0) < SALE_HIT_MIN_OWNER_HORSES) continue;
    eligible.push({ horse: h, ownerId });
  }
  const taken = new Map<OwnerId, number>();
  const picked: HitPick[] = [];
  for (const pick of rng.shuffle(eligible)) {
    if (picked.length >= total) break;
    const n = taken.get(pick.ownerId) ?? 0;
    if (n >= SALE_HIT_MAX_PER_OWNER) continue;
    taken.set(pick.ownerId, n + 1);
    picked.push(pick);
  }
  return picked;
}

/** 말의 부 시장 등급. 정적 레코드가 없는 종마는 현재 종부료로 환산한다. */
function sireTierOf(ctx: Context, sireId: HorseId | null): number {
  if (sireId === null) return SALE_UNKNOWN_SIRE_TIER;
  const record = ctx.data.stallionRecords.find((r) => r.key === sireId);
  if (record !== undefined) return record.marketTier;
  const stallion = ctx.state.stallions[sireId];
  return stallion === undefined ? SALE_UNKNOWN_SIRE_TIER : tierFromFee(stallion.fee);
}

/** 종류에 맞는 위탁 말인가(나이·상태·성별) */
export function fitsKind(horse: Horse, kind: SaleKind, year: number): boolean {
  const age = year - horse.birthYear;
  switch (kind) {
    case 'foal':
      return age === 0 && (horse.status === 'foal' || horse.status === 'weanling');
    case 'yearling':
      return age === 1 && horse.status === 'yearling';
    case 'breeze_up':
      return age === 2 && horse.status === 'yearling';
    case 'horses_in_training':
      return age >= SALE_HIT_MIN_AGE && (horse.status === 'in_training' || horse.status === 'resting');
    case 'breeding_stock':
      return (
        horse.sex === 'female' &&
        age >= SALE_MARE_AGE_MIN &&
        age <= SALE_MARE_AGE_MAX &&
        horse.status === 'broodmare'
      );
  }
}

/** 플레이어 위탁 로트: 이 세일·이 해 신청분 중 말이 있고 주인이 플레이어이며 종류에 맞는 것(중복 제외) */
function consignedLots(ctx: Context, event: SaleEventDef, year: number): PendingLot[] {
  const playerId = ctx.state.playerOwnerId;
  const used = new Set<HorseId>();
  const out: PendingLot[] = [];
  for (const c of ctx.state.sales.consignments) {
    if (c.saleId !== event.id || c.year !== year || used.has(c.horseId)) continue;
    const horse = ctx.state.horses[c.horseId];
    if (horse === undefined || horse.ownerId !== playerId || !fitsKind(horse, event.kind, year)) continue;
    used.add(c.horseId);
    out.push({
      bookNo: Math.max(1, bookForSire(event, sireTierOf(ctx, horse.sireId)) - SALE_PATRON_BOOK_BONUS[patronView(ctx.state).tier]),
      horse,
      vendor: { kind: 'owner', id: playerId },
      consignedReserve: c.reserve,
    });
  }
  return out;
}

/** 유보가 = 평가값 × SALE_RESERVE_SHARE 를 SALE_VALUE_ROUND 단위로 반올림 */
function reserveOf(valuation: Money): Money {
  return Math.round((valuation * SALE_RESERVE_SHARE) / SALE_VALUE_ROUND) * SALE_VALUE_ROUND;
}

/** 로트 한 개를 완성한다(가치 평가는 로트 번호로 정해진 독립 스트림) */
function finishLot(ctx: Context, event: SaleEventDef, year: number, lotNo: number, pending: PendingLot): SaleLot {
  const { horse } = pending;
  const valuation = valueLot(
    ctx.state,
    horse,
    event.kind,
    year,
    createRng(`${ctx.state.initialSeed}:value:${event.id}:${year}:${lotNo}`),
  );
  const reserve = pending.consignedReserve !== undefined ? pending.consignedReserve : reserveOf(valuation);
  return {
    lotNo,
    book: pending.bookNo,
    horseId: horse.id,
    horseName: horse.name,
    sireId: horse.sireId,
    vendor: pending.vendor,
    reserve,
    valuation,
    aiBids: [],
    result: null,
  };
}

/**
 * 세일 하나의 그 해 카탈로그를 만든다. draft 를 직접 바꾼다(로트 말을 state.horses 에 넣고 생산자 horseIds 갱신).
 * 로트 수 = Σ 북별 max(1, round(lotsTarget × SALE_LOT_SCALE)) (horses_in_training 은 후보가 모자라면 그만큼 적다).
 * 부 선택은 bookSireTierRange 와 완화 단계(나라 → 모든 나라 → 모든 active)를 따른다.
 * 순서: 북 순서대로, 북 안은 rng.shuffle, lotNo 1부터 이어서. 위탁 로트는 생성 로트와 같은 북 규칙으로 섞인다.
 */
export function buildCatalogue(
  draft: GameState,
  event: SaleEventDef,
  year: number,
  data: CatalogueStaticData,
  rng: Rng,
): SaleCatalogue {
  const company = data.sales.companies.find((c) => c.id === event.companyId);
  if (company === undefined) {
    throw new RangeError(`세일 카탈로그: 회사 ${event.companyId} 가 없다`);
  }
  const books = sortedBooks(event);
  const ctx: Context = {
    state: draft,
    data,
    country: company.country,
    registry: makeNameRegistry(draft),
    activeRecords: sortStallionRecords(data.stallionRecords).filter((r) => r.status === 'active'),
    damRecords: sortStallionRecords(data.stallionRecords),
    sireByCover: new Map(),
    breeders: Object.values(draft.breeders)
      .filter((b) => b.country === company.country)
      .sort(byId),
  };
  const counts = books.map(lotsForBook);
  const perBook: PendingLot[][] = books.map(() => []);

  // 1) 종류별 로트: 현역마 판매는 기존 말을 고르고, 나머지는 새 말을 만든다
  if (event.kind === 'horses_in_training') {
    const total = counts.reduce((sum, n) => sum + n, 0);
    const picks = pickInTraining(ctx, year, total, rng);
    let cursor = 0;
    for (let bi = 0; bi < books.length; bi++) {
      const bookNo = (books[bi] as SaleBookDef).book;
      for (let k = 0; k < (counts[bi] ?? 0); k++) {
        const pick = picks[cursor];
        cursor += 1;
        if (pick === undefined) break;
        perBook[bi]?.push({
          bookNo,
          horse: pick.horse,
          vendor: { kind: 'owner', id: pick.ownerId },
          consignedReserve: undefined,
        });
      }
    }
  } else {
    for (let bi = 0; bi < books.length; bi++) {
      const book = books[bi] as SaleBookDef;
      const range = bookSireTierRange(event, book.book);
      for (let k = 0; k < (counts[bi] ?? 0); k++) {
        perBook[bi]?.push(newStockLot(ctx, event.kind, year, book.book, range, rng));
      }
    }
  }

  // 2) 플레이어 위탁 로트: 부 등급으로 북을 정한다
  for (const pending of consignedLots(ctx, event, year)) {
    const bi = books.findIndex((b) => b.book === pending.bookNo);
    perBook[bi]?.push(pending);
  }

  // 3) 북 순서대로, 북 안은 섞고, lotNo 를 이어 준다
  const lots: SaleLot[] = [];
  let lotNo = 0;
  for (let bi = 0; bi < books.length; bi++) {
    for (const pending of rng.shuffle(perBook[bi] ?? [])) {
      lotNo += 1;
      lots.push(finishLot(ctx, event, year, lotNo, pending));
    }
  }

  return { saleId: event.id, year, status: 'catalogued', lots };
}
