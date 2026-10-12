import { useState } from 'react';
import type { JSX } from 'react';
import { extractCommentaryEvents } from '../engine/commentary/events';
import { horseVerdicts, renderCommentary } from '../engine/commentary/render';
import type { CommentaryLine } from '../engine/commentary/render';
import { getCommentaryLines } from '../engine/data/commentaryData';
import { getNamePool, getRace, getRaces, getRacecourse } from '../engine/data/staticData';
import { goingLabel, isGoingValidForSurface, rollGoing } from '../engine/going/going';
import { runRace } from '../engine/race/runRace';
import type { RunRaceOutput } from '../engine/race/runRace';
import { formatOdds } from '../engine/race/odds';
import { formatMarginKo } from '../engine/race/results';
import { generateSampleField } from '../engine/race/sampleField';
import type { SampleField } from '../engine/race/sampleField';
import { createRng } from '../engine/rng';
import { monthOfWeek } from '../engine/time/calendar';
import { AW_GOING_ORDER, DIRT_GOING_ORDER, TURF_GOING_ORDER } from '../engine/types';
import type {
  GameDate,
  Going,
  Race,
  RaceGrade,
  RaceKind,
  Racecourse,
  RacePath,
  RaceReplay,
  RaceResult,
} from '../engine/types';
import RaceViewer from './race-viewer/RaceViewer';
import type { ViewerInfo } from './race-viewer/viewModel';

// ── 데모 상수 (표시·시연용. 밸런스 상수는 engine/config 에 둔다) ─────────
/** 데모 기준 날짜. 마장 추첨의 월(month)을 정한다. */
const DEMO_DATE: GameDate = { year: 2026, week: 24 };
const DEFAULT_SEED = 20261011;
const MAX_SAFE_SEED = Number.MAX_SAFE_INTEGER;
/** 출주 두수 선택 하한 */
const MIN_FIELD_SIZE = 4;
/** 출주 두수 기본값 상한 (실제 기본값 = min(이 값, maxRunners)) */
const DEFAULT_FIELD_CAP = 10;
/** 레이스 종류별 샘플 출주마 능력 기준치 */
const DEMO_LEVEL: Record<RaceKind, number> = {
  group: 72,
  listed: 64,
  conditions: 60,
  handicap: 56,
  novice: 50,
  maiden: 48,
};
/** G1 가산치 */
const G1_LEVEL_BONUS = 4;
/** 데모에서 플레이어 말의 게이트 인덱스 */
const PLAYER_INDEX = 0;

const AUTO = 'auto' as const;
type GoingChoice = Going | typeof AUTO;

const RACE_LIST: readonly Race[] = getRaces();
const GOING_CANDIDATES: readonly Going[] = [...TURF_GOING_ORDER, ...AW_GOING_ORDER, ...DIRT_GOING_ORDER];

const KIND_LABEL: Record<RaceKind, string> = {
  group: '그룹',
  listed: '리스티드',
  conditions: '조건전',
  handicap: '핸디캡',
  novice: '신마전',
  maiden: '미승리전',
};

const GRADE_LABEL: Record<RaceGrade, string> = {
  G1: 'G1',
  G2: 'G2',
  G3: 'G3',
  L: '리스티드',
};

/** 등급 또는 클래스 표기 */
function gradeOrClass(race: Race): string {
  if (race.grade !== null) return GRADE_LABEL[race.grade];
  return `${KIND_LABEL[race.kind]} · 클래스 ${race.raceClass}`;
}

function raceOptionLabel(race: Race): string {
  const course = getRacecourse(race.racecourseId);
  return `${race.name} · ${course.name} · ${gradeOrClass(race)} · ${race.distance}m`;
}

