import { useMemo, useState, type JSX } from 'react';
import type { HorseId } from '../../engine/types';
import { declareErrorKo, feeKo, withdrawErrorKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import BettingPanel from '../betting/BettingPanel';
import ReplayPanel from './ReplayPanel';
import { upcomingRaceRows } from './racePlanView';
import {
  eligiblePlayerHorses,
  meetingsView,
  recentResults,
  type MeetingRaceView,
  type PlayerHorseOption,
  type RaceStatusView,
} from './seasonView';
import HorseLink from '../horse/HorseLink';
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
  const [notice, setNotice] = useState<string | null>(null);
  const [racePicks, setRacePicks] = useState<Record<string, string>>({});
  const calendar = useMemo(() => upcomingRaceRows(game.state === null ? [] : game.upcomingRaces(12)), [game]);
  const state = game.state;
  if (state === null) return null;
  const meetings = meetingsView(state);
  const results = recentResults(state, 20);
  return (
    <>
      {notice !== null && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {section === 'calendar' ? (
        <>
          <section className="panel">
            <h2>앞으로 12주 레이스</h2>
            <p className="hint">
              고정 일정은 확정입니다. 일반 개최 후보와 예상 종류는 실제 편성을 보장하지 않습니다. 출주 계획은
              말 상세에서 검토하세요.
            </p>
            {calendar.map((week) => (
              <details key={week.key}>
                <summary>
                  {week.dateLabel} · 고정 일정 {week.fixed.length}개
                </summary>
                <ul>
                  {week.fixed.map((race) => (
                    <li key={race.id}>{race.label}</li>
                  ))}
                </ul>
                <p className="hint">일반 개최: {week.countLabel || '없음'}</p>
                <ul>
                  {week.meetings.map((meeting) => (
                    <li key={meeting.id}>
                      {meeting.label}
                      <p className="hint">예상: {meeting.expected}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
          <section className="panel">
            <h2>이번 주·다음 주 개최</h2>
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
                        onBet={() => setBetRace({ meetingId: race.meetingId, raceId: race.raceId })}
                        onDeclare={() => {
                          const id = racePicks[key];
                          if (!id) {
                            setNotice('출주시킬 말을 고르세요.');
                            return;
                          }
                          const result = game.declarePlayerHorse(race.meetingId, race.raceId, id);
                          setNotice(result.ok ? '출주를 접수했습니다.' : declareErrorKo(result.error));
                        }}
                        onWithdraw={(id) => {
                          const result = game.withdrawPlayerHorse(race.meetingId, race.raceId, id);
                          setNotice(result.ok ? '출주를 취소했습니다.' : withdrawErrorKo(result.error));
                        }}
                      />
                    );
                  })}
                </ul>
              </details>
            ))}
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
        {race.conditionsLabel} · 총상금 {feeKo(race.totalPrize)} · 출주 {race.runners}/{race.maxRunners}두
      </p>
      {declared.map((d) => (
        <p key={d.horseId} className="notice notice--ok">
          출주 접수: <HorseLink horseId={d.horseId} name={d.name} />
          {open && (
            <>
              {' '}
              <button type="button" className="btn" disabled={locked} onClick={() => onWithdraw(d.horseId)}>
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
          <button type="button" className="btn" disabled={locked} onClick={onDeclare}>
            출주
          </button>
        </div>
      )}
      {open && eligible.length === 0 && declared.length === 0 && (
        <p className="hint">지금 이 레이스에 낼 수 있는 내 말이 없습니다.</p>
      )}
    </li>
  );
}
