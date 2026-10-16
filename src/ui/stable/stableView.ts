import type { GameState, Horse } from '../../engine/types';
import { displayName } from '../../engine/naming/register';
import { ageInYear } from '../../engine/time/calendar';
import { sexKo, statusKo } from '../game/text';
import { mareBookingKo } from '../breeding/bookView';
import { emptyRacePlanHint, racePlanRows } from '../season/racePlanView';

export const STABLE_TABS = [
  { id: 'active', label: '현역마' },
  { id: 'young', label: '육성마' },
  { id: 'mares', label: '번식 암말' },
  { id: 'studs', label: '종마' },
] as const;
export type StableTab = (typeof STABLE_TABS)[number]['id'];
export function stableGroup(status: Horse['status']): StableTab | null {
  switch (status) {
    case 'in_training':
    case 'resting':
      return 'active';
    case 'foal':
    case 'weanling':
    case 'yearling':
      return 'young';
    case 'broodmare':
      return 'mares';
    case 'stud':
      return 'studs';
    default:
      return null;
  }
}
export function stableRows(state: GameState, tab: StableTab, query = '') {
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  return Object.values(state.horses)
    .filter(
      (h) =>
        h.ownerId === state.playerOwnerId &&
        stableGroup(h.status) === tab &&
        displayName(state, h).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((h) => {
      const plans = (state.seasonState.racePlans?.[h.id] ?? [])
        .filter((p) => ['proposed', 'approved', 'declared'].includes(p.status))
        .sort((a, b) => a.date.year - b.date.year || a.date.week - b.date.week);
      const next = racePlanRows(plans, { requireApproval: state.settings.autoApproveRacePlans === false,
        country: (h.trainerId === null ? undefined : state.trainers[h.trainerId]?.country) ?? h.countryOfBirth })[0];
      const mare = state.mares[h.id];
      const stud = state.stallions[h.id];
      const warnings = [
        h.condition.injury ? '부상 확인' : '',
        h.nameRegistered === false ? '이름 필요' : '',
        tab === 'active' && h.trainerId === null ? '조교사 미배정' : '',
        state.settings.autoApproveRacePlans === false && plans.some((p) => p.status === 'proposed') ? '제안 검토' : '',
      ].filter(Boolean);
      return {
        id: h.id,
        name: nameOf(h.id),
        ageSex: `${ageInYear(h.birthYear, state.date.year)}세 · ${sexKo(h.sex, h.gelded)}`,
        status: statusKo(h.status),
        tone: h.condition.injury ? 'danger' : h.status === 'resting' ? 'caution' : 'good',
        trainer: h.trainerId === null ? '미배정' : (state.trainers[h.trainerId]?.name ?? '—'),
        rating: h.officialRating ?? '미부여',
        next: mare
          ? mareBookingKo(mare, nameOf)
          : stud
            ? `북 ${stud.bookedThisSeason}/${stud.bookLimit}`
            : next
              ? `${next.dateLabel} · ${next.name}${next.away} · ${next.statusLabel}`
              : tab === 'active' ? emptyRacePlanHint(state, h) : '계획 없음',
        warnings,
      };
    });
}