/** 초 → mm:ss.ss */
function formatFinishTime(seconds: number): string {
  const totalCs = Math.round(seconds * 100);
  const minutes = Math.floor(totalCs / 6000);
  const secs = (totalCs - minutes * 6000) / 100;
  return `${String(minutes).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 시드 입력 문자열 → 유효한 정수 시드 또는 null */
function parseSeed(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_SAFE_SEED) return null;
  return n;
}

interface RunSnapshot {
  id: number;
  output: RunRaceOutput;
  field: SampleField;
  path: RacePath;
  info: ViewerInfo;
  going: Going;
  elapsedMs: number;
  /** 실황 자막(t 오름차순) */
  commentary: CommentaryLine[];
  /** 한 줄 평(착순대로) */
  verdicts: { name: string; text: string }[];
}

interface RunView {
  result: RaceResult;
  replay: RaceReplay | null;
}

export default function RaceDemo(): JSX.Element {
  const [raceId, setRaceId] = useState<string>(RACE_LIST[0]?.id ?? '');
  const [goingChoice, setGoingChoice] = useState<GoingChoice>(AUTO);
  const [seedText, setSeedText] = useState<string>(String(DEFAULT_SEED));
  /** null = 기본값(min(10, maxRunners)) */
  const [sizeChoice, setSizeChoice] = useState<number | null>(null);
  const [run, setRun] = useState<RunSnapshot | null>(null);

  const race = getRace(raceId);
  const course: Racecourse = getRacecourse(race.racecourseId);
  const maxSize = race.maxRunners;
  const defaultSize = Math.min(DEFAULT_FIELD_CAP, maxSize);
  const size = clamp(sizeChoice ?? defaultSize, Math.min(MIN_FIELD_SIZE, maxSize), maxSize);
  const goingOptions = GOING_CANDIDATES.filter((g) => isGoingValidForSurface(g, course.surface));
  const effectiveGoing: GoingChoice =
    goingChoice !== AUTO && isGoingValidForSurface(goingChoice, course.surface) ? goingChoice : AUTO;
  const seed = parseSeed(seedText);

  const sizeOptions: number[] = [];
  for (let n = Math.min(MIN_FIELD_SIZE, maxSize); n <= maxSize; n++) sizeOptions.push(n);

  const startRace = (): void => {
    if (seed === null) return;

    const going: Going =
      effectiveGoing === AUTO
        ? rollGoing(createRng(seed).fork('going'), course, monthOfWeek(DEMO_DATE.week))
        : effectiveGoing;

    const field = generateSampleField(createRng(seed).fork('field'), {
      size,
      distance: race.distance,
      surface: course.surface,
      year: DEMO_DATE.year,
      namePool: getNamePool(),
      level: DEMO_LEVEL[race.kind] + (race.grade === 'G1' ? G1_LEVEL_BONUS : 0),
      playerIndex: PLAYER_INDEX,
    });

    const t0 = performance.now();
    const output = runRace({ race, course, going, date: DEMO_DATE, seed, field });
    const elapsedMs = performance.now() - t0;

    const info: ViewerInfo = {
      raceName: race.name,
      grade: race.grade,
      courseName: course.name,
      surface: course.surface,
      distance: race.distance,
      going,
      entries: output.entries,
      horseNames: field.runners.map((r) => r.horse.name),
    };

    // 실황 자막과 한 줄 평은 레이스 시드로 만든다(같은 시드 = 같은 문장)
    const { replay, result } = output.sim;
    let commentary: CommentaryLine[] = [];
    let verdicts: { name: string; text: string }[] = [];
    if (replay !== null) {
      const lines = getCommentaryLines();
      const events = extractCommentaryEvents({
        replay,
        result,
        path: output.path,
        distance: race.distance,
      });
      commentary = renderCommentary(events, info.horseNames, seed, lines, result);
      const texts = horseVerdicts({
        replay,
        result,
        names: info.horseNames,
        seed,
        lines,
        path: output.path,
      });
      verdicts = result.runners.map((r) => ({
        name: info.horseNames[r.runnerIndex] ?? '',
        text: texts[r.runnerIndex] ?? '',
      }));
    }

    setRun({
      id: (run?.id ?? 0) + 1,
      output,
      field,
      path: output.path,
      info,
      going,
      elapsedMs,
      commentary,
      verdicts,
    });
  };

  const view: RunView | null =
    run === null ? null : { result: run.output.sim.result, replay: run.output.sim.replay };

  return (
    <section>
      <h2>레이스 데모</h2>

      <div>
        <label>
          레이스{' '}
          <select
            value={raceId}
            onChange={(e) => {
              setRaceId(e.target.value);
              setSizeChoice(null);
            }}
          >
            {RACE_LIST.map((r) => (
              <option key={r.id} value={r.id}>
                {raceOptionLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label>
          마장{' '}
          <select value={effectiveGoing} onChange={(e) => setGoingChoice(e.target.value as GoingChoice)}>
            <option value={AUTO}>자동</option>
            {goingOptions.map((g) => (
              <option key={g} value={g}>
                {goingLabel(g)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label>
          출주 두수{' '}
          <select
            value={size}
            onChange={(e) => setSizeChoice(Number(e.target.value))}
          >
            {sizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}두
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <label>
          시드{' '}
          <input
            type="number"
            inputMode="numeric"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
          />
        </label>
        {seed === null && <span role="alert"> 시드는 0 이상의 정수여야 합니다.</span>}
      </div>

      <div>
        <button type="button" onClick={startRace} disabled={seed === null}>
          레이스 시작
        </button>
      </div>

      {run !== null && view !== null && (
        <div>
          <p>
            {run.info.raceName} · 마장 {goingLabel(run.going)} · 출주 {run.field.runners.length}두 · 레이스 계산{' '}
            {Math.round(run.elapsedMs)} ms
          </p>

          {view.replay !== null ? (
            <div style={{ overflowX: 'auto' }}>
              <RaceViewer
                key={run.id}
                replay={view.replay}
                result={view.result}
                path={run.path}
                info={run.info}
                commentary={run.commentary}
                verdicts={run.verdicts}
              />
            </div>
          ) : (
            <p>재생 기록이 없습니다.</p>
          )}

          <table>
            <thead>
              <tr>
                <th>착순</th>
                <th>마번</th>
                <th>게이트</th>
                <th>마명</th>
                <th>기수</th>
                <th>부담중량(lb)</th>
                <th>착차</th>
                <th>타임</th>
                <th>오즈</th>
              </tr>
            </thead>
            <tbody>
              {view.result.runners.map((r) => {
                const isPlayer = run.output.entries[r.runnerIndex]?.isPlayer ?? false;
                const horseName = run.info.horseNames[r.runnerIndex] ?? '';
                const jockeyName = run.field.runners[r.runnerIndex]?.jockey.name ?? '';
                const name = isPlayer ? <strong>{horseName}</strong> : horseName;
                return (
                  <tr key={r.runnerIndex}>
                    <td>{r.position}</td>
                    <td>{r.saddleCloth}</td>
                    <td>{r.draw}</td>
                    <td>{name}</td>
                    <td>{jockeyName}</td>
                    <td>{r.weightLb}</td>
                    <td>{r.margin === null ? '-' : formatMarginKo(r.margin)}</td>
                    <td>{formatFinishTime(r.finishTime)}</td>
                    <td>{r.odds === null ? '-' : formatOdds(r.odds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
