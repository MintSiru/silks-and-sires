import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameEvent, GameState, HorseId, TrainerId } from '../../engine/types';
import {
  assignTrainerErrorKo,
  declareErrorKo,
  eventKo,
  feeKo,
  personalityClueKo,
  statusKo,
  trainerReportKo,
  withdrawErrorKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import ReplayPanel from './ReplayPanel';
import {
  eligiblePlayerHorses,
  hasPendingPlayerRace,
  meetingsView,
  playerHorses,
  recentResults,
  trainerChoices,
  type MeetingRaceView,
  type PlayerHorseOption,
  type PlayerHorseView,
  type RaceStatusView,
  type TrainerChoice,
} from './seasonView';

/** 최근 결과 표시 개수 */
const RECENT_RESULT_COUNT = 8;
/** 마지막 진행 이벤트 표시 줄 수 */
const RECENT_EVENT_LINES = 10;
/** '출주한 레이스 결과까지' 로 기다리는 최대 주 수(개최는 이번 주·다음 주만 있으므로 짧게 잡는다) */
const RESULT_WAIT_MAX_WEEKS = 8;
/** 값이 없을 때 표시하는 기호 */
const NO_VALUE = '—';

const RACE_STATUS_KO: Record<RaceStatusView, string> = {
  open: '출주 접수 중',
  closed: '출주 마감',
  run: '결과 확정',
};

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.';
}

