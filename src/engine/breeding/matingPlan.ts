import * as config from '../config/mating';
import { DUE_WEEK_KEY_YEAR_SCALE, MARE_MIN_BREEDING_AGE } from '../config/breedingSeason';
import { PHASE_WINDOWS } from '../config/game';
import { BOOKING_OPEN_WEEK, FEE_PROGENY_MULT_MIN, FEE_PROGENY_MULT_MAX } from '../config/stud';
import { progenyMultiplier } from '../stud/market';
import { publicFertility } from '../stud/fertility';
import { horseProfile } from '../stud/nh';
import { privateAccess } from '../stud/private';
import { peakOfficialRating } from '../stud/value';
import type { GameEvent, GameState, HorseId, MatingProposal, Money, NickEntry, RealStallionRecord, WeeklySystem } from '../types';
import { dominantCrosses, findInbreeding, totalBloodPercent } from './inbreeding';
import { nickKey, nickLabel, nickValue } from './nicks';
import { buildMatingPedigree, type PedigreeLookup } from './pedigree';
import { buildMatingPreview } from './preview';
import { createPedigreeLookup } from './realPedigree';
import { bookCovering, bookingSeasonOf, damsireLineOf, debtMatingAllowed, familyScore, mareFertility, nominationsLeft, type BookingError } from './season';

export interface MatingPlanData {
  nicks: readonly NickEntry[];
  stallionRecords?: readonly RealStallionRecord[];
}
export type MatingPlanError = 'not_found' | 'not_player_mare' | 'not_booking_window' | 'invalid_status' | 'stallion_not_available' | 'invalid_fee_cap';
export type MatingPlanResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: MatingPlanError };
const BREEDING_END_WEEK = Math.max(...PHASE_WINDOWS.breeding.map((w) => w.endWeek));
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function playerMareError(state: GameState, mareId: HorseId): MatingPlanError | null {
  const horse = state.horses[mareId];
  if (horse === undefined || state.mares[mareId] === undefined) return 'not_found';
  return horse.ownerId !== state.playerOwnerId || horse.status !== 'broodmare' ? 'not_player_mare' : null;
}

/** 숨은 능력치 대신 본인 최고 OR·블랙타입 산자·모계 명성·나이별 수태율을 쓴다. */
export function mareQuality(state: GameState, mareId: HorseId): number {
  const horse = state.horses[mareId];
  const mare = state.mares[mareId];
  if (horse === undefined || mare === undefined) return 0;
  const w = config.MATING_QUALITY_WEIGHTS;
  const rating = clamp01(((peakOfficialRating(state, mareId) ?? config.MATING_UNRATED_OR) - config.MATING_OR_MIN)
    / (config.MATING_OR_MAX - config.MATING_OR_MIN));
  return Math.round(config.MATING_QUALITY_MAX * (w.rating * rating
    + w.produce * clamp01(mare.blackTypeProduce / config.MATING_PRODUCE_TARGET)
    + w.family * familyScore(state, mareId) + w.fertility * mareFertility(state.date.year - horse.birthYear)));
}

export function mareQualityNote(state: GameState, mareId: HorseId): string {
  const horse = state.horses[mareId];
  if (horse === undefined || state.mares[mareId] === undefined) return '기록 없음';
  return `수준 ${mareQuality(state, mareId)} · 최고 OR ${peakOfficialRating(state, mareId) ?? '미상'} · 블랙타입 산자 ${state.mares[mareId]!.blackTypeProduce} · ${state.date.year - horse.birthYear}세`;
}

export function matingFeeBudget(state: GameState, mareId: HorseId): Money {
  return state.settings.matingFeeCap ?? Math.round(config.MATING_FEE_MIN
    * (config.MATING_FEE_MAX / config.MATING_FEE_MIN) ** (mareQuality(state, mareId) / config.MATING_QUALITY_MAX));
}

function eligibleMare(state: GameState, mareId: HorseId, season: number): boolean {
  if (playerMareError(state, mareId) !== null) return false;
  const mare = state.mares[mareId]!;
  return state.date.year - state.horses[mareId]!.birthYear >= MARE_MIN_BREEDING_AGE
    && mare.bookedFor?.season !== season && !(mare.coveredBy !== null && !mare.pregnant)
    && !(mare.pregnant && (mare.dueWeek === null || mare.dueWeek >= season * DUE_WEEK_KEY_YEAR_SCALE + BREEDING_END_WEEK));
}

