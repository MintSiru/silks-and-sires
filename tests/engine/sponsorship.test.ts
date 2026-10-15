import { describe, expect, it } from 'vitest';
import { applySponsorships } from '../../src/engine/betting/sponsorship';
import { getBookmakers, getRaceTemplates, getSalesData, getSponsorships } from '../../src/engine/data/staticData';
import type { RaceTemplate } from '../../src/engine/types';
import g1 from '../../data/calendar/g1.json';
import gb from '../../data/calendar/pattern_gb_ie.json';
import fr from '../../data/calendar/pattern_fr_de_it.json';
import extra from '../../data/calendar/g1_extra.json';

export const rawTemplates = [...g1, ...gb, ...fr, ...extra] as RaceTemplate[];
describe('스폰서 적용', () => {
  it('모든 이름·상금 치환과 다른 필드·순서·원본 보존 및 캐시', () => {
    const original = structuredClone(rawTemplates);
    const result = applySponsorships(rawTemplates, getSponsorships(), getBookmakers(), getSalesData().companies);
    expect(rawTemplates).toEqual(original);
    result.forEach((t, i) => {
      const before = rawTemplates[i]!;
      const def = getSponsorships().find((d) => d.templateId === t.id);
      if (!def) { expect(t).toEqual(before); return; }
      const sponsor = def.sponsor.kind === 'bookmaker'
        ? getBookmakers().find((b) => b.id === def.sponsor.id)!
        : getSalesData().companies.find((b) => b.id === def.sponsor.id)!;
      const name = 'shortName' in sponsor ? sponsor.shortName ?? sponsor.name : sponsor.name;
      expect(t.name).toBe(def.nameFormat.replaceAll('{sponsor}', name).replaceAll('{race}', before.name));
      expect(t.prizeMoney).toEqual(before.prizeMoney.map((p) => Math.round(p * def.prizeMultiplier / 50) * 50));
      expect({ ...t, name: before.name, prizeMoney: before.prizeMoney }).toEqual(before);
    });
    expect(getRaceTemplates()).toEqual(result);
    expect(getRaceTemplates()).toBe(getRaceTemplates());
  });
  it('짧은 이름이 없으면 회사 전체 이름을 쓴다', () => {
    const t = rawTemplates[0]!;
    expect(applySponsorships([t], [{ templateId: t.id, sponsor: { kind: 'bookmaker', id: 'b' },
      nameFormat: '{sponsor} {race}', prizeMultiplier: 1 }], [{ id: 'b', name: 'Fictional Turf', shortName: null }], [])[0]!.name)
      .toBe(`Fictional Turf ${t.name}`);
  });
});
