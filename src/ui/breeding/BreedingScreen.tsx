import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { INBREED_EXCESS_FROM } from '../../engine/config/genetics';
import { totalBloodPercent } from '../../engine/breeding/inbreeding';
import { buildMatingPedigree, type PedigreeLookup } from '../../engine/breeding/pedigree';
import { buildMatingPreview } from '../../engine/breeding/preview';
import { damsireLineOf } from '../../engine/breeding/season';
import { getNicks, getSireLines } from '../../engine/data/staticData';
import { assessForPlayer, availableStallions, playerHorses } from '../../engine/horse/playerView';
import { ageInYear, formatDateKo } from '../../engine/time/calendar';
import type {
  Assessment,
  GameEvent,
  GameState,
  Horse,
  HorseId,
  Mare,
  Stallion,
} from '../../engine/types';
import {
  bookingErrorKo,
  commentText,
  complementKo,
  countryKo,
  distanceHintKo,
  eventKo,
  feeKo,
  growthKo,
  matingRoleKo,
  nickLabelKo,
  phaseKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import HorseCard from './HorseCard';
import PedigreeView from './PedigreeView';

/** 새 게임 시작 폼 기본 시드(데모와 같은 값) */
const DEFAULT_SEED_TEXT = '20261011';
/** 최근 이벤트 표시 줄 수 */
const RECENT_EVENT_LINES = 10;
/** 값이 없을 때 표시하는 기호(미상 부모·계통 등) */
const NO_VALUE = '—';


/** 계통 id → 계통 표시명 (data/stallions/sire_lines.json) */
const SIRE_LINE_LABEL: ReadonlyMap<string, string> = new Map(
  getSireLines().map((line) => [line.id, line.label]),
);

type StallionRow = { horse: Horse; stallion: Stallion };

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.';
}

function lineLabelOf(sireLineId: string | null): string {
  if (sireLineId === null) return NO_VALUE;
  return SIRE_LINE_LABEL.get(sireLineId) ?? sireLineId;
}

/** 인브리드 혈량 표기: 18.75 → "18.75", 12.5 → "12.5" */
function formatPercent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 출산 결과를 기다리는 최대 주 수(60주 = 임신 48주 + 수태 판정·여유) */
const MAX_FOALING_WAIT_WEEKS = 60;

/**
 * 암말의 출산 대기 결과가 확정됐는지.
 * 출산(foals 증가)했거나, 수태 실패로 예약이 풀려 임신 중도 아니고 교배 배정도 없으면 확정이다.
 * 예약 직후(수태 판정 전)에는 coveredBy 가 남아 있으므로 확정이 아니다.
 */
function isResolved(mare: Mare | undefined, startFoals: number): boolean {
  if (mare === undefined) return true;
  if (mare.foals.length > startFoals) return true;
  return !mare.pregnant && mare.coveredBy === null;
}

/** 출산 대기 중인 암말 목록과 출발 시점의 foals 길이 */
interface FoalingWatch {
  mareIds: HorseId[];
  startFoals: Record<HorseId, number>;
}

function matchesStallion(row: StallionRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    row.horse.name.toLowerCase().includes(q) ||
    lineLabelOf(row.stallion.sireLineId).toLowerCase().includes(q)
  );
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface BreedingScreenProps {
  game: GameApi;
}

/** 게임이 없거나 '새 게임' 을 골랐으면 시작 패널만, 아니면 목장·배합 화면을 보인다. */
export default function BreedingScreen({ game }: BreedingScreenProps): JSX.Element {
  const [showNewGame, setShowNewGame] = useState(false);

  if (game.state === null || showNewGame) {
    return (
      <NewGamePanel
        game={game}
        onDone={() => setShowNewGame(false)}
        onCancel={game.state === null ? undefined : () => setShowNewGame(false)}
      />
    );
  }
  return <BreedingView state={game.state} game={game} onNewGame={() => setShowNewGame(true)} />;
}

// ── 새 게임 시작 패널 ───────────────────────────────────────────

interface NewGamePanelProps {
  game: GameApi;
  onDone: () => void;
  onCancel?: () => void;
}

