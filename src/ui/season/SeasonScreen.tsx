import { useContext, useMemo, useState, type JSX } from 'react';
import type { HorseId, RaceGrade } from '../../engine/types';
import { declareErrorKo, feeKo, withdrawErrorKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import BettingPanel from '../betting/BettingPanel';
import { GradeBadge } from '../common/Badge';
import { gradeBadgeClass, statusBadgeClass } from '../common/badges';
import ReplayPanel from './ReplayPanel';
import { calendarWeekRows, type CalendarWeekRow, type CalendarPlayerEntry, type CalendarFixedRaceView } from './calendarView';
import {
  eligiblePlayerHorses,
  meetingsView,
  recentResults,
  type MeetingRaceView,
  type PlayerHorseOption,
  type RaceStatusView,
} from './seasonView';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import { useNotify } from '../shell/notify';
import './calendar.css';

const RACE_STATUS_KO: Record<RaceStatusView, string> = {
  open: '출주 접수 중',
  closed: '출주 마감',
  run: '결과 확정',
};

function raceKey(meetingId: string, raceId: string) {
  return `${meetingId}|${raceId}`;
}

export default function SeasonScreen({
  game,
  locked = false,
  section = 'calendar',
}: {
  game: GameApi;
  locked?: boolean;
  section?: 'calendar' | 'results';
}): JSX.Element | null {
  const [betRace, setBetRace] = useState<{ meetingId: string; raceId: string } | null>(null);
  const notify = useNotify();
  const [racePicks, setRacePicks] = useState<Record<string, string>>({});
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});
  const calendar = useMemo(
    () =>
      game.state === null ? [] : calendarWeekRows(game.upcomingRaces(12), game.state),
    [game],
  );
  const state = game.state;
  if (state === null) return null;
  const meetings = meetingsView(state);
  const results = recentResults(state, 20);

  return (
    <>
      {section === 'calendar' ? (
        <>
          <section className="panel calendar-panel">
            <h2>앞으로 12주 레이스</h2>
            <p className="hint">
              고정 일정은 확정입니다. 일반 개최는 후보라 실제 개최와 예상 종류는 바뀔 수 있습니다.
              주를 누르면 자세히 볼 수 있습니다.
            </p>
            <ul className="cal-weeks" aria-label="앞으로 12주 주별 레이스">
              {calendar.map((row) => (
                <CalendarWeek
                  key={row.key}
                  row={row}
                  open={openWeeks[row.key] === true}
                  onToggle={() =>
                    setOpenWeeks((prev) => ({ ...prev, [row.key]: prev[row.key] !== true }))
                  }
                />
              ))}
            </ul>
            <details className="meeting-details">
              <summary>이번 주·다음 주 개최 ({meetings.length}곳)</summary>
              <p className="hint">
                출주 계획은 말 상세에서 계획 관리합니다. 말 이름을 누르면 출주 계획 탭이 열립니다.
              </p>
              {meetings.length === 0 && <p className="hint">예정된 개최가 없습니다.</p>}
              {meetings.map((m) => (
                <details key={m.meetingId}>
                  <summary>
                    {m.courseName} · {m.dateLabel} · 마장 {m.goingLabel}
                  </summary>
                  <ul className="season-race-list">
                    {m.races.map((race) => {
                      const key = raceKey(race.meetingId, race.raceId);
                      return (
                        <RaceRow
                          key={key}
                          race={race}
                          locked={locked}
                          eligible={eligiblePlayerHorses(state, race.meetingId, race.raceId)}
                          pick={racePicks[key]}
                          onPick={(id) => setRacePicks((prev) => ({ ...prev, [key]: id }))}
                          onBet={() =>
                            setBetRace({ meetingId: race.meetingId, raceId: race.raceId })
                          }
                          onDeclare={() => {
                            const id = racePicks[key];
                            if (!id) {
                              notify('출주시킬 말을 고르세요.', 'error');
                              return;
                            }
                            const result = game.declarePlayerHorse(race.meetingId, race.raceId, id);
                            if (result.ok) notify('출주를 접수했습니다.', 'ok');
                            else notify(declareErrorKo(result.error), 'error');
                          }}
                          onWithdraw={(id) => {
                            const result = game.withdrawPlayerHorse(
                              race.meetingId,
                              race.raceId,
                              id,
                            );
                            if (result.ok) notify('출주를 취소했습니다.', 'ok');
                            else notify(withdrawErrorKo(result.error), 'error');
                          }}
                        />
                      );
                    })}
                  </ul>
                </details>
              ))}
            </details>
          </section>
          {betRace !== null && (
            <BettingPanel
              key={raceKey(betRace.meetingId, betRace.raceId)}
              state={state}
              game={game}
              meetingId={betRace.meetingId}
              raceId={betRace.raceId}
              locked={locked}
            />
          )}
        </>
      ) : (
        <>
          <section className="panel">
            <h2>최근 결과</h2>
            {results.length === 0 ? (
              <p className="hint">아직 결과가 없습니다.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>레이스</th>
                      <th>우승마</th>
                      <th>내 말 착순</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.key}>
                        <td>{r.dateLabel}</td>
                        <td>{r.raceName}</td>
                        <td>
                          <HorseLink name={r.winnerName} />
                        </td>
                        <td>
                          {r.playerRuns.map((p) => (
                            <span key={p.horseId}>
                              <HorseLink horseId={p.horseId} name={p.name} /> {p.position}착{' '}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>다시보기</h2>
            <ReplayPanel state={state} />
          </section>
        </>
      )}
    </>
  );
}

/** 말 이름 링크. 누르면 말 상세의 출주 계획 탭을 연다(출주 조작은 계획 탭에서). */
function PlanLink({
  horseId,
  name,
  children,
}: {
  horseId: HorseId;
  name: string;
  children?: string;
}): JSX.Element {
  const { openHorse } = useContext(HorseNavigation);
  return (
    <button
      type="button"
      className="link-btn horse-link"
      onClick={(e) => {
        e.stopPropagation();
        openHorse(horseId, 'plan');
      }}
    >
      {children ?? name}
    </button>
  );
}

/** 등급 배지. G1·G2·G3 는 공통 등급 배지, 리스티드·조건·핸디캡은 같은 톤에 한글 문구를 쓴다. */
function GradeChip({ grade, label }: { grade: RaceGrade | null; label: string }): JSX.Element {
  if (grade === 'G1' || grade === 'G2' || grade === 'G3') return <GradeBadge grade={grade} />;
  return <span className={gradeBadgeClass(grade ?? '')}>{label}</span>;
}

function HorseChip({ entry }: { entry: CalendarPlayerEntry }): JSX.Element {
  return (
    <span className={statusBadgeClass(entry.kind === 'declared' ? 'good' : 'muted')}>
      {entry.label} · {entry.name}
    </span>
  );
}

/** 접힌 행의 대표 고정 레이스(한 줄). 가려진 개수('외 N')는 같은 줄 끝에 붙인다. */
function FixedRaceLine({ race, more = 0 }: { race: CalendarFixedRaceView; more?: number }): JSX.Element {
  return (
    <span className="cal-week__race">
      <GradeChip grade={race.grade} label={race.gradeLabel} />
      <span className="cal-week__name">{race.name}</span>
      {more > 0 && <span className="cal-week__more">외 {more}</span>}
    </span>
  );
}

/** 주별 한 행. 행 전체가 펼침 버튼이고, 펼치면 그 주의 고정 레이스·일반 개최·내 말 계획을 보인다. */
function CalendarWeek({
  row,
  open,
  onToggle,
}: {
  row: CalendarWeekRow;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  const detailId = `cal-week-${row.key}`;
  return (
    <li className="cal-week">
      <button
        type="button"
        className="cal-week__head"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className={open ? 'cal-week__chevron cal-week__chevron--open' : 'cal-week__chevron'} aria-hidden="true">
          <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
            <path d="M4 1.5 L10.5 7 L4 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="cal-week__date">{row.dateLabel}</span>
        <span className="cal-week__fixed">
          {row.fixedPreview.length === 0 ? (
            <span className="cal-week__none">고정 레이스 없음 · {row.generalSummary}</span>
          ) : (
            row.fixedPreview.map((race, i) => (
              <FixedRaceLine
                key={race.id}
                race={race}
                more={i === row.fixedPreview.length - 1 ? row.fixedMoreCount : 0}
              />
            ))
          )}
        </span>
        <span className="cal-week__horses">
          {row.horsePreview.map((entry) => (
            <HorseChip key={entry.horseId} entry={entry} />
          ))}
          {row.horseMoreCount > 0 && <span className="cal-week__more">외 {row.horseMoreCount}</span>}
        </span>
      </button>
      <div id={detailId} className="cal-week__detail" hidden={!open}>
        <p className="cal-week__label">고정 레이스</p>
        {row.fixed.length === 0 ? (
          <p className="hint">이 주에 고정 레이스가 없습니다.</p>
        ) : (
          <ul className="cal-fixed">
            {row.fixed.map((race) => (
              <li className="cal-fixed__row" key={race.id}>
                <span className="cal-fixed__grade">
                  <GradeChip grade={race.grade} label={race.gradeLabel} />
                </span>
                <span className="cal-fixed__name">{race.name}</span>
                <span className="cal-fixed__distance">{race.distanceLabel}</span>
                <span className="cal-fixed__course">
                  {race.courseName}
                  {race.countryLabel === null ? '' : ` (${race.countryLabel})`}
                </span>
                <span className="cal-fixed__conditions">{race.conditionsLabel}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="cal-week__label">일반 개최</p>
        <p className="hint">{row.generalSummary} · 나라별 후보: {row.generalDetail}</p>
        {row.meetings.length > 0 && (
          <ul className="cal-meetings">
            {row.meetings.map((m) => (
              <li className="cal-meetings__row" key={m.courseId}>
                <span className="cal-meetings__name">{m.label}</span>
                <span className="hint">{m.certaintyLabel}</span>
                <span className="hint cal-meetings__expected">예상: {m.expectedLabel}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="cal-week__label">내 말</p>
        {row.playerEntries.length === 0 ? (
          <p className="hint">이 주에 잡힌 계획이나 신청이 없습니다.</p>
        ) : (
          <ul className="cal-horses">
            {row.playerEntries.map((entry) => (
              <li className="cal-horses__row" key={entry.horseId}>
                <PlanLink horseId={entry.horseId} name={entry.name} />
                <span className={statusBadgeClass(entry.kind === 'declared' ? 'good' : 'muted')}>
                  {entry.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

interface RaceRowProps {
  locked: boolean;
  onBet: () => void;
  race: MeetingRaceView;
  /** 지금 낼 수 있는 내 말 */
  eligible: PlayerHorseOption[];
  pick: HorseId | undefined;
  onPick: (horseId: string) => void;
  onDeclare: () => void;
  onWithdraw: (horseId: HorseId) => void;
}

function RaceRow({
  race,
  eligible,
  pick,
  onPick,
  onDeclare,
  onWithdraw,
  locked,
  onBet,
}: RaceRowProps): JSX.Element {
  const open = race.status === 'open';
  const declared = race.playerDeclared;
  const pickedName = eligible.find((h) => h.id === pick)?.name;
  return (
    <li className="season-race">
      <div className="season-race__head">
        <strong>{race.name}</strong>
        <span>{race.gradeLabel}</span>
        <span>{race.distanceLabel}</span>
        <span>{RACE_STATUS_KO[race.status]}</span>
        {open && (
          <button type="button" className="btn" disabled={locked} onClick={onBet}>
            베팅
          </button>
        )}
      </div>
      <p className="hint">
        {race.conditionsLabel} · 총상금 {feeKo(race.totalPrize)} · 출주 {race.runners}/
        {race.maxRunners}두
      </p>
      {declared.map((d) => (
        <p key={d.horseId} className="notice notice--ok">
          출주 접수: <PlanLink horseId={d.horseId} name={d.name} />
          {open && (
            <>
              {' '}
              <button
                type="button"
                className="btn cal-btn-sub"
                disabled={locked}
                onClick={() => onWithdraw(d.horseId)}
              >
                취소
              </button>
            </>
          )}
        </p>
      ))}
      {open && eligible.length > 0 && (
        <div className="season-entry">
          <select value={pick ?? ''} onChange={(e) => onPick(e.target.value)}>
            <option value="">말 선택</option>
            {eligible.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn cal-btn-sub" disabled={locked} onClick={onDeclare}>
            출주
          </button>
          {pick !== undefined && pickedName !== undefined && (
            <PlanLink horseId={pick} name={pickedName}>
              {`${pickedName} 출주 계획`}
            </PlanLink>
          )}
        </div>
      )}
      {open && eligible.length === 0 && declared.length === 0 && (
        <p className="hint">지금 이 레이스에 낼 수 있는 내 말이 없습니다.</p>
      )}
    </li>
  );
}
