import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { totalBloodPercent } from '../../engine/breeding/inbreeding';
import { buildMatingPedigree, type PedigreeLookup } from '../../engine/breeding/pedigree';
import { buildMatingPreview } from '../../engine/breeding/preview';
import { createPedigreeLookup } from '../../engine/breeding/realPedigree';
import { pedigreeNameOf } from './pedigreeNames';
import { bookingSeasonOf, damsireLineOf } from '../../engine/breeding/season';
import { INBREED_EXCESS_FROM } from '../../engine/config/genetics';
import { LONG_LEASE_MAX_SEASONS, NOMINATION_MAX_PER_SEASON } from '../../engine/config/stud';
import { getNicks, getSireLines, getStallionRecords } from '../../engine/data/staticData';
import { availableStallions, playerHorses } from '../../engine/horse/playerView';
import { displayName } from '../../engine/naming/register';
import { privateAccess } from '../../engine/stud/private';
import { ageInYear } from '../../engine/time/calendar';
import type { GameState, Horse, HorseId, Stallion } from '../../engine/types';
import {
  bookingErrorKo,
  commentText,
  complementKo,
  countryKo,
  distanceHintKo,
  feeKo,
  growthKo,
  matingRoleKo,
  nickLabelKo,
  studRoleKo,
} from '../game/text';
import { type GameApi } from '../game/useGame';
import HorseLink from '../horse/HorseLink';
import { salePriceWithNominationsKo } from '../yearEnd/yearEndView';
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
import PedigreeView from './PedigreeView';
import MatingPlanPanel from './MatingPlanPanel';

const NO_VALUE = '—';

/** 계통 id → 계통 표시명 (data/stallions/sire_lines.json) */
const SIRE_LINE_LABEL: ReadonlyMap<string, string> = new Map(
  getSireLines().map((line) => [line.id, line.label]),
);

type StallionRow = { horse: Horse; stallion: Stallion };

