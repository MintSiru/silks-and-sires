import { Fragment, useContext, useEffect, useRef, useState } from 'react';
import { coatColour } from '../../engine/horse/coat';
import type { InjuryError } from '../../engine/horse/injury';
import { assessForPlayer } from '../../engine/horse/playerView';
import { displayName } from '../../engine/naming/register';
import { silksDesignOf } from '../../engine/people/silks';
import { ageInYear } from '../../engine/time/calendar';
import HorseNamingPanel from '../breeding/HorseNamingPanel';
import PedigreeView from '../breeding/PedigreeView';
import { pedigreeNameOf } from '../breeding/pedigreeNames';
import { bookStatusOf, fertilityKo, mareBookingKo } from '../breeding/bookView';
import { GradeBadge, PositionBadge, StatusBadge } from '../common/Badge';
import { orValueKo } from '../common/glossary';
import { Term } from '../common/Term';
import { useWeightUnit } from '../game/WeightUnitContext';
import { assignTrainerErrorKo, coatColourKo, feeKo, sexKo, statusKo } from '../game/text';
import { formatWeight, type WeightUnit } from '../game/units';
import type { GameApi } from '../game/useGame';
import ReplayPanel from '../season/ReplayPanel';
import { injuryViewOf, playerHorses, trainerChoices } from '../season/seasonView';
import SilksSvg from '../silks/SilksSvg';
import HorseEventText from './HorseEventText';
import HorseLink, { HorseNavigation, type HorseTab } from './HorseLink';
import InjuryBlock from './InjuryBlock';
import RacePlanPanel from './RacePlanPanel';
import {
  HORSE_TAB_LABELS,
  RECENT_RUN_COUNT,
  conditionOf,
  formSummaryKo,
  horsePedigree,
  horseRunRows,
  horseTabs,
  horseTimeline,
  overviewOf,
  recentRuns,
  type HorseRunRow,
  type TimelineItem,
} from './horseDetailView';
import { horseLegacyBadges } from '../legacy/legacyView';
import { useNotify } from '../shell/notify';
import './horse.css';

/**
 * 기록 타임라인의 배지 열(날짜 바로 오른쪽, 모든 행 같은 열). 출주는 착순, 연대기 문장은 '주요 순간'.
 * 그 밖의 이벤트 행은 빈 칸으로 두어 열 정렬을 지킨다.
 */
function TimelineBadge({ item }: { item: TimelineItem }) {
  if (item.kind === 'milestone') return <span className="badge badge--grade-top">주요 순간</span>;
  if (item.kind === 'race' && item.race) {
    const { position, fieldSize } = item.race;
    if (position === null) return null;
    return <PositionBadge position={position} fieldSize={fieldSize ?? undefined} />;
  }
  return null;
}

/** 기록 타임라인 한 줄의 본문. 연대기는 문장, 말 관점 출주는 '[등급] 경주명', 나머지는 이벤트 문장. */
function TimelineText({ item }: { item: TimelineItem }) {
  if (item.kind === 'milestone') return <>{item.text ?? ''}</>;
  if (item.kind === 'race' && item.race) {
    const { position, raceName, gradeBadge } = item.race;
    return (
      <>
        {position === null && '출주 — '}
        {gradeBadge !== null && (
          <>
            <GradeBadge grade={gradeBadge} />{' '}
          </>
        )}
        {raceName}
      </>
    );
  }
  return item.event ? <HorseEventText event={item.event} /> : null;
}

/**
 * 전적 행. 1줄: 날짜·착순·경주(등급 배지+이름)·상금, 2줄: 코스·거리·마장(보조).
 * 기수·중량·OR·착차·다시보기는 '자세히'를 눌러 바로 아래 행에 펼친다.
 */
