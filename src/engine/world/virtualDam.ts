import { DAM_AGE_GAP_MAX, DAM_AGE_GAP_MIN } from '../config/world';
import { namingContextFor, type MutableNameRegistry, type NamingStaticData } from '../naming/context';
import { nameForHorse } from '../naming/generate';
import { createRng } from '../rng';
import { pickWeightedSire } from '../state/world';
import type { GameState, HomeCountry, Horse, RealStallionRecord, VirtualDam } from '../types';
import { coverYearForFoal, filterSiresForCover } from './sireWindow';

/**
 * ST2와 같은 모계 선택 규칙. 말 레코드·ID·공용 난수를 소비하지 않는다. records는 key 정렬 순서.
 * 후보 종마가 하나도 없으면(테스트용 빈 기록 등) 가상 모마 없이 null.
 */
export function makeVirtualDam(
  state: GameState,
  data: NamingStaticData,
  records: readonly RealStallionRecord[],
  registry: MutableNameRegistry,
  horse: Horse,
  streamKey: string,
  homeCountry?: HomeCountry,
): VirtualDam | null {
  if (records.length === 0) return null;
  const rng = createRng(`${state.initialSeed}:${streamKey}:${horse.id}`);
  const birthYear = horse.birthYear - rng.int(DAM_AGE_GAP_MIN, DAM_AGE_GAP_MAX);
  const sire = pickWeightedSire(rng, filterSiresForCover(records, coverYearForFoal(birthYear)), homeCountry);
  const context = namingContextFor(state, { ownerId: null, sireId: sire.key, damId: null }, data);
  const name = nameForHorse(context, data.naming, rng, registry);
  registry.add(name);
  return { name, sireId: sire.key, birthYear };
}