export function matingStallionAvailable(state: GameState, stallionId: HorseId, season: number): boolean {
  const stallion = state.stallions[stallionId];
  return stallion !== undefined && state.horses[stallionId]?.status === 'stud'
    && stallion.firstSeasonYear <= season && (stallion.lastSeasonYear === undefined || season <= stallion.lastSeasonYear)
    && (stallion.leasedAwayUntil == null || stallion.leasedAwayUntil <= season)
    && (stallion.bookingSeason !== season || stallion.bookedThisSeason < stallion.bookLimit)
    && stallion.bookLimit > 0
    && (state.horses[stallionId]?.ownerId === state.playerOwnerId || privateAccess(state, stallionId, state.playerOwnerId) !== 'denied');
}

function usesOf(state: GameState, stallionId: HorseId, season: number, excluding: HorseId): number {
  return (state.stud.matingProposals ?? []).filter((p) => p.season === season && p.mareId !== excluding
    && p.status !== 'skipped' && (p.bookedStallionId ?? p.stallionId) === stallionId).length;
}

/** 예약 대기 중인 무료 교배권도 고려해 일괄 제안에서 같은 권리를 중복 예산으로 잡지 않는다. */
export function matingExpectedFee(state: GameState, stallionId: HorseId, season: number, mareId: HorseId): Money {
  if (state.horses[stallionId]?.ownerId === state.playerOwnerId) return 0;
  const pendingRights = (state.stud.matingProposals ?? []).filter((p) => p.season === season && p.mareId !== mareId
    && (p.status === 'proposed' || p.status === 'approved') && p.stallionId === stallionId && p.expectedFee === 0).length;
  return nominationsLeft(state, stallionId, season) > pendingRights ? 0 : state.stallions[stallionId]?.fee ?? 0;
}

export function matingInbreeding(lookup: PedigreeLookup, sireId: HorseId, mareId: HorseId) {
  const root = buildMatingPedigree(lookup, sireId, mareId);
  const crosses = findInbreeding(root);
  return { bloodPercent: totalBloodPercent(dominantCrosses(root, crosses)), close: crosses.some((c) =>
    c.sireSide.some((g) => g <= config.MATING_CLOSE_GENERATION) && c.damSide.some((g) => g <= config.MATING_CLOSE_GENERATION)) };
}