function RecordRows({
  runs,
  unit,
  onReplay,
}: {
  runs: HorseRunRow[];
  unit: WeightUnit;
  onReplay: (key: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <tbody>
      {runs.map((r) => {
        const open = openKey === r.key;
        return (
          <Fragment key={r.key}>
            <tr className="record-row">
              <td className="record-col--date">{r.date}</td>
              <td className="record-col--pos">
                <PositionBadge position={r.position} fieldSize={r.fieldSize} />
              </td>
              <td className="record-col--race">
                <span className="record-race" title={r.name}>
                  {r.gradeBadge !== null && (
                    <>
                      <GradeBadge grade={r.gradeBadge} />{' '}
                    </>
                  )}
                  {r.name}
                </span>
                <small className="record-cond" title={r.goingTitle}>
                  {r.course} · {r.distance} · {r.going}
                </small>
              </td>
              <td className="record-col--prize">{r.prize}</td>
              <td className="record-col--more">
                <button
                  type="button"
                  className="btn record-more-btn"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open ? null : r.key)}
                >
                  {open ? '접기' : '자세히'}
                </button>
              </td>
            </tr>
            {open && (
              <tr className="record-detail">
                <td colSpan={5}>
                  <dl className="record-facts">
                    <div>
                      <dt>기수</dt>
                      <dd>{r.jockey}</dd>
                    </div>
                    <div>
                      <dt>중량</dt>
                      <dd>{formatWeight(r.weight, unit)}</dd>
                    </div>
                    <div>
                      <dt>OR</dt>
                      <dd>{r.rating}</dd>
                    </div>
                    <div>
                      <dt>착차</dt>
                      <dd>{r.margin}</dd>
                    </div>
                  </dl>
                  {r.replayKey && (
                    <button type="button" className="link-btn" onClick={() => onReplay(r.replayKey!)}>
                      다시보기
                    </button>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </tbody>
  );
}

function TimelineList({ items, className }: { items: TimelineItem[]; className: string }) {
  return (
    <ol className={className}>
      {items.map((item) => (
        <li key={item.key}>
          <time>{item.dateLabel}</time>
          <span className="horse-timeline__badge">
            <TimelineBadge item={item} />
          </span>
          <span className="horse-timeline__text">
            <TimelineText item={item} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function HorseDetail({
  game,
  horseId,
  initialTab = 'overview',
  onClose,
  onBreeding,
}: {
  game: GameApi;
  horseId: string;
  initialTab?: HorseTab;
  onClose: () => void;
  onBreeding: () => void;
}) {
  const [tab, setTab] = useState<HorseTab>(initialTab);
  const [trainerId, setTrainerId] = useState('');
  const [trainerOpen, setTrainerOpen] = useState(false);
  const notify = useNotify();
  const [injuryError, setInjuryError] = useState<InjuryError | null>(null);
  const [replay, setReplay] = useState<string | null>(null);
  const { openHorse } = useContext(HorseNavigation);
  const { unit } = useWeightUnit();
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = panel.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const state = game.state;
  const horse = state?.horses[horseId];
  if (!state || !horse) return null;
  const owned = horse.ownerId === state.playerOwnerId;
  const locked = state.economy.bankrupt || !owned;
  const tabs = horseTabs(horse);
  const activeTab = tabs.includes(tab) ? tab : 'overview';
  const assessment = assessForPlayer(state, horseId);
  const overview = overviewOf(assessment);
  const condition = conditionOf(horse);
  const pedigree = horsePedigree(state, horse);
  const owner = horse.ownerId ? state.owners[horse.ownerId] : undefined;
  const nameOf = (id: string) => pedigreeNameOf(state, id);
  const mare = state.mares[horseId];
  const stallion = state.stallions[horseId];
  const runs = horseRunRows(state, horseId);
  const recent = recentRuns(state, horseId, RECENT_RUN_COUNT);
  const timeline = horseTimeline(state, horseId, nameOf);
  const legacyBadges = horseLegacyBadges(state, horseId);
  const health = playerHorses(state).find((h) => h.id === horseId);
  const offspring = state.sireStats[horseId];
  const canChangeTrainer = owned && ['in_training', 'resting', 'yearling'].includes(horse.status);
  const trainerName = horse.trainerId ? (state.trainers[horse.trainerId]?.name ?? '—') : '미배정';
  return (
    <dialog
      ref={panel}
      className="horse-detail"
      aria-labelledby="horse-detail-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="horse-detail__head">
        <div className="horse-identity">
          {owner && <SilksSvg design={silksDesignOf(owner.silks, owner.id)} size={48} />}
          <div>
            <h2 id="horse-detail-title">{displayName(state, horse)}</h2>
            <p className="hint">
              {ageInYear(horse.birthYear, state.date.year)}세 · {sexKo(horse.sex, horse.gelded)} ·{' '}
              {coatColourKo(coatColour(horse.coat.genes))}
            </p>
          </div>
        </div>
        <button type="button" className="btn" onClick={onClose} aria-label="말 상세 닫기">
          닫기
        </button>
      </div>
      <p className="horse-detail__meta">
        <StatusBadge tone={horse.condition.injury ? 'danger' : 'good'} label={statusKo(horse.status)} />
        <span>
          조교사 {trainerName}
          {canChangeTrainer && (
            <>
              {' '}
              <button
                type="button"
                className="link-btn"
                aria-expanded={trainerOpen}
                onClick={() => setTrainerOpen((open) => !open)}
              >
                변경
              </button>
            </>
          )}
        </span>
        <span>
          <Term id="or">OR</Term> {orValueKo(horse.officialRating)}
        </span>
      </p>
      {canChangeTrainer && trainerOpen && (
        <section className="trainer-form" aria-label="조교사 변경">
          <label className="field">
            조교사
            <select value={trainerId} disabled={locked} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">조교사 선택</option>
              {trainerChoices(state, horseId).map((t) => (
                <option key={t.id} value={t.id} disabled={t.full}>
                  {t.name} ({t.load}/{t.capacity}두){t.full ? ' · 만원' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={locked || !trainerId}
              onClick={() => {
                const r = game.assignTrainer(horseId, trainerId);
                if (r.ok) {
                  setTrainerOpen(false);
                  notify('조교사를 바꿨습니다.');
                } else {
                  notify(assignTrainerErrorKo(r.error), 'error');
                }
              }}
            >
              조교사 맡기기
            </button>
            <button type="button" className="btn" onClick={() => setTrainerOpen(false)}>
              닫기
            </button>
          </div>
        </section>
      )}
      <nav className="tabs" aria-label="말 상세 탭">
        {tabs.map((t) => (
          <button
            type="button"
            key={t}
            className={`tab ${activeTab === t ? 'tab--active' : ''}`}
            aria-pressed={activeTab === t}
            onClick={() => {
              setTab(t);
              setReplay(null);
            }}
          >
            {HORSE_TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      <div className="horse-detail__body">
        {activeTab === 'overview' && (
          <>
            <section>
              <h3>능력·적성 해설</h3>
              <p className="overview-lead">
                종합 <GradeBadge grade={overview.grade} />
                {overview.lead !== null ? (
                  <span>— {overview.lead}</span>
                ) : (
                  <span className="hint">해설이 아직 없습니다.</span>
                )}
              </p>
              <ul className="fact-chips" aria-label="적성과 성장">
                <li>
                  <strong>적성 거리</strong> {overview.distanceKo}
                </li>
                <li>
                  <strong>성장형</strong> {overview.growthKo}
                </li>
              </ul>
              <ul className="grade-chips" aria-label="세부 등급">
                {overview.details.map((d) => (
                  <li key={d.key}>
                    <span>{d.label}</span>
                    <GradeBadge grade={d.grade} />
                  </li>
                ))}
              </ul>
              {overview.notes.length > 0 && (
                <ul className="overview-notes">
                  {overview.notes.map((n, i) => (
                    <li key={i} className={`comment comment--${n.tone}`}>
                      {n.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>컨디션·피로</h3>
              <p className="condition-line">
                <StatusBadge tone={condition.tone} label={condition.label} />
                <span>
                  컨디션 <strong>{condition.fitnessWord}</strong>
                </span>
                <span>
                  피로 <strong>{condition.fatigueWord}</strong>
                </span>
                <small>
                  준비도 {Math.round(condition.fitness)}% · 피로 {Math.round(condition.fatigue)}%
                </small>
              </p>
              <p className="hint">
                {condition.reasons.length > 0
                  ? condition.reasons.join(' · ')
                  : '컨디션과 피로 모두 출주 기준 안입니다.'}
              </p>
              {horse.condition.injury && (
                <InjuryBlock
                  injury={injuryViewOf(horse.condition.injury)}
                  error={injuryError}
                  onExam={() => {
                    if (locked) return;
                    const r = game.orderVetExam(horseId);
                    setInjuryError(r.ok ? null : r.error);
                  }}
                  onTreat={(t) => {
                    if (locked) return;
                    const r = game.chooseTreatment(horseId, t);
                    setInjuryError(r.ok ? null : r.error);
                  }}
                  locked={locked}
                />
              )}
              {health && health.historyKo.length > 0 && (
                <details>
                  <summary>병력</summary>
                  <ul>
                    {health.historyKo.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            {owned && horse.nameRegistered === false && (
              <HorseNamingPanel game={game} horse={horse} locked={locked} />
            )}
          </>
        )}
        {activeTab === 'plan' &&
          (owned ? (
            <RacePlanPanel horse={horse} game={game} locked={locked} />
          ) : (
            <p className="hint">내 말의 출주 계획만 검토할 수 있습니다.</p>
          ))}
        {activeTab === 'record' && (
          <section>
            <h3>전적</h3>
            <p className="record-summary">
              <strong>{formSummaryKo(recent)}</strong>
              <span>
                {' '}
                · 통산 {horse.record.starts}전 {horse.record.wins}승 · 누적 상금 {feeKo(horse.record.earnings)}
              </span>
            </p>
            {runs.length === 0 ? (
              <p className="empty-state">보관된 출주 기록이 없습니다.</p>
            ) : (
              <div className="table-scroll record-scroll">
                <table className="data-table record-table">
                  <thead>
                    <tr>
                      {['날짜', '착순', '경주', '상금'].map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                      <th aria-label="상세 펼치기" />
                    </tr>
                  </thead>
                  <RecordRows runs={runs} unit={unit} onReplay={setReplay} />
                </table>
              </div>
            )}
            {replay && <ReplayPanel key={replay} state={state} initialKey={replay} />}
          </section>
        )}
        {activeTab === 'pedigree' && (
          <section>
            <h3>혈통</h3>
            {legacyBadges.length > 0 && (
              <div className="legacy-badges">
                {legacyBadges.map((label) => (
                  <span className="status-chip status-chip--good" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            )}
            <PedigreeView root={pedigree.root} nameOf={nameOf} nick={pedigree.nick} />
          </section>
        )}
        {activeTab === 'events' && (
          <section>
            <h3>이 말의 기록</h3>
            {timeline.items.length === 0 && timeline.ops.length === 0 && (
              <p className="empty-state">아직 기록이 없습니다.</p>
            )}
            {timeline.items.length > 0 && (
              <div className="horse-timeline-scroll">
                <TimelineList items={timeline.items} className="legacy-timeline horse-timeline" />
              </div>
            )}
            {timeline.ops.length > 0 && (
              <details className="ops-log">
                <summary>운영 로그 {timeline.ops.length}건 (출주 신청·건너뜀·교배 예약)</summary>
                <div className="horse-timeline-scroll">
                  <TimelineList items={timeline.ops} className="horse-timeline horse-timeline--ops" />
                </div>
              </details>
            )}
          </section>
        )}
        {activeTab === 'breeding' && (
          <section>
            <h3>임신/교배</h3>
            <p>{mare ? mareBookingKo(mare, nameOf) : '교배 기록 없음'}</p>
            {owned && (
              <button type="button" className="btn" onClick={onBreeding}>
                번식 화면에서 배합하기
              </button>
            )}
          </section>
        )}
        {activeTab === 'foals' && (
          <section>
            <h3>산자 목록</h3>
            {!mare?.foals.length ? (
              <p className="empty-state">아직 산자가 없습니다.</p>
            ) : (
              <ul className="task-list">
                {mare.foals.map((id) => (
                  <li key={id}>
                    <HorseLink horseId={id} name={nameOf(id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {activeTab === 'book' && (
          <section>
            <h3>북</h3>
            <p>
              {stallion
                ? `${bookStatusOf(state, stallion).labelKo} · 종부료 ${feeKo(stallion.fee)} · ${fertilityKo(stallion)}`
                : '종마 기록 없음'}
            </p>
            <ul className="task-list">
              {Object.values(state.mares)
                .filter((m) => m.coveredBy === horseId || m.bookedFor?.stallionId === horseId)
                .map((m) => (
                  <li key={m.horseId}>
                    <HorseLink horseId={m.horseId} name={nameOf(m.horseId)} /> · {mareBookingKo(m, nameOf)}
                  </li>
                ))}
            </ul>
          </section>
        )}
        {activeTab === 'offspring' && (
          <section>
            <h3>자마 성적</h3>
            <p>
              {offspring
                ? `출주 자마 ${offspring.starters}두 · 승리 자마 ${offspring.winners}두 · ${offspring.wins}승 · 그룹 ${offspring.groupWins}승 · 상금 ${feeKo(offspring.earnings)}`
                : '아직 자마 성적이 없습니다.'}
            </p>
            <ul className="task-list">
              {Object.values(state.horses)
                .filter((h) => h.sireId === horseId && h.status !== 'historical')
                .map((h) => (
                  <li key={h.id}>
                    <button type="button" className="link-btn" onClick={() => openHorse(h.id)}>
                      {nameOf(h.id)}
                    </button>{' '}
                    · {h.record.starts}전 {h.record.wins}승
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </dialog>
  );
}
