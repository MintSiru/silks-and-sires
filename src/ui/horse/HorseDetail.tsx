import { useContext, useEffect, useRef, useState } from 'react';
import { coatColour } from '../../engine/horse/coat';
import type { InjuryError } from '../../engine/horse/injury';
import { assessForPlayer } from '../../engine/horse/playerView';
import { displayName } from '../../engine/naming/register';
import { silksDesignOf } from '../../engine/people/silks';
import { ageInYear } from '../../engine/time/calendar';
import HorseNamingPanel from '../breeding/HorseNamingPanel';
import PedigreeView from '../breeding/PedigreeView';
import { bookStatusOf, fertilityKo, mareBookingKo } from '../breeding/bookView';
import { useWeightUnit } from '../game/WeightUnitContext';
import {
  assignTrainerErrorKo,
  coatColourKo,
  commentText,
  conformationLabelKo,
  distanceHintKo,
  feeKo,
  growthKo,
  sexKo,
  statusKo,
  type ConformationKey,
} from '../game/text';
import { formatWeight } from '../game/units';
import type { GameApi } from '../game/useGame';
import ReplayPanel from '../season/ReplayPanel';
import { injuryViewOf, playerHorses, trainerChoices } from '../season/seasonView';
import SilksSvg from '../silks/SilksSvg';
import HorseEventText from './HorseEventText';
import HorseLink, { HorseNavigation, type HorseTab } from './HorseLink';
import InjuryBlock from './InjuryBlock';
import RacePlanPanel from './RacePlanPanel';
import { HORSE_TAB_LABELS, horseEvents, horsePedigree, horseRunRows, horseTabs } from './horseDetailView';

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
  const [notice, setNotice] = useState<string | null>(null);
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
  const pedigree = horsePedigree(state, horse);
  const owner = horse.ownerId ? state.owners[horse.ownerId] : undefined;
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  const mare = state.mares[horseId];
  const stallion = state.stallions[horseId];
  const runs = horseRunRows(state, horseId);
  const events = horseEvents(state, horseId);
  const health = playerHorses(state).find((h) => h.id === horseId);
  const offspring = state.sireStats[horseId];
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
        <span className={`status-chip status-chip--${horse.condition.injury ? 'danger' : 'good'}`}>
          {statusKo(horse.status)}
        </span>
        <span>조교사 {horse.trainerId ? (state.trainers[horse.trainerId]?.name ?? '—') : '미배정'}</span>
        <span>OR {horse.officialRating ?? '미부여'}</span>
      </p>
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
              <ul className="ability-chips">
                {(
                  ['overall', 'frame', 'hindquarters', 'legs', 'action', 'temperament'] as ConformationKey[]
                ).map((k) => (
                  <li key={k}>
                    {conformationLabelKo(k)} <span className="grade-badge">{assessment.conformation[k]}</span>
                  </li>
                ))}
              </ul>
              <ul className="comments">
                {assessment.comments.map((c, i) => (
                  <li className={`comment comment--${c.tone}`} key={i}>
                    {commentText(c, `${assessment.horseId}|${assessment.year}|${assessment.week}|${c.key}`)}
                  </li>
                ))}
              </ul>
              <p>
                거리 힌트 {distanceHintKo(assessment.distanceHint)} · 성장 {growthKo(assessment.growthHint)}
              </p>
            </section>
            <section>
              <h3>컨디션·피로</h3>
              <div className="condition-grid">
                <label>
                  컨디션 <meter min="0" max="100" value={horse.condition.fitness} />{' '}
                  {Math.round(horse.condition.fitness)}%
                </label>
                <label>
                  피로 <meter min="0" max="100" value={horse.condition.fatigue} />{' '}
                  {Math.round(horse.condition.fatigue)}%
                </label>
              </div>
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
            {owned && ['in_training', 'resting', 'yearling'].includes(horse.status) && (
              <section>
                <h3>조교사 바꾸기</h3>
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
                <button
                  type="button"
                  className="btn"
                  disabled={locked || !trainerId}
                  onClick={() => {
                    const r = game.assignTrainer(horseId, trainerId);
                    setNotice(r.ok ? '조교사를 바꿨습니다.' : assignTrainerErrorKo(r.error));
                  }}
                >
                  조교사 맡기기
                </button>
                {notice && <p role="status">{notice}</p>}
              </section>
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
            <p>
              {horse.record.starts}전 {horse.record.wins}승 · 누적 상금 {feeKo(horse.record.earnings)}
            </p>
            {runs.length === 0 ? (
              <p className="empty-state">보관된 출주 기록이 없습니다.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        '날짜',
                        '경마장',
                        '레이스',
                        '등급',
                        '거리',
                        '마장',
                        '착순/두수',
                        '착차',
                        '기수',
                        '부담중량',
                        'OR 전후',
                        '상금',
                        '결과',
                      ].map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.key}>
                        <td>{r.date}</td>
                        <td>{r.course}</td>
                        <td>{r.name}</td>
                        <td>{r.grade}</td>
                        <td>{r.distance}</td>
                        <td>{r.going}</td>
                        <td>{r.placing}</td>
                        <td>{r.margin}</td>
                        <td>{r.jockey}</td>
                        <td>{formatWeight(r.weight, unit)}</td>
                        <td>{r.rating}</td>
                        <td>{r.prize}</td>
                        <td>
                          {r.replayKey && (
                            <button type="button" className="link-btn" onClick={() => setReplay(r.replayKey)}>
                              다시보기
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {replay && <ReplayPanel key={replay} state={state} initialKey={replay} />}
          </section>
        )}
        {activeTab === 'pedigree' && (
          <section>
            <h3>5대 혈통</h3>
            <p>{pedigree.summary}</p>
            <PedigreeView root={pedigree.root} nameOf={nameOf} />
          </section>
        )}
        {activeTab === 'events' && (
          <section>
            <h3>이 말의 기록</h3>
            {events.length === 0 && <p className="empty-state">아직 기록이 없습니다.</p>}
            <ol className="event-list">
              {events.map((e, i) => (
                <li key={i}>
                  <HorseEventText event={e} />
                </li>
              ))}
            </ol>
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