function proposal(state: GameState, data: MatingPlanData, mareId: HorseId, season: number, lookup: PedigreeLookup): MatingProposal | null {
  if (!eligibleMare(state, mareId, season)) return null;
  const dam = state.horses[mareId]!;
  const damsire = dam.sireId === null ? null : state.horses[dam.sireId] ?? null;
  const budget = matingFeeBudget(state, mareId);
  const revealed = new Set(state.breeding.revealedNicks);
  const inDebt = state.economy.mode === 'casual' && state.economy.debt > 0;
  const options = Object.keys(state.stallions).sort(compareId).flatMap((id) => {
    if (!matingStallionAvailable(state, id, season)) return [];
    const own = state.horses[id]!.ownerId === state.playerOwnerId;
    const uses = usesOf(state, id, season, mareId);
    if (!own && uses >= config.MATING_MAX_PER_STALLION) return [];
    const stallion = state.stallions[id]!;
    const pending = (state.stud.matingProposals ?? []).filter((p) => p.season === season && p.mareId !== mareId
      && (p.status === 'proposed' || p.status === 'approved') && p.stallionId === id).length;
    if ((stallion.bookingSeason === season ? stallion.bookedThisSeason : 0) + pending >= stallion.bookLimit) return [];
    const fee = matingExpectedFee(state, id, season, mareId);
    if (fee > budget) return [];
    // 캐주얼 빚이 있으면 예약할 수 있는 저가 종마(4~5티어)만 제안한다(M6 사용자 결정)
    if (inDebt && fee > 0 && !debtMatingAllowed(state, fee, state.playerOwnerId)) return [];
    const inbreeding = matingInbreeding(lookup, id, mareId);
    if (inbreeding.close || inbreeding.bloodPercent > config.MATING_MAX_BLOOD_PERCENT) return [];
    const sire = state.horses[id]!;
    const damLine = damsireLineOf(state, dam);
    const known = sire.sireLineId !== null && damLine !== null && revealed.has(nickKey(sire.sireLineId, damLine));
    const nick = known ? nickValue(data.nicks, sire.sireLineId, damLine) : 0;
    const preview = buildMatingPreview({ sire, dam, damsire, damsireLineId: damLine, lookup, nicks: data.nicks, revealedNicks: revealed });
    const profile = horseProfile(sire);
    const maternalStamina = ['middle', 'cup'].includes(horseProfile(dam)) || preview.roles.damSide === 'stamina';
    const distance = maternalStamina && (profile === 'speed' || profile === 'classic') ? config.MATING_DISTANCE_COMPLEMENT
      : profile === 'cup' && (horseProfile(dam) === 'cup' || (damsire !== null && horseProfile(damsire) === 'cup'))
        ? config.MATING_DISTANCE_CUP_PENALTY : 0;
    const fertility = publicFertility(stallion);
    const rate = fertility.kind === 'none' ? 0 : fertility.kind === 'range' ? (fertility.low + fertility.high) / 2 : fertility.rate;
    const feeLevel = clamp01(Math.log1p(stallion.fee / config.MATING_FEE_MIN) / Math.log1p(config.MATING_FEE_MAX / config.MATING_FEE_MIN));
    const produce = clamp01((progenyMultiplier(state, id) - FEE_PROGENY_MULT_MIN) / (FEE_PROGENY_MULT_MAX - FEE_PROGENY_MULT_MIN));
    const level = config.MATING_SIRE_FEE_WEIGHT * feeLevel + config.MATING_SIRE_PRODUCE_WEIGHT * produce;
    const w = config.MATING_SCORE_WEIGHTS;
    const score = w.level * level + w.nick * nick + w.distance * distance + w.fertility * rate
      + w.efficiency * level * (1 - fee / Math.max(1, budget)) + (own ? w.own : 0);
    const label = nickLabel(nick, known);
    const note = [label === 'excellent' ? '니크 매우 좋음' : label === 'good' ? '니크 좋음' : known ? '공개 니크 참고' : '니크 미공개',
      distance > 0 ? '스피드 보완' : distance < 0 ? '장거리 편중' : '거리 적성 고려', own ? '자기 종마' : null,
      `예산 €${budget.toLocaleString('en-US')} 안`].filter((s) => s !== null).join(' · ');
    return [{ id, fee, score, note }];
  }).sort((a, b) => b.score - a.score || compareId(a.id, b.id));
  const best = options[0];
  return best === undefined ? null : { mareId, season, stallionId: best.id,
    alternatives: options.slice(1, config.MATING_ALTERNATIVES + 1).map((o) => o.id), expectedFee: best.fee, note: best.note, status: 'proposed' };
}

export function proposeMating(state: GameState, data: MatingPlanData, mareId: HorseId, season = bookingSeasonOf(state.date)): MatingProposal | null {
  if (season === null) return null;
  return proposal(state, data, mareId, season, createPedigreeLookup(state.horses, data.stallionRecords ?? []));
}

/** 기존 확정·제외 기록은 호출자가 보존한다. id 순으로 새 제안을 쌓아 쏠림·무료권을 계산한다. */
export function proposeAllMatings(state: GameState, data: MatingPlanData, season = bookingSeasonOf(state.date)): MatingProposal[] {
  if (season === null) return [];
  const proposals = [...(state.stud.matingProposals ?? [])];
  const working = { ...state, stud: { ...state.stud, matingProposals: proposals } };
  // 혈통 조회 표는 만들기 비싸므로 실제로 제안할 암말이 있을 때만 만든다(M6-P)
  let lookup: PedigreeLookup | undefined;
  const added: MatingProposal[] = [];
  for (const id of Object.keys(state.mares).sort(compareId)) {
    if (proposals.some((p) => p.season === season && p.mareId === id)) continue;
    if (!eligibleMare(working, id, season)) continue;
    lookup ??= createPedigreeLookup(state.horses, data.stallionRecords ?? []);
    const p = proposal(working, data, id, season, lookup);
    if (p !== null) { proposals.push(p); added.push(p); }
  }
  return added;
}

