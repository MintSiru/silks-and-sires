import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { ANON_DAM_PREFIX } from '../../src/engine/breeding/realPedigree';
import type { PedigreeNode, PlannedRace, RacePlanTarget } from '../../src/engine/types';
import PedigreeView, { PedigreeTable } from '../../src/ui/breeding/PedigreeView';
import {
  PEDIGREE_BASE_DEPTH,
  isBlankPedigreeNode,
  layoutPedigree,
  inbreedFact,
  pedigreeCommentary,
} from '../../src/ui/breeding/pedigreeLayout';
import {
  distanceNoteKo,
  planStatusView,
  racePlanRows,
  targetLabel,
} from '../../src/ui/season/racePlanView';

function node(
  horseId: string | null,
  generation: number,
  sire: PedigreeNode | null = null,
  dam: PedigreeNode | null = null,
): PedigreeNode {
  return { horseId, generation, sire, dam };
}

/** 5대 전부 채운 가상 트리: 각 칸 id 는 경로(s/d)로 만든다 */
function fullTree(depth: number, path = '', generation = 0): PedigreeNode {
  if (generation >= depth) return node(`h${path || 'root'}`, generation);
  return node(
    `h${path || 'root'}`,
    generation,
    fullTree(depth, `${path}s`, generation + 1),
    fullTree(depth, `${path}d`, generation + 1),
  );
}

const rootWithDamsire = (damsireId: string | null): PedigreeNode =>
  node('root', 0, node('sireA', 1, node('sireAs', 2)), node('damB', 1, node(damsireId, 2), node('damBd', 2)));

describe('출주 계획 상태 문구는 모드를 따른다', () => {
  it('자동 모드: 제안은 자동 출주 예정, 확정은 확정', () => {
    expect(planStatusView('proposed', false)).toEqual({ label: '자동 출주 예정', tone: 'good' });
    expect(planStatusView('approved', false)).toEqual({ label: '확정', tone: 'good' });
  });
  it('승인제: 제안은 승인 대기(주의), 확정은 확정', () => {
    expect(planStatusView('proposed', true)).toEqual({ label: '승인 대기', tone: 'warn' });
    expect(planStatusView('approved', true)).toEqual({ label: '확정', tone: 'good' });
  });
  it('지난 계획은 muted 톤', () => {
    expect(planStatusView('run', false).tone).toBe('muted');
    expect(planStatusView('skipped', true).label).toBe('건너뜀');
  });
});

