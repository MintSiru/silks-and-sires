/**
 * 종마 자마 성적 누적(M3-C4). 순수 함수만 둔다(난수·시각·DOM 없음).
 * 기록 단위는 자마 한 두의 출주 한 번이며, 아비(sireId) 한 줄(OffspringStats)에 더한다.
 */
import { PROFILE_BOUNDS } from '../config/horse';
import { OBSERVED_PROFILE_MIN_WINS } from '../config/offspring';
import type { DistanceProfile, OffspringStats } from '../types';

/** 자마 성적 누적 빈 표 */
export function emptyOffspringStats(): OffspringStats {
  return {
    starters: 0,
    winners: 0,
    runs: 0,
    wins: 0,
    groupWins: 0,
    groupWinners: 0,
    earnings: 0,
    winDistanceSum: 0,
  };
}

/**
 * 자마 한 두의 출주 한 번을 아비 성적 표에 더한다(state 를 직접 고친다).
 * - firstStart: 이번이 그 자마의 첫 출주(starters +1)
 * - becameWinner: 이번 우승으로 그 자마 우승이 처음 1승이 됨(winners +1)
 * - firstGroupWin: 이번 그룹 우승으로 그 자마 그룹 우승이 처음 1회가 됨(groupWinners +1)
 * - won 이면 우승 수와 우승 거리 합(distance)을 더한다.
 */
export function recordOffspringRun(
  stats: OffspringStats,
  args: {
    firstStart: boolean;
    becameWinner: boolean;
    won: boolean;
    groupWin: boolean;
    firstGroupWin: boolean;
    earnings: number;
    distance: number;
  },
): void {
  stats.runs += 1;
  if (args.firstStart) stats.starters += 1;
  if (args.becameWinner) stats.winners += 1;
  if (args.won) {
    stats.wins += 1;
    stats.winDistanceSum += args.distance;
  }
  if (args.groupWin) stats.groupWins += 1;
  if (args.firstGroupWin) stats.groupWinners += 1;
  stats.earnings += args.earnings;
}

/**
 * 실제 성적 기준 거리 적성. 우승 수가 OBSERVED_PROFILE_MIN_WINS 미만이면 null(미정).
 * 평균 우승 거리를 PROFILE_BOUNDS 로 분류한다(경계값 이하 포함: speed ≤ speedMax, classic ≤ classicMax, middle ≤ middleMax, 초과 cup).
 */
export function observedProfile(stats: OffspringStats): DistanceProfile | null {
  if (stats.wins <= 0 || stats.wins < OBSERVED_PROFILE_MIN_WINS) return null;
  const avg = stats.winDistanceSum / stats.wins;
  if (avg <= PROFILE_BOUNDS.speedMax) return 'speed';
  if (avg <= PROFILE_BOUNDS.classicMax) return 'classic';
  if (avg <= PROFILE_BOUNDS.middleMax) return 'middle';
  return 'cup';
}
