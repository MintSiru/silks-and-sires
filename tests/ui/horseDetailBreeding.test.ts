import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import type { GameEvent, GameState, Horse, HorseStatus, Mare } from '../../src/engine/types';
import { displayName } from '../../src/engine/naming/register';
import { formatDateKo } from '../../src/engine/time/calendar';
import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import type { GameApi } from '../../src/ui/game/useGame';
import {
  MARE_HISTORY_SEASONS,
  mareBreedingView,
  mareCoveringHistory,
} from '../../src/ui/horse/horseDetailView';
import HorseDetail from '../../src/ui/horse/HorseDetail';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

function addHorse(state: GameState, status: HorseStatus, id: string = status): Horse {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: state.date.year - 4,
    currentYear: state.date.year,
    sex: 'female',
    countryOfBirth: 'GB',
    status,
    level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  state.horses[id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(id);
  return horse;
}

function addMare(state: GameState, id: string, patch: Partial<Mare> = {}): Mare {
  const horse = addHorse(state, 'broodmare', id);
  const mare: Mare = {
    horseId: horse.id,
    coveredBy: null,
    coveredWeek: null,
    pregnant: false,
    dueWeek: null,
    foals: [],
    blackTypeProduce: 0,
    ...patch,
  };
  state.mares[horse.id] = mare;
  return mare;
}

function renderBreeding(state: GameState, horseId: string): string {
  const game = { state } as GameApi;
  return renderToStaticMarkup(
    createElement(WeightUnitProvider, {
      children: createElement(HorseDetail, {
        game,
        horseId,
        initialTab: 'breeding',
        onClose() {},
        onBreeding() {},
      }),
    }),
  );
}

describe('M7-D 말 상세 임신/교배 탭', () => {
  it('임신 중 암말은 번식 상태·출산 예정 날짜를 보이고 번식 화면 링크를 유지한다', () => {
    const state = fixture();
    const due = { year: state.date.year + 1, week: 12 };
    addMare(state, 'mare-due', { pregnant: true, dueWeek: due.year * 100 + due.week });
    const html = renderBreeding(state, 'mare-due');
    expect(html).toContain('임신/교배');
    expect(html).toContain('출산 예정');
    expect(html).toContain(formatDateKo(due));
    expect(html).toContain('임신 중');
    expect(html).toContain('번식 화면에서 배합하기');
  });

  it('지난 교배 이력은 최근 3시즌만 시즌·종마·수태 결과로 보이고 이번 시즌은 빠진다', () => {
    const state = fixture();
    const year = state.date.year;
    const mare = addMare(state, 'mare-hist');
    const sire = addHorse(state, 'stud', 'sire-hist');
    const cover = (season: number): GameEvent => ({
      type: 'covering_booked',
      mareId: mare.horseId,
      stallionId: sire.id,
      fee: 1000,
      date: { year: season, week: 20 },
    });
    state.eventLog = [
      cover(year - 4),
      cover(year - 3),
      { type: 'conception', mareId: mare.horseId, stallionId: sire.id, success: false, date: { year: year - 3, week: 25 } },
      cover(year - 2),
      { type: 'conception', mareId: mare.horseId, stallionId: sire.id, success: true, date: { year: year - 2, week: 25 } },
      cover(year - 1),
      cover(year),
    ];
    const history = mareCoveringHistory(state, mare.horseId, (id) => id);
    expect(history.map((r) => r.season)).toEqual([year - 1, year - 2, year - 3]);
    expect(history.length).toBe(MARE_HISTORY_SEASONS);
    expect(history.find((r) => r.season === year - 2)!.resultKo).toBe('수태 성공');
    expect(history.find((r) => r.season === year - 3)!.resultKo).toBe('수태 실패');
    expect(history.find((r) => r.season === year - 1)!.resultKo).toBe('판정 기록 없음');

    const html = renderBreeding(state, mare.horseId);
    expect(html).toContain('지난 3시즌 교배 이력');
    expect(html).toContain(`${year - 2} 시즌 · ${displayName(state, sire)} · 수태 성공`);
    expect(html).not.toContain(`${year - 4} 시즌`);
  });

  it('교배 이력이 없으면 이력 제목을 숨긴다', () => {
    const state = fixture();
    addMare(state, 'mare-none');
    const html = renderBreeding(state, 'mare-none');
    expect(html).not.toContain('교배 이력');
    expect(html).toContain('이번 시즌 교배 없음');
    expect(html).toContain('다음 시즌 예약 없음');
  });

  it('예약과 교배 배정 문구는 종마 이름과 시즌을 함께 보인다', () => {
    const state = fixture();
    const year = state.date.year;
    const sire = addHorse(state, 'stud', 'sire-book');
    const booked = addMare(state, 'mare-book', { bookedFor: { stallionId: sire.id, season: year + 1, feePaid: 0 } });
    const view = mareBreedingView(booked, (id) => id);
    expect(view.bookedKo).toBe(`${year + 1} 시즌 예약: ${sire.id}`);
    expect(view.dueKo).toBeNull();
    const html = renderBreeding(state, 'mare-book');
    expect(html).toContain(`${year + 1} 시즌 예약: ${displayName(state, sire)}`);
  });
});

describe('교배 계획 칸의 검토 대기 제안 (M7-D Opus 보완)', () => {
  it('예약 전 교배 제안은 계획에 종마 이름과 상태로 보이고, 교배가 끝나면 빠진다', async () => {
    const { mareBreedingView, pendingMatingProposal } = await import('../../src/ui/horse/horseDetailView');
    const mare: Mare = { horseId: 'm1', coveredBy: null, coveredWeek: null, pregnant: false, dueWeek: null, foals: [], blackTypeProduce: 0 };
    const proposals = [{ mareId: 'm1', season: 2026, stallionId: 's1', alternatives: [], expectedFee: 6000, note: '', status: 'proposed' as const }];
    const nameOf = (id: string) => (id === 's1' ? 'Erevann' : id);
    expect(mareBreedingView(mare, nameOf, pendingMatingProposal(proposals, 'm1')).planKo).toBe('교배 제안: Erevann (검토 대기)');
    expect(pendingMatingProposal([{ ...proposals[0]!, status: 'booked' as const }], 'm1')).toBeUndefined();
    expect(mareBreedingView({ ...mare, coveredBy: 's1' }, nameOf, proposals[0]).planKo).toBe('이번 시즌 교배: Erevann');
  });
});
