import { SPONSOR_PRIZE_ROUNDING } from '../config/betting';
import type { BookmakerDef, RaceTemplate, SaleCompanyDef, SponsorshipDef } from '../types';

/** 원본 템플릿을 보존하면서 이름·상금에만 후원을 적용한다. */
export function applySponsorships(
  templates: readonly RaceTemplate[], sponsorships: readonly SponsorshipDef[],
  bookmakers: readonly BookmakerDef[], saleCompanies: readonly SaleCompanyDef[],
): RaceTemplate[] {
  return templates.map((template) => {
    const def = sponsorships.find((s) => s.templateId === template.id);
    if (def === undefined) return template;
    const sponsor = def.sponsor.kind === 'bookmaker'
      ? bookmakers.find((b) => b.id === def.sponsor.id)
      : saleCompanies.find((c) => c.id === def.sponsor.id);
    if (sponsor === undefined) throw new Error(`스폰서를 찾을 수 없음: ${def.sponsor.id}`);
    const name = 'shortName' in sponsor ? sponsor.shortName ?? sponsor.name : sponsor.name;
    return {
      ...template,
      name: def.nameFormat.replaceAll('{sponsor}', name).replaceAll('{race}', template.name),
      prizeMoney: template.prizeMoney.map((p) =>
        Math.round(p * def.prizeMultiplier / SPONSOR_PRIZE_ROUNDING) * SPONSOR_PRIZE_ROUNDING),
    };
  });
}