function NewGamePanel({ game, onDone, onCancel }: NewGamePanelProps): JSX.Element {
  const [playerName, setPlayerName] = useState('');
  const [seedText, setSeedText] = useState(DEFAULT_SEED_TEXT);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = playerName.trim();
    if (name === '') {
      setError('마주 이름을 입력하세요.');
      return;
    }
    const seedRaw = seedText.trim();
    const seed = seedRaw === '' ? Number.NaN : Number(seedRaw);
    if (!Number.isSafeInteger(seed) || seed < 0) {
      setError('시드는 0 이상의 정수로 입력하세요.');
      return;
    }
    try {
      game.newGame(seed, name);
      onDone();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const handleLoadSaved = async (): Promise<void> => {
    try {
      if (await game.load()) {
        onDone();
      } else {
        setError('불러올 저장본이 없거나 읽을 수 없습니다.');
      }
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="panel new-game">
      <h2>새 게임 시작</h2>
      <form className="new-game__form" onSubmit={handleSubmit}>
        <label className="field">
          <span>마주 이름</span>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="예: 애시콤 스터드 마주"
          />
        </label>
        <label className="field">
          <span>시드(같은 시드는 같은 세계)</span>
          <input
            type="text"
            inputMode="numeric"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
          />
        </label>
        {error !== null && <p className="notice notice--error" role="alert">{error}</p>}
        <div className="new-game__actions">
          <button type="submit" className="btn btn--primary">
            새 게임 시작
          </button>
          <button type="button" className="btn" onClick={() => void handleLoadSaved()}>
            저장본 불러오기
          </button>
          {onCancel !== undefined && (
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

// ── 게임 진행 중 화면 ───────────────────────────────────────────

interface BreedingViewProps {
  state: GameState;
  game: GameApi;
  onNewGame: () => void;
}

function BreedingView({ state, game, onNewGame }: BreedingViewProps): JSX.Element {
  const [mareId, setMareId] = useState<HorseId | null>(null);
  const [stallionId, setStallionId] = useState<HorseId | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [watch, setWatch] = useState<FoalingWatch | null>(null);

  const nameOf = (id: HorseId): string => state.horses[id]?.name ?? id;
  const nameOrDash = (id: HorseId | null): string =>
    id === null ? NO_VALUE : (state.horses[id]?.name ?? NO_VALUE);

  const owner = state.owners[state.playerOwnerId];
  const horses = useMemo(() => playerHorses(state), [state]);
  const assessments = useMemo(() => {
    const map = new Map<HorseId, Assessment>();
    for (const horse of horses) {
      map.set(horse.id, assessForPlayer(state, horse.id));
    }
    return map;
  }, [state, horses]);

  const stallionRows = useMemo(() => availableStallions(state), [state]);
  const visibleStallions = useMemo(
    () => stallionRows.filter((row) => matchesStallion(row, query)),
    [stallionRows, query],
  );

  // 매주 나오는 주 시작 이벤트는 빼고, 나머지 이벤트의 최근 N줄을 보인다.
  const recentEvents: GameEvent[] = state.eventLog
    .filter((e) => e.type !== 'week_started')
    .slice(-RECENT_EVENT_LINES)
    .reverse();

  // 배합 미리보기: 암말(내 번식 암말)과 종마를 모두 골랐을 때만
  const mare = mareId === null ? null : (state.horses[mareId] ?? null);
  const sire = stallionId === null ? null : (state.horses[stallionId] ?? null);
  const stallion = stallionId === null ? undefined : state.stallions[stallionId];

  const matingView = useMemo(() => {
    if (mare === null || sire === null || stallion === undefined) return null;
    const lookup: PedigreeLookup = (id) => state.horses[id];
    const damsire = mare.sireId === null ? null : (state.horses[mare.sireId] ?? null);
    const preview = buildMatingPreview({
      sire,
      dam: mare,
      damsireLineId: damsireLineOf(state, mare),
      lookup,
      nicks: getNicks(),
      revealedNicks: new Set(state.breeding.revealedNicks),
      damsire,
    });
    const root = buildMatingPedigree(lookup, sire.id, mare.id);
    return { preview, root, inbreedTotal: totalBloodPercent(preview.inbreeding) };
  }, [state, mare, sire, stallion]);

  /** 상태 변경 한 번을 실행하고 결과를 알림으로 보인다. 예외는 한국어 메시지로 바꾼다. */
  const runAction = (action: () => void, okText: string): void => {
    try {
      action();
      setNotice({ tone: 'ok', text: okText });
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  const handleBook = (): void => {
    if (mareId === null || stallionId === null) return;
    const result = game.book(mareId, stallionId);
    if (result.ok) {
      // 예약 이벤트는 useGame 이 eventLog 에 이미 붙였다. 여기서는 알림만 띄운다.
      setNotice({ tone: 'ok', text: `${nameOf(mareId)} 교배 예약 완료 (종마 ${nameOf(stallionId)})` });
    } else {
      setNotice({ tone: 'error', text: bookingErrorKo(result.error) });
    }
  };

  const handleAdvanceToFoaling = (): void => {
    const mareIds = horses
      .map((h) => h.id)
      .filter((id) => {
        const m = state.mares[id];
        return m !== undefined && (m.pregnant || m.coveredBy !== null);
      });
    if (mareIds.length === 0) {
      runAction(() => game.advanceToPhase('foaling'), `${phaseKo('foaling')} 시작 주까지 진행했습니다.`);
      return;
    }
    const startFoals: Record<HorseId, number> = {};
    for (const id of mareIds) {
      startFoals[id] = state.mares[id]?.foals.length ?? 0;
    }
    setWatch({ mareIds, startFoals });
    try {
      game.advanceUntil(
        (s2) => mareIds.every((id) => isResolved(s2.mares[id], startFoals[id] ?? 0)),
        MAX_FOALING_WAIT_WEEKS,
      );
    } catch (error) {
      setWatch(null);
      setNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  // 출산 대기 결과 집계: advanceUntil 이 상태를 바꾼 뒤 한 번 보고하고 대기를 끝낸다
  useEffect(() => {
    if (watch === null) return;
    let born = 0;
    let failed = 0;
    let open = 0;
    for (const id of watch.mareIds) {
      const m = state.mares[id];
      const start = watch.startFoals[id] ?? 0;
      const foals = m?.foals.length ?? 0;
      born += Math.max(0, foals - start);
      if (!isResolved(m, start)) {
        open += 1;
      } else if (m !== undefined && foals === start) {
        failed += 1;
      }
    }
    const parts: string[] = [];
    if (born > 0) parts.push(`망아지 ${born}두가 태어났습니다.`);
    if (failed > 0) {
      parts.push(failed === 1 ? '수태하지 못했습니다.' : `${failed}두가 수태하지 못했습니다.`);
    }
    if (open > 0) parts.push(`${MAX_FOALING_WAIT_WEEKS}주 안에 출산 결과가 나오지 않았습니다.`);
    setNotice({
      tone: open > 0 ? 'error' : 'ok',
      text: parts.length > 0 ? parts.join(' ') : '출산 결과가 없습니다.',
    });
    setWatch(null);
  }, [state, watch]);

  const handleSave = async (): Promise<void> => {
    try {
      await game.save();
      setNotice({ tone: 'ok', text: '자동 저장했습니다.' });
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    }
  };

  const handleLoad = async (): Promise<void> => {
    try {
      const loaded = await game.load();
      if (loaded) {
        setMareId(null);
        setStallionId(null);
        setNotice({ tone: 'ok', text: '자동 저장본을 불러왔습니다.' });
      } else {
        setNotice({ tone: 'error', text: '불러올 저장본이 없거나 읽을 수 없습니다.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error) });
    }
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
          <button type="button" className="btn" onClick={() => runAction(() => game.advance(1), '1주 진행했습니다.')}>
            1주 진행
          </button>
          <button type="button" className="btn" onClick={() => runAction(() => game.advance(4), '4주 진행했습니다.')}>
            4주 진행
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              runAction(() => game.advanceToPhase('breeding'), `${phaseKo('breeding')} 시작 주까지 진행했습니다.`)
            }
          >
            종부 시즌까지
          </button>
          <button type="button" className="btn" onClick={handleAdvanceToFoaling}>
            출산 시즌까지
          </button>
          <button type="button" className="btn" onClick={() => void handleSave()}>
            저장
          </button>
          <button type="button" className="btn" onClick={() => void handleLoad()}>
            불러오기
          </button>
          <button type="button" className="btn" onClick={onNewGame}>
            새 게임
          </button>
        </div>
        {notice !== null && (
          <p className={`notice notice--${notice.tone}`} role="status">
            {notice.text}
          </p>
        )}
      </header>

      <section className="panel">
        <h2>최근 이벤트</h2>
        {recentEvents.length === 0 ? (
          <p className="hint">아직 기록된 이벤트가 없습니다.</p>
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
          <p className="hint">번식 암말을 골라 교배 상대를 정하세요.</p>
          <div className="horse-list">
            {horses.map((horse) => {
              const assessment = assessments.get(horse.id);
              if (assessment === undefined) return null;
              const dam = horse.damId === null ? undefined : state.horses[horse.damId];
              const selectable = horse.sex === 'female' && horse.status === 'broodmare';
              return (
                <HorseCard
                  key={horse.id}
                  horse={horse}
                  assessment={assessment}
                  ageYears={ageInYear(horse.birthYear, state.date.year)}
                  parentage={{
                    sire: nameOrDash(horse.sireId),
                    dam: nameOrDash(horse.damId),
                    damsire: nameOrDash(dam?.sireId ?? null),
                  }}
                  lineLabel={lineLabelOf(horse.sireLineId)}
                  selected={horse.id === mareId}
                  onSelect={
                    selectable ? () => setMareId(horse.id === mareId ? null : horse.id) : undefined
                  }
                />
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>종마 ({visibleStallions.length}두)</h2>
          <input
            type="search"
            className="search"
            placeholder="종마 이름 또는 계통 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="stallion-head">
            <span>종마</span>
            <span>계류국</span>
            <span>종부료</span>
            <span>계통</span>
          </div>
          <ul className="stallion-list">
            {visibleStallions.map((row) => {
              const selected = row.horse.id === stallionId;
              return (
                <li key={row.horse.id}>
                  <button
                    type="button"
                    className={selected ? 'stallion-row stallion-row--selected' : 'stallion-row'}
                    aria-pressed={selected}
                    onClick={() => setStallionId(selected ? null : row.horse.id)}
                  >
                    <span>{row.horse.name}</span>
                    <span>{countryKo(row.stallion.standsIn)}</span>
                    <span>{feeKo(row.stallion.fee)}</span>
                    <span>{lineLabelOf(row.stallion.sireLineId)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="panel preview">
        <h2>배합 미리보기</h2>
        {matingView === null || mare === null || sire === null || stallion === undefined ? (
          <p className="hint">암말과 종마를 각각 고르면 배합 미리보기와 가상 혈통표가 나옵니다.</p>
        ) : (
          <>
            <p className="preview__pair">
              {mare.name} × {sire.name}
            </p>
            <dl className="preview__facts">
              <dt>닉스</dt>
              <dd>{nickLabelKo(matingView.preview.nick.label)}</dd>
              <dt>역할</dt>
              <dd>
                {`부마 ${matingRoleKo(matingView.preview.roles.sire)} · 모계 ${matingRoleKo(matingView.preview.roles.damSide)}`}
              </dd>
              <dt>보완형</dt>
              <dd>
                {matingView.preview.complement === 'likely' ? (
                  <span className="comment comment--positive">
                    {complementKo(matingView.preview.complement)}
                  </span>
                ) : (
                  complementKo(matingView.preview.complement)
                )}
              </dd>
              <dt>인브리드</dt>
              <dd>
                {matingView.preview.inbreeding.length === 0 ? (
                  '없음'
                ) : (
                  <ul className="inbreed-list">
                    {matingView.preview.inbreeding.map((cross) => (
                      <li key={cross.ancestorId}>
                        {`${nameOf(cross.ancestorId)} ${cross.label} (${formatPercent(cross.bloodPercent)}%)`}
                        {cross.bloodPercent > INBREED_EXCESS_FROM && (
                          <span className="notice notice--error"> — 과다 근친: 건강·능력 저하 위험</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
              <dt>거리 힌트</dt>
              <dd>{distanceHintKo(matingView.preview.distanceHint)}</dd>
              <dt>조숙·만성</dt>
              <dd>{growthKo(matingView.preview.precocityHint)}</dd>
              <dt>종부료</dt>
              <dd>{feeKo(stallion.fee)}</dd>
            </dl>
            <ul className="comments">
              {matingView.preview.comments.map((c, index) => (
                <li key={`${c.key}-${index}`} className={`comment comment--${c.tone}`}>
                  {commentText(c, `${sire.id}|${mare.id}|${c.key}`)}
                </li>
              ))}
            </ul>
            {matingView.inbreedTotal > INBREED_EXCESS_FROM && (
              <p className="notice notice--error">
                {`인브리드 혈량 합계 ${formatPercent(matingView.inbreedTotal)}%: 과다 근친 기준 ${INBREED_EXCESS_FROM}%를 넘습니다. 건강·능력 저하 위험이 있습니다. 예약은 가능합니다.`}
              </p>
            )}
            <div className="preview__actions">
              <button type="button" className="btn btn--primary" onClick={handleBook}>
                교배 예약
              </button>
            </div>
            <h3>가상 혈통표</h3>
            <PedigreeView root={matingView.root} nameOf={nameOf} />
          </>
        )}
      </section>
    </>
  );
}
