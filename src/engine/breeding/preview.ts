import type {
  AssessmentComment,
  Horse,
  MatingPreview,
  MatingRole,
  SireLineId,
  NickEntry,
} from '../types';
import {
  PREVIEW_DIST_HALF_WIDTH,
  PREVIEW_DIST_ROUND,
  PREVIEW_TRAIT_HIGH,
  PREVIEW_TRAIT_LOW,
  SIRE_WEIGHT,
} from '../config/genetics';
import { DIST_OPT_MAX, DIST_OPT_MIN } from '../config/horse';
import { profileOfDistance } from '../horse/generate';
import { buildMatingPedigree, type PedigreeLookup } from './pedigree';
import { dominantCrosses, findInbreeding } from './inbreeding';
import { nickKey, nickLabel, nickValue } from './nicks';

export interface BuildMatingPreviewArgs {
  sire: Horse;
  dam: Horse;
  damsireLineId: SireLineId | null;
  lookup: PedigreeLookup;
  nicks: readonly NickEntry[];
  revealedNicks: ReadonlySet<string>;
  /** 모의 부(외조부) 말. 모르면 생략하거나 null (역할·보완형 힌트가 unknown 이 된다) */
  damsire?: Horse | null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 거리 힌트 한쪽 끝: 값을 PREVIEW_DIST_ROUND 단위로 반올림 후 [DIST_OPT_MIN, DIST_OPT_MAX] */
function roundedDistance(raw: number): number {
  const rounded = Math.round(raw / PREVIEW_DIST_ROUND) * PREVIEW_DIST_ROUND;
  return clamp(rounded, DIST_OPT_MIN, DIST_OPT_MAX);
}

/** 말의 거리 프로필 → 배합 역할: speed → 'speed', classic → 'balanced', middle·cup → 'stamina' */
function matingRoleOf(horse: Horse): MatingRole {
  const profile = profileOfDistance(horse.aptitude.distanceOptimum);
  if (profile === 'speed') return 'speed';
  if (profile === 'classic') return 'balanced';
  return 'stamina';
}

/**
 * 보완형 가능성(공개 정보만): 부가 speed·classic 이고 외조부가 middle·cup 이면 'likely', 아니면 'unlikely'.
 * 외조부를 모르면 'unknown'. 모 자신의 적성은 쓰지 않는다.
 */
function complementHint(sire: Horse, damsire: Horse | null): MatingPreview['complement'] {
  if (damsire === null) return 'unknown';
  const sireIsSpeedy = matingRoleOf(sire) !== 'stamina';
  const damsireIsStayer = matingRoleOf(damsire) === 'stamina';
  return sireIsSpeedy && damsireIsStayer ? 'likely' : 'unlikely';
}

/**
 * 배합 미리보기. 순수 함수(rng 미사용). 숫자 능력치를 담지 않으며,
 * 닉스 값은 공개된 조합일 때만 라벨로 노출한다(미공개면 'unknown').
 */
export function buildMatingPreview(args: BuildMatingPreviewArgs): MatingPreview {
  const { sire, dam, damsireLineId, lookup, nicks, revealedNicks } = args;
  const damsire = args.damsire ?? null;

  // 인브리드 (실존 혈통표 기준)
  const root = buildMatingPedigree(lookup, sire.id, dam.id);
  const inbreeding = dominantCrosses(root, findInbreeding(root));

  // 닉스: 계통 둘 다 있고 공개된 조합일 때만 값을 읽는다
  const sireLine = sire.sireLineId;
  const known =
    sireLine !== null &&
    damsireLineId !== null &&
    revealedNicks.has(nickKey(sireLine, damsireLineId));
  const nickRawValue = known ? nickValue(nicks, sireLine, damsireLineId) : 0;
  const nick = { label: nickLabel(nickRawValue, known), known };

  // 거리 힌트: 부모 최적 거리 평균 ∓ 반폭
  const distanceMid = (sire.aptitude.distanceOptimum + dam.aptitude.distanceOptimum) / 2;
  const distanceHint = {
    min: roundedDistance(distanceMid - PREVIEW_DIST_HALF_WIDTH),
    max: roundedDistance(distanceMid + PREVIEW_DIST_HALF_WIDTH),
  };

  // 조숙/만성: 부모 성장형이 같을 때만 표시
  const precocityHint = sire.growth.type === dam.growth.type ? sire.growth.type : 'unknown';

  // 코멘트 (최대 3개, 앞에서부터 우선순위)
  const parentPotential = (key: 'speed' | 'stamina'): number =>
    SIRE_WEIGHT * sire.potential[key] + (1 - SIRE_WEIGHT) * dam.potential[key];
  const speed = parentPotential('speed');
  const stamina = parentPotential('stamina');
  const soundness = SIRE_WEIGHT * sire.soundness + (1 - SIRE_WEIGHT) * dam.soundness;

  const candidates: AssessmentComment[] = [];
  if (speed >= PREVIEW_TRAIT_HIGH) candidates.push({ key: 'speed_good', tone: 'positive' });
  if (stamina >= PREVIEW_TRAIT_HIGH) candidates.push({ key: 'stamina_stays_well', tone: 'positive' });
  if (stamina <= PREVIEW_TRAIT_LOW) candidates.push({ key: 'stamina_sprinter', tone: 'neutral' });
  if (soundness <= PREVIEW_TRAIT_LOW) candidates.push({ key: 'legs_fragile', tone: 'negative' });

  return {
    sireId: sire.id,
    damId: dam.id,
    nick,
    inbreeding,
    distanceHint,
    precocityHint,
    comments: candidates.slice(0, 3),
    roles: {
      sire: matingRoleOf(sire),
      damSide: damsire === null ? 'unknown' : matingRoleOf(damsire),
    },
    complement: complementHint(sire, damsire),
  };
}