/** 종마 거래 종류: 판매 2종, 임대 2종 */
type DealKind = 'domestic' | 'overseas' | 'shuttle' | 'long';
const DEAL_KINDS: readonly DealKind[] = ['domestic', 'overseas', 'shuttle', 'long'];
const DEAL_LABEL_KO: Record<DealKind, string> = {
  domestic: '국내 판매',
  overseas: '해외 판매',
  shuttle: '셔틀 임대',
  long: '장기 임대',
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
const NOMINATION_CHOICES: readonly number[] = Array.from(
  { length: NOMINATION_MAX_PER_SEASON + 1 },
  (_, i) => i,
);

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

function lineLabelOf(sireLineId: string | null): string {
  if (sireLineId === null) return NO_VALUE;
  return SIRE_LINE_LABEL.get(sireLineId) ?? sireLineId;
}

/** 인브리드 혈량 표기: 18.75 → "18.75", 12.5 → "12.5" */
function formatPercent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function matchesStallion(row: StallionRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    row.horse.name.toLowerCase().includes(q) || lineLabelOf(row.stallion.sireLineId).toLowerCase().includes(q)
  );
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface BreedingScreenProps {
  game: GameApi;
  /** true 면 진행 버튼을 막는다(레거시 파산). 새 게임·저장·불러오기는 막지 않는다. */
  locked?: boolean;
}

export default function BreedingScreen({ game, locked = false }: BreedingScreenProps): JSX.Element | null {
  return game.state === null ? null : <BreedingView state={game.state} game={game} locked={locked} />;
}

// ── 게임 진행 중 화면 ───────────────────────────────────────────

interface BreedingViewProps {
  state: GameState;
  game: GameApi;
  /** 진행 버튼을 막는다(레거시 파산) */
  locked: boolean;
}

function BreedingView({ state, game, locked }: BreedingViewProps): JSX.Element {
  const [mareId, setMareId] = useState<HorseId | null>(null);
  const [stallionId, setStallionId] = useState<HorseId | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingDeal, setPendingDeal] = useState<PendingDeal | null>(null);
  const [dealError, setDealError] = useState<string | null>(null);
  /** 은퇴 확인 단계 중인 내 종마(한 번에 한 두만 확인한다) */
  const [retireTarget, setRetireTarget] = useState<HorseId | null>(null);
  const [retireError, setRetireError] = useState<string | null>(null);
  /** 비공개 전환 실패 사유(확인 단계 없이 바로 적용한다) */
  const [privateError, setPrivateError] = useState<string | null>(null);

  /** 이름 없는 모마 칸(~dam)은 미상 이름('—')으로 보인다 */
  const nameOf = (id: HorseId): string => pedigreeNameOf(state, id);
  const horses = useMemo(() => playerHorses(state).filter((h) => h.status === 'broodmare'), [state]);
  const stallionRows = useMemo(() => availableStallions(state), [state]);
  const windowOpen = bookingSeasonOf(state.date) !== null;
  const studView = useMemo(() => myStudView(state), [state]);
  const visibleStallions = useMemo(
    () => stallionRows.filter((row) => matchesStallion(row, query)),
    [stallionRows, query],
  );

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

  /** 거래 확인 단계를 연다. 국내 판매는 교배권 0개, 장기 임대는 가장 이른 복귀 시즌이 기본이다. */
  const startDeal = (horseId: HorseId, kind: DealKind): void => {
    setDealError(null);
    setRetireTarget(null);
    setRetireError(null);
    setPendingDeal({
      horseId,
      kind,
      nominations: 0,
      returnSeason: state.date.year + LONG_LEASE_FIRST_RETURN_OFFSET,
    });
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
    const result =
      kind === 'domestic' || kind === 'overseas'
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
      setNotice({
        tone: 'ok',
        text: `${nameOf(horseId)} ${makePrivate ? '비공개로 전환' : '공개로 전환'} 완료`,
      });
    } else {
      setPrivateError(privateErrorKo(result.error));
    }
  };

  const cancelDeal = (): void => {
    setPendingDeal(null);
    setDealError(null);
  };

  return (
    <>
      {/* UX4 자동 교배 제안 표: 번식 화면의 첫 영역으로 삽입한다. */}
      <div data-slot="breeding-proposals">
        <MatingPlanPanel state={state} game={game} locked={locked} />
      </div>
      <details className="panel manual-breeding">
      <summary>수동 배합 · 암말과 종마 고르기</summary>
      {notice !== null && (
        <p className={`notice notice--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}
      <div className="breeding-layout">
        <section className="panel">
          <h3>1. 번식 암말 고르기 ({horses.length}두)</h3>
          <p className="hint">번식 암말을 골라 교배 상대를 정하세요.</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>암말</th>
                <th>나이</th>
                <th>임신·교배 상태</th>
                <th>배합</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((horse) => (
                <tr key={horse.id}>
                  <th scope="row">
                    <HorseLink horseId={horse.id} name={displayName(state, horse)} />
                  </th>
                  <td>{ageInYear(horse.birthYear, state.date.year)}세</td>
                  <td>
                    {state.mares[horse.id] ? mareBookingKo(state.mares[horse.id]!, nameOf) : '기록 없음'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      aria-pressed={mareId === horse.id}
                      onClick={() => setMareId(mareId === horse.id ? null : horse.id)}
                    >
                      {mareId === horse.id ? '선택됨' : '암말로 선택'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {horses.length === 0 && <p className="empty-state">소유한 번식 암말이 없습니다.</p>}
        </section>

        <section className="panel">
          <h3>2. 종마 찾기 ({visibleStallions.length}두)</h3>
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
                  <div className={selected ? 'stallion-row stallion-row--selected' : 'stallion-row'}>
                    <span>
                      <HorseLink horseId={row.horse.id} name={displayName(state, row.horse)} />
                      <button
                        type="button"
                        className="btn"
                        aria-pressed={selected}
                        disabled={locked || book.full || denied}
                        onClick={() => setStallionId(selected ? null : row.horse.id)}
                      >
                        {selected ? '선택됨' : '배합 선택'}
                      </button>
                      <span className="badge">{studRoleKo(row.stallion.studRole)}</span>
                      {privateKo !== null && <span className="badge">{privateKo}</span>}
                    </span>
                    <span>{countryKo(row.stallion.standsIn)}</span>
                    <span>{feeKo(row.stallion.fee)}</span>
                    <span>{lineLabelOf(row.stallion.sireLineId)}</span>
                    <span>{fertilityKo(row.stallion)}</span>
                    <span>{book.labelKo}</span>
                  </div>
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
              <HorseLink horseId={mare.id} name={displayName(state, mare)} /> ×{' '}
              <HorseLink horseId={sire.id} name={displayName(state, sire)} />
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
                        <HorseLink horseId={cross.ancestorId} name={nameOf(cross.ancestorId)} /> {cross.label}{' '}
                        ({formatPercent(cross.bloodPercent)}%)
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
                className="btn"
                disabled={locked || !windowOpen || selectedFull}
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

      </details>
      <details className="panel stud-business">
        <summary>내 종마 사업 ({studView.stallions.length}두)</summary>
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
                  const pending =
                    pendingDeal !== null && pendingDeal.horseId === row.horseId ? pendingDeal : null;
                  return (
                    <tr key={row.horseId}>
                      <td>
                        <HorseLink name={row.name} />
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
                            <span>{`$<HorseLink name={row.name} /> 은퇴: 종마사 칸이 비고 되돌릴 수 없습니다`}</span>
                            <button type="button" className="btn" disabled={locked} onClick={confirmRetire}>
                              확정
                            </button>
                            <button type="button" className="btn" onClick={cancelRetire}>
                              취소
                            </button>
                          </div>
                        ) : !row.canDeal && !row.canRetire ? (
                          NO_VALUE
                        ) : pending === null ? (
                          <div className="deal-actions">
                            {row.canDeal &&
                              DEAL_KINDS.map((kind) => (
                                <button
                                  key={kind}
                                  type="button"
                                  className="btn"
                                  onClick={() => startDeal(row.horseId, kind)}
                                >
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
                              <button type="button" className="btn" onClick={() => startRetire(row.horseId)}>
                                은퇴
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="deal-confirm">
                            {pending.kind === 'domestic' && (
                              <>
                                <label>
                                  교배권{' '}
                                  <select
                                    aria-label={`$<HorseLink name={row.name} /> 교배권`}
                                    value={pending.nominations}
                                    onChange={(e) =>
                                      setPendingDeal({ ...pending, nominations: Number(e.target.value) })
                                    }
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
                                    aria-label={`$<HorseLink name={row.name} /> 복귀 시즌`}
                                    value={pending.returnSeason}
                                    onChange={(e) =>
                                      setPendingDeal({ ...pending, returnSeason: Number(e.target.value) })
                                    }
                                  >
                                    {returnSeasonChoices(state.date.year).map((season) => (
                                      <option key={season} value={season}>{`${season} 시즌`}</option>
                                    ))}
                                  </select>
                                </label>
                                <span>{`연 임대료 ${row.longRentKo}`}</span>
                              </>
                            )}
                            <button type="button" className="btn" disabled={locked} onClick={confirmDeal}>
                              확정
                            </button>
                            <button type="button" className="btn" onClick={cancelDeal}>
                              취소
                            </button>
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
        {dealError !== null && (
          <p className="notice notice--error" role="alert">
            {dealError}
          </p>
        )}
        {retireError !== null && (
          <p className="notice notice--error" role="alert">
            {retireError}
          </p>
        )}
        {privateError !== null && (
          <p className="notice notice--error" role="alert">
            {privateError}
          </p>
        )}
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
                    <tr key={`$<HorseLink name={row.name} />-${index}`}>
                      <td>
                        <HorseLink name={row.name} />
                      </td>
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
                    <tr key={`${row.year}-$<HorseLink name={row.name} />-${index}`}>
                      <td>{row.year}</td>
                      <td>
                        <HorseLink name={row.name} />
                      </td>
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
                  <tr key={`${row.year}-$<HorseLink name={row.name} />-${index}`}>
                    <td>{row.year}</td>
                    <td>
                      <HorseLink name={row.name} />
                    </td>
                    <td>{row.outsideCovers}</td>
                    <td>{row.conceptions}</td>
                    <td>{row.incomeKo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </>
  );
}
