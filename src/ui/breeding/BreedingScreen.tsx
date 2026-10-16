import HorseNamingPanel from './HorseNamingPanel';
import { displayName } from '../../engine/naming/register';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { DEFAULT_ECONOMY_MODE, LEGACY_BANKRUPT_WEEKS } from '../../engine/config/economy';
import { DEFAULT_GAME_SETTINGS, HOME_COUNTRIES } from '../../engine/config/farm';
import { INBREED_EXCESS_FROM } from '../../engine/config/genetics';
import { totalBloodPercent } from '../../engine/breeding/inbreeding';
import { buildMatingPedigree, type PedigreeLookup } from '../../engine/breeding/pedigree';
import { buildMatingPreview } from '../../engine/breeding/preview';
import { createPedigreeLookup, isAnonDamId } from '../../engine/breeding/realPedigree';
import { bookingSeasonOf, damsireLineOf } from '../../engine/breeding/season';
import { LONG_LEASE_MAX_SEASONS, NOMINATION_MAX_PER_SEASON } from '../../engine/config/stud';
import { getNicks, getSireLines, getStallionRecords } from '../../engine/data/staticData';
import { privateAccess } from '../../engine/stud/private';
import { assessForPlayer, availableStallions, playerHorses } from '../../engine/horse/playerView';
import { ageInYear, formatDateKo } from '../../engine/time/calendar';
import type {
  Assessment,
  Difficulty,
  EconomyMode,
  GameEvent,
  GameState,
  HomeCountry,
  Horse,
  HorseId,
  Mare,
  StartType,
  Stallion,
} from '../../engine/types';
import {
  studRoleKo,
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
import { PLAYER_SILKS, type GameApi } from '../game/useGame';
import { silksDesignOf, silksFromDesign } from '../../engine/people/silks';
import type { SilksDesign } from '../../engine/types';
import SilksEditor from '../silks/SilksEditor';
import SilksSvg from '../silks/SilksSvg';
import { SILKS_ERROR_KO } from '../silks/silksText';
import {
  CATASTROPHIC_INJURY_HINT_KO,
  DIFFICULTY_OPTIONS,
  GRANT_RACEHORSES_HINT_KO,
  HOME_COUNTRY_HINT_KO,
  START_TYPE_OPTIONS,
  startSummaryKo,
} from '../newGame/newGameView';
import {
  bookingWindowKo,
  bookStatusOf,
  fertilityKo,
  mareBookingKo,
  myStudView,
  privateErrorKo,
  privateLabelKo,
  retireErrorKo,
  STUD_EMPTY_KO,
  tradeErrorKo,
} from './bookView';
import HorseCard from './HorseCard';
import PedigreeView from './PedigreeView';
import { salePriceWithNominationsKo } from '../yearEnd/yearEndView';

/** 새 게임 시작 폼 기본 시드(데모와 같은 값) */
const DEFAULT_SEED_TEXT = '20261011';
/** 최근 이벤트 표시 줄 수 */
const RECENT_EVENT_LINES = 10;
/** 값이 없을 때 표시하는 기호(미상 부모·계통 등) */
const NO_VALUE = '—';
/** 새 게임 경제 모드 선택지(짧은 설명 포함). 파산 주 수는 config 값을 그대로 쓴다. */
const ECONOMY_MODE_OPTIONS: readonly { mode: EconomyMode; label: string; description: string }[] = [
  {
    mode: 'casual',
    label: '캐주얼',
    description: '파산이 없습니다. 적자는 빚으로 쌓이고 매주 이자가 붙습니다. 빚이 있으면 교배 예약 같은 임의 지출이 막힙니다.',
  },
  {
    mode: 'legacy',
    label: '레거시',
    description: `자금이 마이너스인 상태가 ${LEGACY_BANKRUPT_WEEKS}주 연속이면 파산하고 게임이 멈춥니다.`,
  },
];


/** 계통 id → 계통 표시명 (data/stallions/sire_lines.json) */
const SIRE_LINE_LABEL: ReadonlyMap<string, string> = new Map(
  getSireLines().map((line) => [line.id, line.label]),
);

type StallionRow = { horse: Horse; stallion: Stallion };

/** 종마 거래 종류: 판매 2종, 임대 2종 */
type DealKind = 'domestic' | 'overseas' | 'shuttle' | 'long';
const DEAL_KINDS: readonly DealKind[] = ['domestic', 'overseas', 'shuttle', 'long'];
const DEAL_LABEL_KO: Record<DealKind, string> = {
  domestic: '국내 판매', overseas: '해외 판매', shuttle: '셔틀 임대', long: '장기 임대',
};
/** 장기 임대 복귀 시즌의 가장 이른 값은 year + 2 (year + 1 은 셔틀 복귀와 같은 해라 제외) */
const LONG_LEASE_FIRST_RETURN_OFFSET = 2;
/** 확인 단계 중인 거래 한 건. 한 번에 한 행만 확인한다. */
interface PendingDeal {
  horseId: HorseId;
  kind: DealKind;
  nominations: number;
  returnSeason: number;
}
/** 교배권 선택지 0~최대(엔진 상한) */
const NOMINATION_CHOICES: readonly number[] = Array.from({ length: NOMINATION_MAX_PER_SEASON + 1 }, (_, i) => i);

/** 장기 임대 복귀 시즌 선택지: year + 2 ~ year + 1 + LONG_LEASE_MAX_SEASONS */
function returnSeasonChoices(year: number): number[] {
  const first = year + LONG_LEASE_FIRST_RETURN_OFFSET;
  const last = year + 1 + LONG_LEASE_MAX_SEASONS;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

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
  /** true 면 진행 버튼을 막는다(레거시 파산). 새 게임·저장·불러오기는 막지 않는다. */
  locked?: boolean;
}

/** 게임이 없거나 '새 게임' 을 골랐으면 시작 패널만, 아니면 번식·배합 화면을 보인다. */
export default function BreedingScreen({ game, locked = false }: BreedingScreenProps): JSX.Element {
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
  return (
    <BreedingView state={game.state} game={game} locked={locked} onNewGame={() => setShowNewGame(true)} />
  );
}

// ── 새 게임 시작 패널 ───────────────────────────────────────────

interface NewGamePanelProps {
  game: GameApi;
  onDone: () => void;
  onCancel?: () => void;
}

function NewGamePanel({ game, onDone, onCancel }: NewGamePanelProps): JSX.Element {
  const [silks, setSilks] = useState(() => silksDesignOf(PLAYER_SILKS, 'owner-player'));
  const [playerName, setPlayerName] = useState('');
  const [farmName, setFarmName] = useState('');
  const [seedText, setSeedText] = useState(DEFAULT_SEED_TEXT);
  const [economyMode, setEconomyMode] = useState<EconomyMode>(DEFAULT_ECONOMY_MODE);
  const [startType, setStartType] = useState<StartType>(DEFAULT_GAME_SETTINGS.startType);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_GAME_SETTINGS.difficulty);
  const [homeCountry, setHomeCountry] = useState<HomeCountry>('GB');
  const [grantRacehorses, setGrantRacehorses] = useState(true);
  const [catastrophicInjuries, setCatastrophicInjuries] = useState(DEFAULT_GAME_SETTINGS.catastrophicInjuries);
  const [error, setError] = useState<string | null>(null);
  const summary = startSummaryKo(startType, difficulty, grantRacehorses);

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
      game.newGame({
        seed,
        playerName: name,
        farmName: startType === 'owner_breeder' ? farmName : undefined,
        silks: silksFromDesign(silks),
        economyMode,
        startType,
        difficulty,
        homeCountry,
        catastrophicInjuries,
        grantRacehorses,
      });
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
        <fieldset className="field">
          <legend>경제 모드(새 게임 때만 고를 수 있습니다)</legend>
          {ECONOMY_MODE_OPTIONS.map((option) => (
            <label key={option.mode} className="field">
              <input
                type="radio"
                name="economy-mode"
                value={option.mode}
                checked={economyMode === option.mode}
                onChange={() => setEconomyMode(option.mode)}
              />
              <span>{option.label}</span>
              <span className="hint">{option.description}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="field">
          <legend>시작 유형</legend>
          {START_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="field">
              <input
                type="radio"
                name="start-type"
                value={option.value}
                checked={startType === option.value}
                onChange={() => setStartType(option.value)}
              />
              <span>{option.label}</span>
              <span className="hint">{option.description}</span>
            </label>
          ))}
        </fieldset>
        {startType === 'owner_breeder' && <label className="field">
          <span>목장 이름</span>
          <input type="text" value={farmName} onChange={e => setFarmName(e.target.value)} />
          <span className="hint">빈칸이면 자동으로 정합니다. 2~30자, 글자·공백·하이픈·아포스트로피·마침표를 쓸 수 있습니다.</span>
        </label>}
        <fieldset className="field">
          <legend>난이도</legend>
          {DIFFICULTY_OPTIONS.map((option) => (
            <label key={option.value} className="field">
              <input
                type="radio"
                name="difficulty"
                value={option.value}
                checked={difficulty === option.value}
                onChange={() => setDifficulty(option.value)}
              />
              <span>{option.label}</span>
              <span className="hint">{option.description}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>소재국</span>
          <select value={homeCountry} onChange={(e) => setHomeCountry(e.target.value as HomeCountry)}>
            {HOME_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {countryKo(country)}
              </option>
            ))}
          </select>
          <span className="hint">{HOME_COUNTRY_HINT_KO}</span>
        </label>
        {startType === 'owner_breeder' && (
          <label className="field">
            <input
              type="checkbox"
              checked={grantRacehorses}
              onChange={(e) => setGrantRacehorses(e.target.checked)}
            />
            <span>현역마 지급</span>
            <span className="hint">{GRANT_RACEHORSES_HINT_KO}</span>
          </label>
        )}
        <label className="field">
          <input
            type="checkbox"
            checked={catastrophicInjuries}
            onChange={(e) => setCatastrophicInjuries(e.target.checked)}
          />
          <span>예후불량(경주 중 치명적 부상)</span>
          <span className="hint">{CATASTROPHIC_INJURY_HINT_KO}</span>
        </label>
        <section className="field" aria-label="고른 시작 조건">
          <span>고른 시작 조건</span>
          <ul className="hint">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <SilksEditor design={silks} onChange={setSilks} />
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
  /** 진행 버튼을 막는다(레거시 파산) */
  locked: boolean;
  onNewGame: () => void;
}

function BreedingView({ state, game, locked, onNewGame }: BreedingViewProps): JSX.Element {
  const [silksDraft, setSilksDraft] = useState<SilksDesign | null>(null);
  const [savingSilks, setSavingSilks] = useState(false);
  const [mareId, setMareId] = useState<HorseId | null>(null);
  const [stallionId, setStallionId] = useState<HorseId | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [watch, setWatch] = useState<FoalingWatch | null>(null);
  const [pendingDeal, setPendingDeal] = useState<PendingDeal | null>(null);
  const [dealError, setDealError] = useState<string | null>(null);
  /** 은퇴 확인 단계 중인 내 종마(한 번에 한 두만 확인한다) */
  const [retireTarget, setRetireTarget] = useState<HorseId | null>(null);
  const [retireError, setRetireError] = useState<string | null>(null);
  /** 비공개 전환 실패 사유(확인 단계 없이 바로 적용한다) */
  const [privateError, setPrivateError] = useState<string | null>(null);

  /** 이름 없는 모마 칸(~dam)은 미상 이름('—')으로 보인다 */
  const nameOf = (id: HorseId): string =>
    isAnonDamId(id) ? NO_VALUE : ((state.horses[id] === undefined ? id : displayName(state, state.horses[id]!)));
  const nameOrDash = (id: HorseId | null): string =>
    id === null ? NO_VALUE : ((state.horses[id] === undefined ? NO_VALUE : displayName(state, state.horses[id]!)));

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
  const windowOpen = bookingSeasonOf(state.date) !== null;
  const studView = useMemo(() => myStudView(state), [state]);
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
  const selectedFull = stallion === undefined ? false : bookStatusOf(state, stallion).full;

  const matingView = useMemo(() => {
    if (mare === null || sire === null || stallion === undefined) return null;
    const lookup: PedigreeLookup = createPedigreeLookup(state.horses, getStallionRecords());
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
      // 캐주얼 모드에서 빚이 남아 있으면 자금 부족 대신 '빚을 갚기 전에는…' 문구를 보인다
      const casualDebt = state.economy.mode === 'casual' && state.economy.debt > 0;
      setNotice({ tone: 'error', text: bookingErrorKo(result.error, casualDebt) });
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

  /** 거래 확인 단계를 연다. 국내 판매는 교배권 0개, 장기 임대는 가장 이른 복귀 시즌이 기본이다. */
  const startDeal = (horseId: HorseId, kind: DealKind): void => {
    setDealError(null);
    setRetireTarget(null);
    setRetireError(null);
    setPendingDeal({ horseId, kind, nominations: 0, returnSeason: state.date.year + LONG_LEASE_FIRST_RETURN_OFFSET });
  };

  /** 은퇴 확인 단계를 연다. 거래 확인 단계는 닫는다. */
  const startRetire = (horseId: HorseId): void => {
    setPendingDeal(null);
    setDealError(null);
    setRetireError(null);
    setRetireTarget(horseId);
  };

  /** 은퇴를 확정한다. 실패하면 사유를 alert 로 보인다. */
  const confirmRetire = (): void => {
    if (retireTarget === null) return;
    const name = nameOf(retireTarget);
    const result = game.retireStallion(retireTarget);
    setRetireTarget(null);
    if (result.ok) {
      setRetireError(null);
      setNotice({ tone: 'ok', text: `${name} 은퇴 완료` });
    } else {
      setRetireError(retireErrorKo(result.error));
    }
  };

  const cancelRetire = (): void => {
    setRetireTarget(null);
    setRetireError(null);
  };

  /** 확인된 거래를 엔진에 넘긴다. 실패하면 사유를 alert 로 보인다. */
  const confirmDeal = (): void => {
    if (pendingDeal === null) return;
    const { horseId, kind } = pendingDeal;
    const result = kind === 'domestic' || kind === 'overseas'
      ? game.sellStallion(horseId, kind, kind === 'domestic' ? pendingDeal.nominations : 0)
      : game.leaseStallion(horseId, kind, kind === 'long' ? pendingDeal.returnSeason : undefined);
    if (result.ok) {
      setPendingDeal(null);
      setDealError(null);
      setNotice({ tone: 'ok', text: `${nameOf(horseId)} ${DEAL_LABEL_KO[kind]} 완료` });
    } else {
      setDealError(tradeErrorKo(result.error));
    }
  };

  /** 내 종마의 공개 여부를 바꾼다. 확인 단계 없이 바로 적용하고, 실패하면 사유를 alert 로 보인다. */
  const togglePrivate = (horseId: HorseId, makePrivate: boolean): void => {
    const result = game.setStallionPrivate(horseId, makePrivate);
    if (result.ok) {
      setPrivateError(null);
      setNotice({ tone: 'ok', text: `${nameOf(horseId)} ${makePrivate ? '비공개로 전환' : '공개로 전환'} 완료` });
    } else {
      setPrivateError(privateErrorKo(result.error));
    }
  };

  const cancelDeal = (): void => {
    setPendingDeal(null);
    setDealError(null);
  };

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
        setSilksDraft(null);
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
          {owner !== undefined && <SilksSvg design={silksDesignOf(owner.silks, owner.id)} size={48} />}
          <span>마주 {owner?.name ?? NO_VALUE}</span>
          <span>자금 {feeKo(owner?.funds ?? 0)}</span>
        </div>
        <div className="topbar__buttons">
          <button type="button" className="btn" disabled={owner === undefined || savingSilks}
            onClick={() => { if (owner !== undefined) setSilksDraft(silksDesignOf(owner.silks, owner.id)); }}>
            승부복 바꾸기
          </button>
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
          <button
            type="button"
            className="btn"
            disabled={locked}
            onClick={() =>
              runAction(() => game.advanceToPhase('breeding'), `${phaseKo('breeding')} 시작 주까지 진행했습니다.`)
            }
          >
            종부 시즌까지
          </button>
          <button type="button" className="btn" disabled={locked} onClick={handleAdvanceToFoaling}>
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

      {silksDraft !== null && <section className="panel" aria-label="승부복 바꾸기">
        <SilksEditor design={silksDraft} onChange={setSilksDraft} />
        <p className="hint">다음 출주부터 적용됩니다. 이미 만든 출주표와 결과는 그대로입니다.</p>
        <button type="button" className="btn" disabled={savingSilks} onClick={() => {
          setSavingSilks(true);
          void game.setSilks(silksDraft).then((result) => {
            if (result.ok) {
              setSilksDraft(null);
              setNotice({ tone: 'ok', text: '승부복을 바꾸고 저장했습니다.' });
            } else setNotice({ tone: 'error', text: SILKS_ERROR_KO[result.error] });
          }).catch((error: unknown) => setNotice({ tone: 'error', text: `승부복 저장 실패: ${messageOf(error)}` }))
            .finally(() => setSavingSilks(false));
        }}>적용하고 저장</button>
        <button type="button" className="btn" disabled={savingSilks} onClick={() => setSilksDraft(null)}>취소</button>
      </section>}

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
              const mareRecord = state.mares[horse.id];
              const bookingKo = mareRecord === undefined ? null : mareBookingKo(mareRecord, nameOf);
              return (
                <Fragment key={horse.id}>
                  <HorseCard
                    state={state}
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
                  {horse.nameRegistered === false && <HorseNamingPanel
                    key={`${state.initialSeed}:${horse.id}`} game={game} horse={horse} locked={locked} />}
                  {bookingKo !== null && <p className="hint">{bookingKo}</p>}
                </Fragment>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>종마 ({visibleStallions.length}두)</h2>
          <p className="hint">{bookingWindowKo(state)}</p>
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
            <span>수태율</span>
            <span>북</span>
          </div>
          <ul className="stallion-list">
            {visibleStallions.map((row) => {
              const selected = row.horse.id === stallionId;
              const book = bookStatusOf(state, row.stallion);
              const privateKo = privateLabelKo(state, row.stallion);
              const denied = privateAccess(state, row.horse.id, state.playerOwnerId) === 'denied';
              return (
                <li key={row.horse.id}>
                  <button
                    type="button"
                    className={selected ? 'stallion-row stallion-row--selected' : 'stallion-row'}
                    aria-pressed={selected}
                    disabled={book.full || denied}
                    title={denied ? (privateKo ?? undefined) : book.full ? '북 마감' : undefined}
                    onClick={() => setStallionId(selected ? null : row.horse.id)}
                  >
                    <span>
                      {displayName(state, row.horse)}
                      <span className="badge">{studRoleKo(row.stallion.studRole)}</span>
                      {privateKo !== null && <span className="badge">{privateKo}</span>}
                    </span>
                    <span>{countryKo(row.stallion.standsIn)}</span>
                    <span>{feeKo(row.stallion.fee)}</span>
                    <span>{lineLabelOf(row.stallion.sireLineId)}</span>
                    <span>{fertilityKo(row.stallion)}</span>
                    <span>{book.labelKo}</span>
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
              {displayName(state, mare)} × {displayName(state, sire)}
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
              <dt>수태율</dt>
              <dd>{fertilityKo(stallion)}</dd>
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
              <button
                type="button"
                className="btn btn--primary"
                disabled={!windowOpen || selectedFull}
                title={!windowOpen ? '예약 창 닫힘' : selectedFull ? '북 마감' : undefined}
                onClick={handleBook}
              >
                교배 예약
              </button>
            </div>
            <h3>가상 혈통표</h3>
            <PedigreeView root={matingView.root} nameOf={nameOf} />
          </>
        )}
      </section>

      <section className="panel">
        <h2>내 종마 ({studView.stallions.length}두)</h2>
        <p className="hint">{studView.slotsKo}</p>
        <p className="hint">{studView.dealWindowKo}</p>
        {studView.stallions.length === 0 ? (
          <p className="hint">{STUD_EMPTY_KO}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>종마</th>
                  <th>종부료</th>
                  <th>북</th>
                  <th>수태율</th>
                  <th>첫 시즌</th>
                  <th>임대</th>
                  <th>거래</th>
                </tr>
              </thead>
              <tbody>
                {studView.stallions.map((row) => {
                  const pending = pendingDeal !== null && pendingDeal.horseId === row.horseId ? pendingDeal : null;
                  return (
                    <tr key={row.horseId}>
                      <td>
                        {row.name}
                        <span className="badge">{studRoleKo(state.stallions[row.horseId]?.studRole)}</span>
                        {row.isPrivate && <span className="badge">비공개</span>}
                      </td>
                      <td>{row.feeKo}</td>
                      <td>{row.bookKo}</td>
                      <td>
                        {row.fertilityKo}
                        {row.fertilityWarning && <span className="notice notice--error"> ⚠ 저수태</span>}
                      </td>
                      <td>{`${row.firstSeasonYear} 시즌`}</td>
                      <td>{row.leaseKo ?? NO_VALUE}</td>
                      <td>
                        {retireTarget === row.horseId && pending === null ? (
                          <div className="deal-confirm">
                            <span>{`${row.name} 은퇴: 종마사 칸이 비고 되돌릴 수 없습니다`}</span>
                            <button type="button" className="btn btn--primary" onClick={confirmRetire}>확정</button>
                            <button type="button" className="btn" onClick={cancelRetire}>취소</button>
                          </div>
                        ) : !row.canDeal && !row.canRetire ? NO_VALUE : pending === null ? (
                          <div className="deal-actions">
                            {row.canDeal && DEAL_KINDS.map((kind) => (
                              <button key={kind} type="button" className="btn" onClick={() => startDeal(row.horseId, kind)}>
                                {DEAL_LABEL_KO[kind]}
                              </button>
                            ))}
                            {row.canDeal && (
                              <button
                                type="button"
                                className="btn"
                                onClick={() => togglePrivate(row.horseId, !row.isPrivate)}
                              >
                                {row.isPrivate ? '공개로 전환' : '비공개로 전환'}
                              </button>
                            )}
                            {row.canRetire && (
                              <button type="button" className="btn" onClick={() => startRetire(row.horseId)}>은퇴</button>
                            )}
                          </div>
                        ) : (
                          <div className="deal-confirm">
                            {pending.kind === 'domestic' && (
                              <>
                                <label>
                                  교배권{' '}
                                  <select
                                    aria-label={`${row.name} 교배권`}
                                    value={pending.nominations}
                                    onChange={(e) => setPendingDeal({ ...pending, nominations: Number(e.target.value) })}
                                  >
                                    {NOMINATION_CHOICES.map((count) => (
                                      <option key={count} value={count}>{`${count}개`}</option>
                                    ))}
                                  </select>
                                </label>
                                <span>{`국내 판매가 ${salePriceWithNominationsKo(state, row.horseId, pending.nominations)}`}</span>
                              </>
                            )}
                            {pending.kind === 'overseas' && (
                              <span>{`해외 판매가 ${row.salePrice?.overseasKo ?? NO_VALUE} (세계에서 빠지고 교배권은 남지 않습니다)`}</span>
                            )}
                            {pending.kind === 'shuttle' && (
                              <span>{`셔틀 임대료 ${row.shuttleRentKo}, ${state.date.year + 1} 시즌 복귀`}</span>
                            )}
                            {pending.kind === 'long' && (
                              <>
                                <label>
                                  복귀 시즌{' '}
                                  <select
                                    aria-label={`${row.name} 복귀 시즌`}
                                    value={pending.returnSeason}
                                    onChange={(e) => setPendingDeal({ ...pending, returnSeason: Number(e.target.value) })}
                                  >
                                    {returnSeasonChoices(state.date.year).map((season) => (
                                      <option key={season} value={season}>{`${season} 시즌`}</option>
                                    ))}
                                  </select>
                                </label>
                                <span>{`연 임대료 ${row.longRentKo}`}</span>
                              </>
                            )}
                            <button type="button" className="btn btn--primary" onClick={confirmDeal}>확정</button>
                            <button type="button" className="btn" onClick={cancelDeal}>취소</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {dealError !== null && <p className="notice notice--error" role="alert">{dealError}</p>}
        {retireError !== null && <p className="notice notice--error" role="alert">{retireError}</p>}
        {privateError !== null && <p className="notice notice--error" role="alert">{privateError}</p>}
        {studView.nominations.length > 0 && (
          <>
            <h3>남긴 교배권</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>종마</th>
                    <th>잔여</th>
                  </tr>
                </thead>
                <tbody>
                  {studView.nominations.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td>{row.name}</td>
                      <td>{row.leftKo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {studView.soldRows.length > 0 && (
          <>
            <h3>판매 기록</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>연도</th>
                    <th>종마</th>
                    <th>구분</th>
                    <th>가격</th>
                  </tr>
                </thead>
                <tbody>
                  {studView.soldRows.map((row, index) => (
                    <tr key={`${row.year}-${row.name}-${index}`}>
                      <td>{row.year}</td>
                      <td>{row.name}</td>
                      <td>{row.modeKo}</td>
                      <td>{row.priceKo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <h3>최근 정산</h3>
        {studView.seasons.length === 0 ? (
          <p className="hint">아직 정산 기록이 없습니다.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>연도</th>
                  <th>종마</th>
                  <th>외부 교배</th>
                  <th>수태</th>
                  <th>수입</th>
                </tr>
              </thead>
              <tbody>
                {studView.seasons.map((row, index) => (
                  <tr key={`${row.year}-${row.name}-${index}`}>
                    <td>{row.year}</td>
                    <td>{row.name}</td>
                    <td>{row.outsideCovers}</td>
                    <td>{row.conceptions}</td>
                    <td>{row.incomeKo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