describe('거리 힌트 메모', () => {
  const hint = { min: 1400, max: 2000 };
  it('힌트 안이면 덧붙이지 않고, 밖이면 연장 도전 또는 단축', () => {
    expect(distanceNoteKo(1600, hint)).toBeNull();
    expect(distanceNoteKo(1400, hint)).toBeNull();
    expect(distanceNoteKo(2000, hint)).toBeNull();
    expect(distanceNoteKo(2400, hint)).toBe('거리 연장 도전 — 적성 상한보다 400m 김');
    expect(distanceNoteKo(1000, hint)).toBe('거리 단축 — 적성 하한보다 400m 짧음');
  });
  it('힌트 밖이면 주 문구는 거리 판단 하나이고 엔진 메모 원문은 펼침(engineNote)으로 뺀다', () => {
    const race = getRaceTemplates().find((t) => t.distance > 0)!;
    const plan: PlannedRace = {
      id: 'p1',
      date: { year: 2026, week: 1 },
      templateId: race.id,
      target: null,
      status: 'proposed',
      note: '거리 적성과 출주 조건에 맞춤',
    };
    const long = racePlanRows([plan], { distanceHint: { min: 800, max: race.distance - 100 } })[0]!;
    expect(long.note).toBe('거리 연장 도전 — 적성 상한보다 100m 김');
    expect(long.noteFolded).toBe(true);
    expect(long.engineNote).toBe('거리 적성과 출주 조건에 맞춤');
    expect(plan.note).toBe('거리 적성과 출주 조건에 맞춤');
    const short = racePlanRows([plan], { distanceHint: { min: race.distance + 100, max: race.distance + 400 } })[0]!;
    expect(short.note).toBe('거리 단축 — 적성 하한보다 100m 짧음');
    expect(short.noteFolded).toBe(true);
    expect(short.note).not.toContain('거리 적성');
  });
  it('힌트 안이거나 힌트가 없으면 엔진 메모 원문을 그대로 주 문구로 쓴다', () => {
    const race = getRaceTemplates().find((t) => t.distance > 0)!;
    const plan: PlannedRace = {
      id: 'p1',
      date: { year: 2026, week: 1 },
      templateId: race.id,
      target: null,
      status: 'proposed',
      note: '거리 적성과 출주 조건에 맞춤',
    };
    const inside = racePlanRows([plan], { distanceHint: { min: race.distance - 100, max: race.distance + 100 } })[0]!;
    expect(inside.note).toBe(plan.note);
    expect(inside.noteFolded).toBe(false);
    const none = racePlanRows([plan])[0]!;
    expect(none.note).toBe(plan.note);
    expect(none.noteFolded).toBe(false);
    expect(none.engineNote).toBe(plan.note);
  });
  it('레이스 행은 등급 배지 글자·첫 줄 이름·둘째 줄 경마장·거리를 나눠 준다', () => {
    const race = getRaceTemplates()[0]!;
    const plan: PlannedRace = {
      id: 'p2',
      date: { year: 2026, week: 3 },
      templateId: race.id,
      target: null,
      status: 'approved',
      note: 'n',
    };
    const row = racePlanRows([plan])[0]!;
    expect(row.gradeLabel).toBe(race.grade ?? `클래스 ${race.raceClass}`);
    expect(row.titleLine).toBe(race.name);
    expect(row.conditionLine).toContain(`${race.distance.toLocaleString('ko-KR')}m`);
    expect(row.dateLabel).toBe('2026년 1월 3주');
  });
});

describe('조건 목표 표시', () => {
  it('핸디캡·조건 목표는 클래스 배지(회색)와 거리 둘째 줄을 준다', () => {
    const target: RacePlanTarget = {
      kinds: ['handicap'],
      minDistance: 1600,
      maxDistance: 1800,
      minClass: 5,
      maxClass: 5,
      country: 'GB' as const,
    };
    const plan: PlannedRace = {
      id: 't1',
      date: { year: 2026, week: 5 },
      templateId: null,
      target,
      status: 'proposed',
      note: 'n',
    };
    const row = racePlanRows([plan])[0]!;
    expect(row.gradeLabel).toBe('클래스 5');
    expect(row.titleLine).toBe('핸디캡');
    expect(row.conditionLine).toBe('약 1,700m 전후');
    expect(targetLabel(target)).toBe('핸디캡 · 약 1,700m 전후 · 클래스 5');
    expect(racePlanRows([{ ...plan, target: { ...target, kinds: ['listed'], minClass: undefined, maxClass: undefined } }])[0]!.gradeLabel).toBe('L');
  });
});

describe('혈통표 배치', () => {
  it('3대는 8행·칸 14개, 5대는 32행·칸 62개(미상 칸 포함)', () => {
    const root = fullTree(5);
    const three = layoutPedigree(root, PEDIGREE_BASE_DEPTH);
    expect(three.rows).toBe(8);
    expect(three.slots).toHaveLength(2 + 4 + 8);
    expect(three.slots.every((s) => s.generation <= 3)).toBe(true);
    const five = layoutPedigree(root, 5);
    expect(five.rows).toBe(32);
    expect(five.slots).toHaveLength(62);
    expect(five.slots.filter((s) => s.generation === 5).every((s) => s.span === 1)).toBe(true);
  });
  it('부측은 위 절반, 모측은 아래 절반이다', () => {
    const grid = layoutPedigree(fullTree(3), 3);
    expect(grid.slots.filter((s) => s.side === 'sire').every((s) => s.start < 4)).toBe(true);
    expect(grid.slots.filter((s) => s.side === 'dam').every((s) => s.start >= 4)).toBe(true);
  });
  it('잘못된 대수는 거절한다', () => {
    expect(() => layoutPedigree(fullTree(2), 0)).toThrow(RangeError);
  });
  it('빈 칸 판정: null 과 이름 미기록 암말 칸은 빈 칸', () => {
    expect(isBlankPedigreeNode(null)).toBe(true);
    expect(isBlankPedigreeNode(node(null, 1))).toBe(true);
    expect(isBlankPedigreeNode(node(`${ANON_DAM_PREFIX}1`, 1))).toBe(true);
    expect(isBlankPedigreeNode(node('real-horse', 1))).toBe(false);
  });
});

