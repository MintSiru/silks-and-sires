/**
 * 시즌 다시보기 뷰 모델 (M3-D3b). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 저장된 입력(ReplayableRace)으로 runRace 를 다시 돌려 레이스 띠·실황 자막·한 줄 평·결과판 입력을 만든다.
 * 같은 시드 = 같은 결과이므로 저장된 결과(raceResults)와 착순·finishTime 이 같아야 한다.
 */
import { extractCommentaryEvents } from '../../engine/commentary/events';
import { horseVerdicts, renderCommentary } from '../../engine/commentary/render';
import type { CommentaryLine } from '../../engine/commentary/render';
import { getCommentaryLines } from '../../engine/data/commentaryData';
import { getRacecourse } from '../../engine/data/staticData';
import { runRace } from '../../engine/race/runRace';
import type { RunRaceOutput } from '../../engine/race/runRace';
import { formatDateKo } from '../../engine/time/calendar';
import type {
  GameDate,
  GameState,
  HorseId,
  RaceGrade,
  RaceResult,
  ReplayableRace,
} from '../../engine/types';
import type { ViewerInfo } from '../race-viewer/viewModel';

/** 다시보기 항목을 가리는 키(같은 개최의 같은 레이스는 한 번만 저장된다) */
export function replayKey(entry: Pick<ReplayableRace, 'meetingId' | 'race'>): string {
  return `${entry.meetingId}|${entry.race.id}`;
}

/** 등급 표기. G1·G2·G3 는 그대로, 리스티드는 한국어, 그 밖(핸디캡·조건전 등)은 '일반 경주' */
function gradeLabelKo(grade: RaceGrade | null): string {
  if (grade === null) return '일반 경주';
  if (grade === 'L') return '리스티드';
  return grade;
}

function compareDateDesc(a: GameDate, b: GameDate): number {
  return b.year - a.year || b.week - a.week;
}

export interface ReplayListItem {
  key: string;
  title: string;
  dateLabel: string;
  /** 등급 표기(한국어). G1·G2·G3 · 리스티드 · 일반 경주 */
  gradeLabel: string;
  grade: RaceGrade | null;
  /** 플레이어 말이 출주한 레이스인가 */
  hasPlayer: boolean;
}

/** 다시보기 목록(최신순). 날짜가 같으면 저장 순서(최근 저장이 앞)를 따른다. */
export function replayList(state: GameState): ReplayListItem[] {
  return state.seasonState.replayable
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => compareDateDesc(a.entry.date, b.entry.date) || a.index - b.index)
    .map(({ entry }) => ({
      key: replayKey(entry),
      title: entry.race.name,
      dateLabel: formatDateKo(entry.date),
      gradeLabel: gradeLabelKo(entry.race.grade),
      grade: entry.race.grade,
      hasPlayer: entry.field.requests.some((r) => r.isPlayer),
    }));
}

export interface ReplayBundle {
  /** runRace 재실행 결과(sim.replay · sim.result · path · entries 포함) */
  output: RunRaceOutput;
  info: ViewerInfo;
  /** 실황 자막(t 오름차순) */
  commentary: CommentaryLine[];
  /** 한 줄 평(착순대로) */
  verdicts: { name: string; text: string }[];
}

/** 저장된 결과 중 이 레이스(같은 레이스 id·같은 날짜)의 것 */
function storedResultOf(state: GameState, entry: ReplayableRace): RaceResult | undefined {
  return state.raceResults.find(
    (r) => r.raceId === entry.race.id && r.date.year === entry.date.year && r.date.week === entry.date.week,
  );
}

/** 다시 돌린 결과가 저장 결과와 착순·마번(horseId)·finishTime 이 모두 같은지 확인한다. 다르면 Error */
function assertSameResult(stored: RaceResult, replayed: RaceResult, key: string): void {
  const same =
    stored.runners.length === replayed.runners.length &&
    stored.runners.every((s, i) => {
      const r = replayed.runners[i];
      return r !== undefined && s.horseId === r.horseId && s.position === r.position && s.finishTime === r.finishTime;
    });
  if (!same) {
    throw new Error(`다시보기 재현성 깨짐: ${key} 의 다시 돌린 결과가 저장 결과와 다르다`);
  }
}

/** 말별 OR 변동 중 이 레이스(같은 레이스 id·같은 날짜)의 것. runner index 기준 */
function ratingChangesOf(
  state: GameState,
  entry: ReplayableRace,
  horseIds: readonly HorseId[],
): ViewerInfo['ratingChanges'] {
  const out: Record<number, { from: number | null; to: number }> = {};
  let any = false;
  horseIds.forEach((horseId, runnerIndex) => {
    const list = state.seasonState.ratingHistory[horseId] ?? [];
    const change = [...list]
      .reverse()
      .find(
        (c) => c.raceId === entry.race.id && c.date.year === entry.date.year && c.date.week === entry.date.week,
      );
    if (change !== undefined) {
      out[runnerIndex] = { from: change.from, to: change.to };
      any = true;
    }
  });
  return any ? out : undefined;
}

/**
 * 저장된 입력으로 레이스를 다시 돌려 뷰 입력을 만든다.
 * 저장 결과가 있으면 착순·마번·finishTime 을 대조하고 다르면 Error. 알 수 없는 key 면 RangeError.
 */
export function buildReplay(state: GameState, key: string): ReplayBundle {
  const entry = state.seasonState.replayable.find((r) => replayKey(r) === key);
  if (entry === undefined) {
    throw new RangeError(`다시보기 항목이 없다: ${key}`);
  }

  const course = getRacecourse(entry.race.racecourseId);
  const output = runRace({
    race: entry.race,
    course,
    going: entry.going,
    date: entry.date,
    seed: entry.seed,
    field: entry.field,
    recordReplay: true,
  });

  const stored = storedResultOf(state, entry);
  if (stored !== undefined) {
    assertSameResult(stored, output.sim.result, key);
  }

  const { replay, result } = output.sim;
  if (replay === null) {
    throw new Error(`다시보기 재생 기록이 없다: ${key}`);
  }

  const horseIds = entry.field.runners.map((r) => r.horse.id);
  const horseNames = entry.field.runners.map((r) => r.horse.name);
  const info: ViewerInfo = {
    raceName: entry.race.name,
    grade: entry.race.grade,
    courseName: course.name,
    surface: course.surface,
    distance: entry.race.distance,
    going: entry.going,
    entries: output.entries,
    horseNames,
    ratingChanges: ratingChangesOf(state, entry, horseIds),
  };

  // 실황 자막과 한 줄 평은 레이스 시드로 만든다(같은 시드 = 같은 문장)
  const lines = getCommentaryLines();
  const events = extractCommentaryEvents({
    replay,
    result,
    path: output.path,
    distance: entry.race.distance,
  });
  const commentary = renderCommentary(events, horseNames, entry.seed, lines, result);
  const texts = horseVerdicts({
    replay,
    result,
    names: horseNames,
    seed: entry.seed,
    lines,
    path: output.path,
  });
  const verdicts = result.runners.map((r) => ({
    name: horseNames[r.runnerIndex] ?? '',
    text: texts[r.runnerIndex] ?? '',
  }));

  return { output, info, commentary, verdicts };
}
