// 등급·착순·상태 배지의 톤 판정과 클래스 이름(순수 함수, DOM 없음).
// 색은 app.css 의 토큰(.badge--*)이 맡고, 의미는 화면 문구로 함께 전달한다.

export type GradeTone = 'top' | 'high' | 'mid' | 'low';
export type PositionTone = 'top' | 'high' | 'low';
/** 화면 상태 칩의 기존 톤(good·caution·danger·plain)을 배지 톤으로 옮긴 것. */
export type StatusTone = 'good' | 'warn' | 'danger' | 'muted';
/** 기존 status-chip 쓰임: 'caution' 은 주의, 'plain' 은 색 없는 칩(중립). */
export type LegacyStatusTone = 'good' | 'caution' | 'danger' | 'plain';

/** 등급 문자열 → 톤. G1·S 금, G2·A 청, G3·L·B 녹, 그 밖 회색. */
export function gradeTone(grade: string): GradeTone {
  switch (grade.trim().toUpperCase()) {
    case 'G1':
    case 'S':
      return 'top';
    case 'G2':
    case 'A':
      return 'high';
    case 'G3':
    case 'L':
    case 'B':
      return 'mid';
    default:
      return 'low';
  }
}

/** 착순 → 톤. 1착 금, 2~3착 청, 그 밖과 결과 없음(null) 회색. */
export function positionTone(position: number | null): PositionTone {
  if (position === 1) return 'top';
  if (position !== null && position >= 2 && position <= 3) return 'high';
  return 'low';
}

/** 기존 상태 칩 톤 → 배지 톤. */
export function statusTone(tone: LegacyStatusTone): StatusTone {
  switch (tone) {
    case 'good':
      return 'good';
    case 'caution':
      return 'warn';
    case 'danger':
      return 'danger';
    case 'plain':
      return 'muted';
  }
}

export function gradeBadgeClass(grade: string): string {
  return `badge badge--grade-${gradeTone(grade)}`;
}

export function positionBadgeClass(position: number | null): string {
  return `badge badge--grade-${positionTone(position)}`;
}

export function statusBadgeClass(tone: StatusTone): string {
  return `badge badge--${tone}`;
}

/** '1착', '5착/11' 형식. 결과가 없으면(null) '결과 없음'. */
export function positionLabel(position: number | null, fieldSize?: number): string {
  if (position === null) return '결과 없음';
  return fieldSize === undefined ? `${position}착` : `${position}착/${fieldSize}`;
}
