import { describe, expect, it } from 'vitest';
import { emptyFarm } from '../../src/engine/config/farm';
import { getNamingData } from '../../src/engine/data/staticData';
import { renameFarm, validateFarmName } from '../../src/engine/farm/naming';
import { purchaseFarm } from '../../src/engine/farm/purchase';
import { createNewGame } from '../../src/engine/state/newGame';

const options = { seed: 20261016, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };
function fixture() {
  const state = createNewGame({ ...options, difficulty: 'normal' });
  state.farmListings = [{ id: 'listing', name: '달그늘 목장', country: 'IE', size: 'large', price: 100_000 }];
  return state;
}

describe('목장 이름 검증', () => {
  it.each([
    ['', 'too_short'], [' 가 ', 'too_short'], ['가'.repeat(31), 'too_long'],
    ['구름123', 'invalid_chars'], ['구름_목장', 'invalid_chars'], ['구름🌿', 'invalid_chars'],
    ['---', 'invalid_chars'],
  ] as const)('%s → %s', (name, error) => {
    expect(validateFarmName(fixture(), name)).toBe(error);
  });

  it('글자·공백·하이픈·아포스트로피·마침표, 2자·30자 경계와 앞뒤 공백', () => {
    const state = fixture();
    for (const name of ["  구름-들 목장.  ", "Étoile d'Aube", '구름', '가'.repeat(30)]) {
      expect(validateFarmName(state, name), name).toBeNull();
    }
  });

  it('다른 마주의 목장·생산자 이름은 구두점과 대소문자를 달리해도 중복', () => {
    const state = fixture();
    state.owners.ai = { ...state.owners[state.playerOwnerId]!, id: 'ai', isPlayer: false, studName: '구름들 목장' };
    expect(validateFarmName(state, '구름들-목장')).toBe('taken');
    const renamed = renameFarm(state, '달빛 목장');
    expect(renamed.ok && validateFarmName(renamed.state, '달빛 목장')).toBeNull();
    state.breeders.b = { id: 'b', name: '안개들 목장', country: 'GB', scale: 'small', funds: 0, horseIds: [] };
    expect(validateFarmName(state, '안개들 목장')).toBe('taken');
  });

  it('보호 이름·경마장 차단 지명은 포함될 때도 거절', () => {
    const naming = getNamingData();
    const protectedName = [...naming.protectedNames].find(n => n.length >= 4 && n.length <= 20)!;
    const place = [...naming.blockedPlaceTokens].find(n => n.length <= 20)!;
    expect(validateFarmName(fixture(), `${protectedName} Farm`)).toBe('protected');
    expect(validateFarmName(fixture(), `${place} Farm`)).toBe('protected');
  });
});

it('새 게임 farmName 지정·공백 제거·빈칸 기존 규칙·난이도 생략 경로 보존', () => {
  const named = createNewGame({ ...options, farmName: '  달빛 목장  ' });
  expect(named.farm.name).toBe('달빛 목장');
  expect(named.owners[named.playerOwnerId]!.studName).toBe('달빛 목장');
  expect(createNewGame({ ...options, farmName: ' ' })).toEqual(createNewGame(options));
  const legacy = createNewGame({ ...options, studName: '기존 목장' });
  expect(legacy.farm.name).toBe('기존 목장');
  expect(createNewGame({ ...options, difficulty: 'normal', startType: 'owner', farmName: '달빛 목장' }).farm).toEqual(emptyFarm());
  expect(() => createNewGame({ ...options, farmName: 'x' })).toThrow();
});

it('이름 변경은 목장·마주 동기화, 원본·rng·장부 불변', () => {
  const state = fixture();
  const before = structuredClone(state);
  const result = renameFarm(state, '  달빛 목장  ');
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.farm.name).toBe('달빛 목장');
  expect(result.state.owners[state.playerOwnerId]!.studName).toBe('달빛 목장');
  expect(result.events).toEqual([]);
  expect(result.state.rng).toEqual(state.rng);
  expect(result.state.economy).toEqual(state.economy);
  expect(state).toEqual(before);
  expect(renameFarm(state, 'x')).toEqual({ ok: false, error: 'too_short' });
  state.farm = emptyFarm();
  expect(renameFarm(state, '달빛 목장')).toEqual({ ok: false, error: 'no_farm' });
});

it('구매·이전 이름 지정, 생략 시 매물 이름, 잘못된 이름은 지출·원본 변경 없음', () => {
  for (const owned of [false, true]) {
    const state = fixture();
    if (!owned) state.farm = emptyFarm();
    const before = structuredClone(state);
    const result = purchaseFarm(state, 'listing', '  달빛 목장  ');
    expect(result.ok).toBe(true);
    if (!result.ok) continue;
    expect(result.state.farm.name).toBe('달빛 목장');
    expect(result.state.owners[state.playerOwnerId]!.studName).toBe('달빛 목장');
    expect(result.state.rng).toEqual(state.rng);
    const defaultName = purchaseFarm(state, 'listing');
    expect(defaultName.ok && defaultName.state.farm.name).toBe('달그늘 목장');
    expect(purchaseFarm(state, 'listing', 'x')).toEqual({ ok: false, error: 'too_short' });
    expect(purchaseFarm(state, 'missing', '달빛 목장')).toEqual({ ok: false, error: 'not_found' });
    expect(state).toEqual(before);
  }
});