describe('혈통표 상단 해설', () => {
  const nameOf = (id: string) => `이름-${id}`;
  it('외조부 미상이면 중립 문구 정보 없음, 니크를 넘기지 않으면 항목을 뺀다', () => {
    const facts = pedigreeCommentary(rootWithDamsire(null), nameOf);
    expect(facts.map((f) => f.key)).toEqual(['damsire', 'inbreed']);
    expect(facts[0]).toMatchObject({ label: '외조부', value: '정보 없음', empty: true });
    expect(facts[1]).toMatchObject({ value: '없음', empty: false });
  });
  it('외조부가 있으면 이름을, 니크 미확인(null)이면 정보 없음을 보인다', () => {
    const facts = pedigreeCommentary(rootWithDamsire('damsire-1'), nameOf, null);
    expect(facts[0]).toMatchObject({ value: '이름-damsire-1', empty: false });
    expect(facts[1]).toMatchObject({ key: 'nick', value: '정보 없음', empty: true });
    expect(pedigreeCommentary(rootWithDamsire('x'), nameOf, '양호').find((f) => f.key === 'nick')).toMatchObject({
      value: '양호',
      empty: false,
    });
  });
  it('같은 조상이 양쪽에 있으면 근친 혈량을 보인다', () => {
    const shared = 'shared-ancestor';
    const root = node('root', 0, node('sireA', 1, node(shared, 2)), node('damB', 1, node(shared, 2)));
    const inbreed = pedigreeCommentary(root, nameOf).find((f) => f.key === 'inbreed')!;
    expect(inbreed.value).toContain('근친 혈량');
    expect(inbreed.value).toContain('(반복 조상 강조 표시)');
    expect(inbreed.tone).toBeDefined();
  });
  it('근친 판정은 교배 화면 기준(12.5 주의, 18.75 위험, 초과일 때)을 쓴다', () => {
    expect(inbreedFact(0)).toMatchObject({ value: '없음', empty: false });
    expect(inbreedFact(0)).not.toHaveProperty('tone');
    expect(inbreedFact(12.5)).toMatchObject({ tone: 'good', value: '양호 — 근친 혈량 12.5% (반복 조상 강조 표시)' });
    expect(inbreedFact(12.6)).toMatchObject({ tone: 'warn', value: '주의 — 근친 혈량 12.6% (반복 조상 강조 표시)' });
    expect(inbreedFact(18.75)).toMatchObject({ tone: 'warn' });
    expect(inbreedFact(18.76)).toMatchObject({ tone: 'danger', value: '위험 — 근친 혈량 18.8% (반복 조상 강조 표시)' });
  });
  it('근친 판정 배지는 상태 톤 클래스로 그린다', () => {
    const root = node('root', 0, node('sireA', 1, node('shared-x', 2)), node('damB', 1, node('shared-x', 2)));
    const html = renderToStaticMarkup(createElement(PedigreeView, { root, nameOf }));
    expect(html).toMatch(/badge badge--(warn|danger)/);
  });
});

