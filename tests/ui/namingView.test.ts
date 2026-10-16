import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { getSalesData } from '../../src/engine/data/staticData';
import { generateHorse } from '../../src/engine/horse/generate';
import { assessForPlayer } from '../../src/engine/horse/playerView';
import { displayName } from '../../src/engine/naming/register';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import HorseCard from '../../src/ui/breeding/HorseCard';
import { declareErrorKo } from '../../src/ui/game/text';
import { useGame, type GameApi } from '../../src/ui/game/useGame';
import { consignableRows } from '../../src/ui/sales/salesView';
import { playerHorses } from '../../src/ui/season/seasonView';
import { yearEndView } from '../../src/ui/yearEnd/yearEndView';

const options = { seed: 20261016, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' as const } };

function unnamedHorse() {
  return { ...generateHorse(createRng('ui-naming'), {
    id: 'unnamed-foal', name: 'Silver Lantern', sex: 'female', birthYear: 2027,
    currentYear: 2029, countryOfBirth: 'GB', status: 'in_training', level: 50,
  }), nameRegistered: false as const };
}

it('말 카드·시즌·세일 위탁·연말 정산은 후보 이름을 노출하지 않는다', () => {
  const state = createNewGame(options);
  state.date = { year: 2029, week: 1 };
  const horse = unnamedHorse();
  horse.ownerId = state.playerOwnerId;
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  const name = displayName(state, horse);
  expect(playerHorses(state).find(h => h.id === horse.id)!.name).toBe(name);
  expect(consignableRows(state, { sales: getSalesData() }).find(h => h.horseId === horse.id)!.horseName).toBe(name);
  expect(yearEndView(state).horses.find(h => h.horseId === horse.id)!.name).toBe(name);
  const html = renderToStaticMarkup(createElement(HorseCard, {
    state, horse, ageYears: 2, assessment: assessForPlayer(state, horse.id),
    parentage: { sire: '—', dam: '—', damsire: '—' }, lineLabel: '—',
  }));
  expect(html).toContain(name);
  expect(html).not.toContain(horse.name);
  expect(declareErrorKo('unnamed')).toBe('이름을 등록해야 출주할 수 있습니다.');
});

it('useGame 후보 생성은 rng 불변, 등록 이벤트는 eventLog에 한 번 누적', async () => {
  let api: GameApi | undefined;
  function Capture() { api = useGame(); return null; }
  renderToStaticMarkup(createElement(Capture));
  const game = api!;
  const input = { ...options, economyMode: 'casual' as const, startType: 'owner_breeder' as const,
    difficulty: 'normal' as const, homeCountry: 'GB' as const,
    catastrophicInjuries: true, grantRacehorses: true, farmName: '달빛 목장' };
  expect(() => game.newGame({ ...input, farmName: 'x' })).toThrow('목장 이름은 2자 이상');
  game.newGame(input);
  const renamed = game.renameFarm('구름들 목장');
  expect(renamed.ok).toBe(true);
  if (!renamed.ok) return;
  const state = renamed.state;
  const horse = unnamedHorse();
  horse.ownerId = state.playerOwnerId;
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  const rngBefore = { ...state.rng };
  const candidates = game.nameSuggestions(horse.id, 0);
  expect(candidates).toHaveLength(8);
  expect(game.nameSuggestions(horse.id, 0)).toEqual(candidates);
  expect(state.rng).toEqual(rngBefore);
  const result = game.registerHorseName(horse.id, candidates[1]!);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.eventLog.filter(e => e.type === 'horse_named')).toEqual(result.events);
  expect(game.registerHorseName(horse.id, candidates[2]!)).toEqual({ ok: false, error: 'already_registered' });
  expect(result.state.owners[state.playerOwnerId]!.studName).toBe('구름들 목장');
  await game.save();
});
