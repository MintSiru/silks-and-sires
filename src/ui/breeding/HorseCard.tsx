import type { JSX } from 'react';
import type { Assessment, Grade, Horse } from '../../engine/types';
import {
  commentText,
  conformationLabelKo,
  distanceHintKo,
  gradeColor,
  growthKo,
  sexKo,
  stageKo,
  statusKo,
  type ConformationKey,
} from '../game/text';

/** 마체 평가 6항목 표시 순서. 숫자 능력치는 쓰지 않는다. */
const CONFORMATION_ITEMS: readonly ConformationKey[] = [
  'overall',
  'frame',
  'hindquarters',
  'legs',
  'action',
  'temperament',
];

/** 평가 시점 줄은 성장 단계(번식 전)에서만 보인다. 성마·번식 암말·종마에는 숨긴다. */
const STAGE_VISIBLE_STATUSES: ReadonlySet<Horse['status']> = new Set([
  'foal',
  'weanling',
  'yearling',
  'in_training',
]);

export interface HorseCardParentage {
  sire: string;
  dam: string;
  damsire: string;
}

export interface HorseCardProps {
  horse: Horse;
  assessment: Assessment;
  /** 현재 나이(세). 호출자가 계산해 넘긴다 */
  ageYears: number;
  parentage: HorseCardParentage;
  /** 부계 계통 표시명. 없으면 '—' */
  lineLabel: string;
  /** 교배 대상으로 고를 수 있을 때만 넘긴다. 없으면 선택 버튼을 그리지 않는다 */
  onSelect?: () => void;
  selected?: boolean;
}

function gradeBadge(grade: Grade): JSX.Element {
  return (
    <span className="grade-badge" style={{ backgroundColor: gradeColor(grade) }}>
      {grade}
    </span>
  );
}

export default function HorseCard({
  horse,
  assessment,
  ageYears,
  parentage,
  lineLabel,
  onSelect,
  selected = false,
}: HorseCardProps): JSX.Element {
  const report = assessment.conformation;
  const classes = ['horse-card', selected ? 'horse-card--selected' : ''].filter(Boolean).join(' ');

  return (
    <article className={classes}>
      <header className="horse-card__head">
        <h3 className="horse-card__name">{horse.name}</h3>
        {gradeBadge(report.overall)}
      </header>
      <p className="horse-card__meta">
        {sexKo(horse.sex, horse.gelded)} · {ageYears}세 · {statusKo(horse.status)}
      </p>
      <p className="horse-card__parents">
        {parentage.sire} × {parentage.dam} ({parentage.damsire})
      </p>
      <p className="horse-card__line">계통: {lineLabel}</p>

      <section className="conformation">
        {STAGE_VISIBLE_STATUSES.has(horse.status) && (
          <p className="conformation__stage">평가 시점: {stageKo(report.stage)}</p>
        )}
        <ul className="conformation__grades">
          {CONFORMATION_ITEMS.map((key) => (
            <li key={key} className="conformation__item">
              <span>{conformationLabelKo(key)}</span>
              {gradeBadge(report[key])}
            </li>
          ))}
        </ul>
      </section>

      <ul className="comments">
        {assessment.comments.map((c, index) => (
          <li key={`${c.key}-${index}`} className={`comment comment--${c.tone}`}>
            {commentText(c, `${assessment.horseId}|${assessment.year}|${assessment.week}|${c.key}`)}
          </li>
        ))}
      </ul>

      <p className="horse-card__hint">거리 힌트: {distanceHintKo(assessment.distanceHint)}</p>
      <p className="horse-card__hint">성장형 힌트: {growthKo(assessment.growthHint)}</p>

      {onSelect !== undefined && (
        <button
          type="button"
          className="btn horse-card__select"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? '선택됨' : '암말로 선택'}
        </button>
      )}
    </article>
  );
}