describe('혈통표 렌더링', () => {
  const nameOf = (id: string) => `이름-${id}`;
  it('기본은 3대만 그리고 펼치기 버튼은 5대 보기다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeView, { root: fullTree(5), nameOf }));
    expect(html).toContain('5대 보기');
    expect(html).toContain('>3대<');
    expect(html).not.toContain('>4대<');
    expect(html).toContain('pedigree__cell--sire');
    expect(html).toContain('pedigree__cell--dam');
    expect(html).toContain('외조부');
  });
  it('5대 격자는 5대 머리를 모두 그리고 빈 칸은 — 한 줄만 둔다', () => {
    const root = node('root', 0, node('sireA', 1), node(null, 1));
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root, nameOf, depth: 5 }));
    for (const g of [1, 2, 3, 4, 5]) expect(html).toContain(`>${g}대<`);
    expect(html).toContain('pedigree__cell--unknown');
    expect(html).toContain('>—</div>');
  });
  it('말단 칸 높이는 3대에서 32px 행이고 3대는 8행 격자다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root: fullTree(3), nameOf, depth: 3 }));
    expect(html).toContain('repeat(8, 32px)');
    expect(html).toContain('--leaf-row:32px');
    expect(html).not.toContain('pedigree--deep');
  });
  it('5대 보기는 말단 칸 16px 행의 32행 격자이고 압축 클래스를 단다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root: fullTree(5), nameOf, depth: 5 }));
    expect(html).toContain('grid-template-rows:repeat(32, 16px)');
    expect(html).toContain('--leaf-row:16px');
    expect(html).toContain('pedigree--deep');
    expect(html).toContain('pedigree-wrap--deep');
  });
  it('대 머리는 본체 격자 밖 별도 줄에 있고 본체와 같은 열 구성을 쓴다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root: fullTree(5), nameOf, depth: 5 }));
    expect(html.indexOf('pedigree__heads')).toBeLessThan(html.indexOf('class="pedigree pedigree--deep"'));
    const columns = 'grid-template-columns:repeat(5, minmax(120px, 1fr))';
    expect(html.split(columns).length - 1).toBe(2);
    expect(html).not.toContain('auto repeat(');
  });
  it('3대 보기도 행 32px 격자(8행)이다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root: fullTree(3), nameOf, depth: 3 }));
    expect(html).toContain('grid-template-rows:repeat(8, 32px)');
    expect(html).not.toContain('auto repeat(');
  });
  it('말단 칸 높이는 이름 칸과 빈 칸이 같은 행 트랙을 쓴다', () => {
    const root = node('root', 0, node('sireA', 1), node(null, 1));
    const html = renderToStaticMarkup(createElement(PedigreeTable, { root, nameOf, depth: 3 }));
    const cells = html.match(/class="pedigree__cell[^"]*"/g) ?? [];
    // 1대 2칸 + 2대 4칸 + 3대 8칸
    expect(cells.length).toBe(14);
    expect(html).toContain('repeat(8, 32px)');
  });
  it('니크를 넘기면 상단 해설에 니크가 나온다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeView, { root: fullTree(3), nameOf, nick: '양호' }));
    expect(html).toContain('니크');
    expect(html).toContain('양호');
  });
  it('상단 해설의 니크·근친 라벨은 용어 풀이(Term)로 감싼다', () => {
    const shared = node('root', 0, node('sireA', 1, node('shared-y', 2)), node('damB', 1, node('shared-y', 2)));
    const html = renderToStaticMarkup(createElement(PedigreeView, { root: shared, nameOf, nick: '양호' }));
    expect(html).toContain('data-term="nick"');
    expect(html).toContain('data-term="inbreeding"');
    expect(html).not.toContain('data-term="damsire"');
  });
  it('해설·범례·펼치기 버튼은 한 줄 막대에 함께 든다', () => {
    const html = renderToStaticMarkup(createElement(PedigreeView, { root: fullTree(3), nameOf, nick: '양호' }));
    const bar = html.match(/<div class="pedigree-view__bar">([\s\S]*?)<div class="pedigree-wrap/);
    expect(bar).not.toBeNull();
    expect(bar![1]).toContain('pedigree-view__commentary');
    expect(bar![1]).toContain('pedigree__legend');
    expect(bar![1]).toContain('pedigree-view__toggle');
  });
});

describe('번식 미리보기에서도 같은 기본 3대', () => {
  it('교배 혈통표 루트(horseId null)를 받아도 깨지지 않는다', () => {
    const root = node(null, 0, node('sire-x', 1), node('mare-y', 1));
    const html = renderToStaticMarkup(createElement(PedigreeView, { root, nameOf: (id) => id }));
    expect(html).toContain('5대 보기');
    expect(html).toContain('pedigree-wrap');
  });
});
