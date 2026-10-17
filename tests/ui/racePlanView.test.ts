import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, it } from 'vitest';
import type { GameState } from '../../src/engine/types';
import { useGame, type GameApi } from '../../src/ui/game/useGame';
import RacePlanPanel from '../../src/ui/horse/RacePlanPanel';
import SeasonScreen from '../../src/ui/season/SeasonScreen';
import { racePlanErrorKo, racePlanRows, upcomingRaceRows } from '../../src/ui/season/racePlanView';

let game: GameApi;
let state: GameState;
let horseId: string;
beforeAll(() => {
  function Capture() {
    game = useGame();
    return null;
  }
  renderToStaticMarkup(createElement(Capture));
  game.newGame({
    seed: 20261011,
    playerName: '가상 마주',
    economyMode: 'casual',
    startType: 'owner_breeder',
    difficulty: 'normal',
    homeCountry: 'GB',
    catastrophicInjuries: false,
    grantRacehorses: true,
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
  const planned = game.proposeRacePlan('missing');
  expect(planned).toEqual({ ok: false, error: 'not_found' });
  // SSR 로 훅을 캡처하므로 ref 를 읽는 API 의 성공 결과로 최신 상태를 얻는다.
  const loaded = game.renameFarm('구름들 목장');
  if (!loaded.ok) throw new Error(loaded.error);
  state = loaded.state;
  horseId = Object.values(state.horses).find(
    (h) =>
      h.ownerId === state.playerOwnerId && state.date.year - h.birthYear === 3 && h.status === 'in_training',
  )!.id;
  expect(game.racePlan(horseId).some((p) => p.status === 'proposed')).toBe(true);
}, 120_000);

it('훅에서 제안·승인·빼기·교체·설정과 조회를 제공하고 조회 결과를 복제한다', () => {
  game.setAutoApproveRacePlans(false);
  const result = game.proposeRacePlan(horseId);
  if (!result.ok) throw new Error(result.error);
  expect(result.state.settings.autoApproveRacePlans).toBe(false);
  const plan = game.racePlan(horseId)[0]!;
  expect(plan.status).toBe('proposed');
  const id = plan.id;
  plan.note = '외부 변경';
  expect(game.racePlan(horseId)[0]!.note).not.toBe('외부 변경');
  const approved = game.approvePlan(horseId, id);
  if (!approved.ok) throw new Error(approved.error);
  expect(game.racePlan(horseId)[0]!.status).toBe('approved');
  expect(game.removePlan(horseId, id).ok).toBe(true);
  expect(game.racePlan(horseId).some((p) => p.id === id)).toBe(false);
  expect(game.setRacePlan(horseId, game.racePlan(horseId)).ok).toBe(true);
  game.setAutoApproveRacePlans(true);
  const auto = game.proposeRacePlan(horseId);
  if (!auto.ok) throw new Error(auto.error);
  state = auto.state;
  expect(game.racePlan(horseId).every((p) => p.status === 'approved')).toBe(true);
  expect(game.upcomingRaces(12)).toHaveLength(12);
});

it('캘린더는 경주 화면, 제안 검토는 말 상세 출주 계획 탭에 표시한다', () => {
  const proposed = game.racePlan(horseId).map((plan) => ({ ...plan, status: 'proposed' as const }));
  const saved = game.setRacePlan(horseId, proposed);
  if (!saved.ok) throw new Error(saved.error);
  const rows = racePlanRows(proposed);
  expect(rows[0]).toMatchObject({ statusLabel: '조교사 제안(진행 예정)', canApprove: true, canRemove: true });
  expect(rows[0]!.name).toMatch(/m/);
  expect(racePlanRows(proposed.map((p) => ({ ...p, status: 'run' })))[0]).toMatchObject({
    statusLabel: '출주 완료',
    canApprove: false,
    canRemove: false,
  });
  expect(racePlanErrorKo('plan_not_found')).toContain('찾을 수');
  const calendar = upcomingRaceRows(game.upcomingRaces(12));
  expect(calendar[1]!.meetings.some((m) => m.label.includes('개최 예정'))).toBe(true);
  expect(calendar[2]!.meetings.some((m) => m.label.includes('개최 후보'))).toBe(true);
  expect(calendar[2]!.meetings[0]!.expected).toContain('핸디캡 80%');
  const html = renderToStaticMarkup(createElement(SeasonScreen, { game: { ...game, state: saved.state } }));
  expect(html).toContain('앞으로 12주 레이스');
  expect(html).not.toContain('조교사에게 다시 짜기');
  const detail = renderToStaticMarkup(
    createElement(RacePlanPanel, {
      horse: saved.state.horses[horseId]!,
      game: { ...game, state: saved.state },
      locked: false,
    }),
  );
  expect(detail).toContain('자동 출주 예정');
  expect(detail).not.toContain('승인</button>');
  expect(detail).toContain('제외</button>');
  expect(detail).toContain('앞으로 12주에서 골라 추가');
});

it('설정과 출주 계획은 저장·불러오기 뒤에도 유지된다', async () => {
  await game.save();
  const plans = game.racePlan(horseId);
  game.setAutoApproveRacePlans(false);
  game.setRacePlan(horseId, []);
  expect(await game.load()).toBe(true);
  expect(game.racePlan(horseId)).toEqual(plans);
  const saved = game.setRacePlan(horseId, plans);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.state.settings.autoApproveRacePlans).toBe(true);
});

it('새 게임의 자동 제안을 승인하고 마구간·상세를 그린 뒤 4주 진행해도 상태가 유효하다', async () => {
  const { default: HorseDetail } = await import('../../src/ui/horse/HorseDetail');
  const { default: StableScreen } = await import('../../src/ui/stable/StableScreen');
  const nextPlan = game.racePlan(horseId).find((p) => p.status === 'proposed')!;
  const result = game.approvePlan(horseId, nextPlan.id);
  if (!result.ok) throw new Error(result.error);
  const start = result.state.date;
  const latest = { ...game, state: result.state };
  expect(renderToStaticMarkup(createElement(StableScreen, { state: result.state }))).toContain('마구간');
  expect(
    renderToStaticMarkup(
      createElement(WeightUnitProvider, {
        children: createElement(HorseDetail, {
          game: latest,
          horseId,
          initialTab: 'plan',
          onClose: () => {},
          onBreeding: () => {},
        }),
      }),
    ),
  ).toContain('확정');
  game.advance(4);
  const advanced = game.setRacePlan(horseId, game.racePlan(horseId));
  if (!advanced.ok) throw new Error(advanced.error);
  expect(advanced.state.date).toEqual({ year: start.year, week: start.week + 4 });
  expect(renderToStaticMarkup(createElement(StableScreen, { state: advanced.state }))).toContain('마구간');
  expect(
    renderToStaticMarkup(
      createElement(WeightUnitProvider, {
        children: createElement(HorseDetail, {
          game: { ...game, state: advanced.state },
          horseId,
          initialTab: 'plan',
          onClose: () => {},
          onBreeding: () => {},
        }),
      }),
    ),
  ).toContain('출주 계획');
});
