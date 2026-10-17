import {
  gradeBadgeClass,
  positionBadgeClass,
  positionLabel,
  statusBadgeClass,
  type StatusTone,
} from './badges';

/** 등급 배지. 글자(G1 등)가 곧 의미이고 색은 덧붙임이다. */
export function GradeBadge({ grade }: { grade: string }) {
  return <span className={gradeBadgeClass(grade)}>{grade}</span>;
}

/** 착순 배지. 예: '1착', '5착/11'. */
export function PositionBadge({
  position,
  fieldSize,
}: {
  position: number | null;
  fieldSize?: number;
}) {
  return (
    <span className={positionBadgeClass(position)}>{positionLabel(position, fieldSize)}</span>
  );
}

/** 상태 배지. 문구(label)는 필수다. 색만으로 상태를 전달하지 않는다. */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return <span className={statusBadgeClass(tone)}>{label}</span>;
}