/** 레이스 선택 상자 키(개최 id + 레이스 id) */
function raceKey(meetingId: string, raceId: string): string {
  return `${meetingId}|${raceId}`;
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface SeasonScreenProps {
  game: GameApi;
  /** true 면 진행 버튼을 막는다(레거시 파산). 새 게임·불러오기와는 무관하다. */
  locked?: boolean;
}

/** 게임이 없으면 안내만, 있으면 시즌 화면을 보인다. 새 게임은 '목장·배합' 탭에서 시작한다. */
export default function SeasonScreen({ game, locked = false }: SeasonScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>시즌</h2>
        <p className="hint">먼저 '목장·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <SeasonView state={game.state} game={game} locked={locked} />;
}

// ── 시즌 진행 화면 ──────────────────────────────────────────────

interface SeasonViewProps {
  state: GameState;
  game: GameApi;
  locked: boolean;
}

function SeasonView({ state, game, locked }: SeasonViewProps): JSX.Element {
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 레이스별로 고른 출주 말(키: raceKey) */
  const [racePicks, setRacePicks] = useState<Record<string, HorseId>>({});
  /** 말별로 고른 조교사(키: horseId) */
  const [trainerPicks, setTrainerPicks] = useState<Record<HorseId, TrainerId>>({});

  const nameOf = (id: HorseId): string => state.horses[id]?.name ?? id;
  const owner = state.owners[state.playerOwnerId];

  const horses = useMemo(() => playerHorses(state), [state]);
  const meetings = useMemo(() => meetingsView(state), [state]);
  const results = useMemo(() => recentResults(state, RECENT_RESULT_COUNT), [state]);
  const eligibleByRace = useMemo(() => {
    const map = new Map<string, PlayerHorseOption[]>();
    for (const m of meetings) {
      for (const r of m.races) {
        map.set(raceKey(r.meetingId, r.raceId), eligiblePlayerHorses(state, r.meetingId, r.raceId));
      }
    }
    return map;
  }, [state, meetings]);

  // 주 시작 이벤트는 빼고, 마지막 진행의 이벤트 중 최근 N줄을 최신순으로 보인다.
  const recentEvents: GameEvent[] = game.lastEvents
    .filter((e) => e.type !== 'week_started')
    .slice(-RECENT_EVENT_LINES)
    .reverse();

  /** 상태 변경 한 번을 실행하고 결과를 알림으로 보인다. 예외는 한국어 메시지로 바꾼다. */
  const runAction = (action: () => void, okText: string): void => {
    try {
      action();
      setNotice({ tone: 'ok', text: okText });
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  const handleAdvanceToResults = (): void => {
    if (!hasPendingPlayerRace(state)) {
      setNotice({ tone: 'error', text: '출주 접수한 레이스가 없습니다. 먼저 레이스에 출주를 등록하세요.' });
      return;
    }
    // advanceUntil 은 stop 을 매 주 호출하므로, 멈춘 뒤의 상태를 여기서 잡아 둔다.
    const probe: { last: GameState | null } = { last: null };
    try {
      game.advanceUntil((s) => {
        probe.last = s;
        return !hasPendingPlayerRace(s);
      }, RESULT_WAIT_MAX_WEEKS);
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
      return;
    }
    const last = probe.last;
    if (last !== null && !hasPendingPlayerRace(last)) {
      setNotice({ tone: 'ok', text: '출주한 레이스가 끝났습니다. 아래 최근 결과에서 확인하세요.' });
    } else {
      setNotice({ tone: 'error', text: `${RESULT_WAIT_MAX_WEEKS}주 안에 출주한 레이스가 끝나지 않았습니다.` });
    }
  };

  const setRacePick = (key: string, horseId: string): void => {
    setRacePicks((prev) => {
      const next = { ...prev };
      if (horseId === '') {
        delete next[key];
      } else {
        next[key] = horseId;
      }
      return next;
    });
  };

  const setTrainerPick = (horseId: HorseId, trainerId: string): void => {
    setTrainerPicks((prev) => {
      const next = { ...prev };
      if (trainerId === '') {
        delete next[horseId];
      } else {
        next[horseId] = trainerId;
      }
      return next;
    });
  };

  const handleDeclare = (meetingId: string, raceId: string): void => {
    const key = raceKey(meetingId, raceId);
    const horseId = racePicks[key];
    if (horseId === undefined) {
      setNotice({ tone: 'error', text: '출주시킬 말을 고르세요.' });
      return;
    }
    const result = game.declarePlayerHorse(meetingId, raceId, horseId);
    if (!result.ok) {
      setNotice({ tone: 'error', text: declareErrorKo(result.error) });
      return;
    }
    setRacePick(key, '');
    setNotice({ tone: 'ok', text: `${nameOf(horseId)} 출주를 접수했습니다.` });
  };

  const handleWithdraw = (meetingId: string, raceId: string, horseId: HorseId): void => {
    const result = game.withdrawPlayerHorse(meetingId, raceId, horseId);
    if (!result.ok) {
      setNotice({ tone: 'error', text: withdrawErrorKo(result.error) });
      return;
    }
    setNotice({ tone: 'ok', text: `${nameOf(horseId)} 출주를 취소했습니다.` });
  };

  const handleAssign = (horse: PlayerHorseView): void => {
    const trainerId = trainerPicks[horse.id];
    if (trainerId === undefined) {
      setNotice({ tone: 'error', text: '조교사를 고르세요.' });
      return;
    }
    const result = game.assignTrainer(horse.id, trainerId);
    if (!result.ok) {
      setNotice({ tone: 'error', text: assignTrainerErrorKo(result.error) });
      return;
    }
    setTrainerPick(horse.id, '');
    setNotice({ tone: 'ok', text: `${horse.name} 조교사를 정했습니다.` });
  };

  return (
    <>
      <header className="topbar panel">
        <div className="topbar__info">
          <span className="topbar__date">{formatDateKo(state.date)}</span>
          <span>마주 {owner?.name ?? NO_VALUE}</span>
          <span>자금 {feeKo(owner?.funds ?? 0)}</span>
        </div>
        <div className="topbar__buttons">
          <button
            type="button"
            className="btn"
            disabled={locked}
            onClick={() => runAction(() => game.advance(1), '1주 진행했습니다.')}
          >
            1주 진행
          </button>
          <button
            type="button"
            className="btn"
            disabled={locked}
            onClick={() => runAction(() => game.advance(4), '4주 진행했습니다.')}
          >
            4주 진행
          </button>
          <button type="button" className="btn btn--primary" disabled={locked} onClick={handleAdvanceToResults}>
            출주한 레이스 결과까지
          </button>
        </div>
        {notice !== null && (
          <p className={`notice notice--${notice.tone}`} role="status">
            {notice.text}
          </p>
        )}
      </header>

      <section className="panel">
        <h2>최근 진행 이벤트</h2>
        {recentEvents.length === 0 ? (
          <p className="hint">아직 진행한 주가 없습니다.</p>
        ) : (
          <ol className="event-list">
            {recentEvents.map((e, index) => (
              <li key={index}>{eventKo(e, nameOf)}</li>
            ))}
          </ol>
        )}
      </section>

      <div className="breeding-layout">
        <section className="panel">
          <h2>내 말 ({horses.length}두)</h2>
          <p className="hint">조교사가 없는 말은 조교사를 정해야 출주할 수 있습니다.</p>
          {horses.length === 0 ? (
            <p className="hint">
              아직 출주시킬 말이 없습니다. 망아지가 자라 2세가 되면 여기서 조교사를 정하고 출주를 등록할 수 있습니다.
            </p>
          ) : (
            <div className="horse-list">
              {horses.map((horse) => (
                <PlayerHorseCard
                  key={horse.id}
                  horse={horse}
                  choices={horse.trainerId === null ? trainerChoices(state, horse.id) : []}
                  pick={trainerPicks[horse.id]}
                  onPick={(trainerId) => setTrainerPick(horse.id, trainerId)}
                  onAssign={() => handleAssign(horse)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>이번 주·다음 주 개최</h2>
          {meetings.length === 0 ? (
            <p className="hint">예정된 개최가 없습니다.</p>
          ) : (
            meetings.map((m) => (
              <div key={m.meetingId} className="season-meeting">
                <h3>
                  {m.courseName} · {m.dateLabel}
                </h3>
                <p className="hint">마장 {m.goingLabel}</p>
                <ul className="season-race-list">
                  {m.races.map((race) => {
                    const key = raceKey(race.meetingId, race.raceId);
                    return (
                      <RaceRow
                        key={key}
                        race={race}
                        eligible={eligibleByRace.get(key) ?? []}
                        pick={racePicks[key]}
                        onPick={(horseId) => setRacePick(key, horseId)}
                        onDeclare={() => handleDeclare(race.meetingId, race.raceId)}
                        onWithdraw={(horseId) => handleWithdraw(race.meetingId, race.raceId, horseId)}
                      />
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="panel">
        <h2>최근 결과</h2>
        <p className="hint">내 말이 나온 레이스와 그룹 1 결과를 최근순으로 보입니다.</p>
        {results.length === 0 ? (
          <p className="hint">아직 결과가 없습니다.</p>
        ) : (
          <table className="season-results">
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
                  <td>{r.winnerName}</td>
                  <td>
                    {r.playerRuns.length === 0
                      ? NO_VALUE
                      : r.playerRuns.map((p) => `${p.name} ${p.position}착`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>다시보기</h2>
        <ReplayPanel state={state} />
      </section>
    </>
  );
}

// ── 하위 컴포넌트 ───────────────────────────────────────────────

interface PlayerHorseCardProps {
  horse: PlayerHorseView;
  /** 조교사 미배정일 때만 든다 */
  choices: TrainerChoice[];
  pick: TrainerId | undefined;
  onPick: (trainerId: string) => void;
  onAssign: () => void;
}

function PlayerHorseCard({ horse, choices, pick, onPick, onAssign }: PlayerHorseCardProps): JSX.Element {
  return (
    <article className="horse-card">
      <div className="horse-card__head">
        <h3 className="horse-card__name">{horse.name}</h3>
        <span>
          {horse.ageYears}세 · {horse.sexLabel}
        </span>
      </div>
      <p className="horse-card__meta">
        {horse.coatLabel} · {statusKo(horse.status)}
      </p>
      <p className="horse-card__line">조교사 {horse.trainerName ?? '미배정'}</p>
      {horse.statusKey !== null && <p className="horse-card__hint">{trainerReportKo(horse.statusKey)}</p>}
      {horse.personalityKeys.length > 0 && (
        <ul className="comments">
          {horse.personalityKeys.map((key) => (
            <li key={key} className="comment comment--neutral">
              {personalityClueKo(key)}
            </li>
          ))}
        </ul>
      )}
      {horse.trainerName === null && (
        <div className="season-entry">
          <select className="horse-card__select" value={pick ?? ''} onChange={(e) => onPick(e.target.value)}>
            <option value="">조교사 선택</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id} disabled={c.full}>
                {`${c.name} (${c.load}/${c.capacity}두)${c.full ? ' · 만원' : ''}`}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={onAssign}>
            조교사 맡기기
          </button>
        </div>
      )}
    </article>
  );
}

interface RaceRowProps {
  race: MeetingRaceView;
  /** 지금 낼 수 있는 내 말 */
  eligible: PlayerHorseOption[];
  pick: HorseId | undefined;
  onPick: (horseId: string) => void;
  onDeclare: () => void;
  onWithdraw: (horseId: HorseId) => void;
}

function RaceRow({ race, eligible, pick, onPick, onDeclare, onWithdraw }: RaceRowProps): JSX.Element {
  const open = race.status === 'open';
  const declared = race.playerDeclared;
  return (
    <li className="season-race">
      <div className="season-race__head">
        <strong>{race.name}</strong>
        <span>{race.gradeLabel}</span>
        <span>{race.distanceLabel}</span>
        <span>{RACE_STATUS_KO[race.status]}</span>
      </div>
      <p className="hint">
        {race.conditionsLabel} · 총상금 {feeKo(race.totalPrize)} · 출주 {race.runners}/{race.maxRunners}두
      </p>
      {declared.map((d) => (
        <p key={d.horseId} className="notice notice--ok">
          출주 접수: {d.name}
          {open && (
            <>
              {' '}
              <button type="button" className="btn" onClick={() => onWithdraw(d.horseId)}>
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
          <button type="button" className="btn" onClick={onDeclare}>
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