const BOOKING_REASON: Record<BookingError, string> = {
  not_breeding_season: '예약 창이 닫힘', not_your_mare: '플레이어 번식 암말이 아님', not_a_broodmare: '번식 암말이 아님',
  mare_too_young: '교배 가능한 나이가 아님', already_pregnant: '임신 중으로 예약할 수 없음', already_covered: '이미 교배 예약됨',
  stallion_not_available: '종마가 교배할 수 없음', book_full: '북 마감', private_stallion: '비공개 종마 허가 없음', insufficient_funds: '자금 부족',
};

function currentProposal(state: GameState, mareId: HorseId): MatingProposal | undefined {
  return state.stud.matingProposals?.find((p) => p.mareId === mareId && p.season === bookingSeasonOf(state.date));
}

export function approveMating(state: GameState, mareId: HorseId): MatingPlanResult {
  const error = playerMareError(state, mareId);
  if (error !== null) return { ok: false, error };
  if (bookingSeasonOf(state.date) === null) return { ok: false, error: 'not_booking_window' };
  const p = currentProposal(state, mareId);
  if (p === undefined) return { ok: false, error: 'not_found' };
  if (p.status !== 'proposed' && p.status !== 'approved') return { ok: false, error: 'invalid_status' };
  const reasons: string[] = [];
  for (const id of [...new Set([p.stallionId, ...p.alternatives])]) {
    const own = state.horses[id]?.ownerId === state.playerOwnerId;
    const fee = own || nominationsLeft(state, id, p.season) > 0 ? 0 : state.stallions[id]?.fee ?? 0;
    // 검토 중 가격·상한·교배권이 바뀌어도 승인 시 예산을 넘겨 지출하지 않는다.
    if (fee > matingFeeBudget(state, mareId)) { reasons.push('종부료 예산 초과'); continue; }
    // bookCovering 은 옛 예약 API이므로 현재 계류 여부도 여기서 확인한다.
    const result = matingStallionAvailable(state, id, p.season)
      ? bookCovering(state, state.playerOwnerId, mareId, id) : null;
    if (result?.ok) {
      const booked = currentProposal(result.state, mareId)!;
      booked.status = 'booked';
      booked.bookedStallionId = id;
      if (id !== p.stallionId) booked.note = `${[...new Set(reasons)].join(' · ')} · 대안 종마로 예약`;
      return result;
    }
    const stallion = state.stallions[id];
    reasons.push(result === null ? stallion?.bookingSeason === p.season && stallion.bookedThisSeason >= stallion.bookLimit
      ? '북 마감' : '종마가 교배할 수 없음' : BOOKING_REASON[result.error]);
  }
  const next = structuredClone(state);
  const skipped = currentProposal(next, mareId)!;
  skipped.status = 'skipped';
  skipped.note = [...new Set(reasons)].join(' · ');
  return { ok: true, state: next, events: [{ type: 'mating_proposal_skipped', mareId, reason: skipped.note, date: { ...state.date } }] };
}

export function approveAllMatings(state: GameState): MatingPlanResult {
  if (bookingSeasonOf(state.date) === null) return { ok: false, error: 'not_booking_window' };
  let next = state;
  const events: GameEvent[] = [];
  const proposals = (state.stud.matingProposals ?? []).filter((p) => p.season === bookingSeasonOf(state.date)
    && (p.status === 'proposed' || p.status === 'approved')).sort((a, b) => compareId(a.mareId, b.mareId));
  for (const p of proposals) {
    const result = approveMating(next, p.mareId);
    if (!result.ok) continue;
    next = result.state;
    events.push(...result.events);
  }
  return { ok: true, state: next, events };
}

export function changeMating(state: GameState, mareId: HorseId, stallionId: HorseId): MatingPlanResult {
  const error = playerMareError(state, mareId);
  if (error !== null) return { ok: false, error };
  const season = bookingSeasonOf(state.date);
  if (season === null) return { ok: false, error: 'not_booking_window' };
  const p = currentProposal(state, mareId);
  if (p === undefined) return { ok: false, error: 'not_found' };
  if (p.status !== 'proposed') return { ok: false, error: 'invalid_status' };
  if (!matingStallionAvailable(state, stallionId, season)) return { ok: false, error: 'stallion_not_available' };
  const next = structuredClone(state);
  const changed = currentProposal(next, mareId)!;
  changed.stallionId = stallionId;
  changed.alternatives = [...new Set([p.stallionId, ...p.alternatives])].filter((id) => id !== stallionId).slice(0, config.MATING_ALTERNATIVES);
  changed.expectedFee = matingExpectedFee(next, stallionId, season, mareId);
  changed.note = '플레이어가 교배 상대를 바꿈';
  return { ok: true, state: next, events: [] };
}

export function removeMating(state: GameState, mareId: HorseId): MatingPlanResult {
  const error = playerMareError(state, mareId);
  if (error !== null) return { ok: false, error };
  if (bookingSeasonOf(state.date) === null) return { ok: false, error: 'not_booking_window' };
  const p = currentProposal(state, mareId);
  if (p === undefined) return { ok: false, error: 'not_found' };
  if (p.status !== 'proposed') return { ok: false, error: 'invalid_status' };
  const next = structuredClone(state);
  const removed = currentProposal(next, mareId)!;
  removed.status = 'skipped';
  removed.note = '이번 시즌 교배 제안에서 뺌';
  return { ok: true, state: next, events: [] };
}

export function setMatingFeeCap(state: GameState, cap: Money | null): MatingPlanResult {
  if (cap !== null && (!Number.isSafeInteger(cap) || cap < 0)) return { ok: false, error: 'invalid_fee_cap' };
  return { ok: true, state: { ...state, settings: { ...state.settings, matingFeeCap: cap } }, events: [] };
}

export function replanMatings(state: GameState, data: MatingPlanData): MatingPlanResult {
  const season = bookingSeasonOf(state.date);
  if (season === null) return { ok: false, error: 'not_booking_window' };
  const keep = (state.stud.matingProposals ?? []).filter((p) => p.season === season && (p.status === 'booked' || p.status === 'skipped'));
  const next = { ...state, stud: { ...state.stud, matingProposals: structuredClone(keep) } };
  next.stud.matingProposals.push(...proposeAllMatings(next, data, season));
  return next.settings.autoApproveMatings ? approveAllMatings(next) : { ok: true, state: next, events: [] };
}

/** breeding → stud_books → mating_plans 순서 권장: 시즌 정리·AI 북 반영 뒤 현재 여유로 제안한다. */
export function createMatingPlansSystem(data: MatingPlanData): WeeklySystem {
  return { id: 'mating_plans', run(draft, ctx) {
    const season = bookingSeasonOf(ctx.date);
    const existing = draft.stud.matingProposals;
    if (existing !== undefined) {
      for (const p of existing) {
        if (p.status === 'proposed' && (p.season < ctx.date.year || (p.season === ctx.date.year && ctx.date.week > BREEDING_END_WEEK))) {
          p.status = 'skipped';
          p.note = '검토하지 않아 지나감';
        }
      }
    }
    if (season === null) return [];
    if (existing !== undefined) draft.stud.matingProposals = existing.filter((p) => p.season >= season);
    const added = proposeAllMatings(draft, data, season);
    if (added.length > 0) (draft.stud.matingProposals ??= []).push(...added);
    const events: GameEvent[] = ctx.date.week === BOOKING_OPEN_WEEK && added.length > 0
      ? [{ type: 'mating_proposals_ready', season, count: added.length, date: { ...ctx.date } }] : [];
    // true: 제안 즉시 예약 / 없음(기본, 사용자 결정 2026-10-16 '그대로 진행'): 시즌 해 MATING_AUTO_BOOK_WEEK 부터
    // 빼지 않은 제안을 예약 / false: 승인한 것만.
    const mode = draft.settings.autoApproveMatings;
    const due = mode === true ? added
      : mode === undefined && ctx.date.year === season && ctx.date.week >= config.MATING_AUTO_BOOK_WEEK
        ? (draft.stud.matingProposals ?? []).filter((p) => p.season === season && p.status === 'proposed')
          .sort((a, b) => compareId(a.mareId, b.mareId))
        : [];
    for (const p of due) {
      const result = approveMating(draft, p.mareId);
      if (!result.ok) continue;
      Object.assign(draft, result.state);
      events.push(...result.events);
    }
    return events;
  } };
}
