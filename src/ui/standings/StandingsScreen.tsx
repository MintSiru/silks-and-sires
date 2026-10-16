import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { getSeriesDefinitions } from '../../engine/data/staticData';
import type { GameState, LeadingCategory } from '../../engine/types';
import { feeKo, leadingCategoryKo, laurelCategoryKo } from '../game/text';
import type { GameApi } from '../game/useGame';
import {
  awardYears,
  awardsView,
  leadingScopeKo,
  leadingScopes,
  leadingView,
  seriesView,
  sireTable,
  type LeadingScope,
  type RatedRowView,
} from './standingsView';

type SectionId = 'series' | 'leading' | 'awards' | 'sires';

const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'series', label: '시리즈' },
  { id: 'leading', label: '리딩' },
  { id: 'awards', label: '지난 시상' },
  { id: 'sires', label: '산구 성적' },
];

const LEADING_CATEGORIES: readonly LeadingCategory[] = ['sire', 'damsire', 'jockey', 'trainer', 'owner', 'breeder'];

const EMPTY_TEXT = '아직 기록이 없습니다.';

// ── 화면 진입점 ─────────────────────────────────────────────────

interface StandingsScreenProps {
  game: GameApi;
}

/** 게임이 없으면 안내만, 있으면 순위·시상 탭을 보인다. */
export default function StandingsScreen({ game }: StandingsScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>순위·시상</h2>
        <p className="hint">먼저 '번식·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <StandingsView state={game.state} />;
}

// ── 하위 탭 ─────────────────────────────────────────────────────

function StandingsView({ state }: { state: GameState }): JSX.Element {
  const [section, setSection] = useState<SectionId>('series');
  return (
    <section aria-label="순위·시상">
      <nav className="tabs" aria-label="순위·시상 구역 선택">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === section ? 'tab tab--active' : 'tab'}
            aria-pressed={s.id === section}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {section === 'series' && <SeriesSection state={state} />}
      {section === 'leading' && <LeadingSection state={state} />}
      {section === 'awards' && <AwardsSection state={state} />}
      {section === 'sires' && <SireSection state={state} />}
    </section>
  );
}

// ── 시리즈 ──────────────────────────────────────────────────────

function SeriesSection({ state }: { state: GameState }): JSX.Element {
  const defs = useMemo(() => getSeriesDefinitions(), []);
  const cards = useMemo(() => seriesView(state, defs), [state, defs]);
  return (
    <section className="panel">
      <h2>올해 시리즈 ({state.seasonState.year}년)</h2>
      <p className="hint">크라운 시리즈는 레그 우승으로, 포인트 시리즈는 누적 포인트로 겨룹니다.</p>
      {cards.map((card) => (
        <div key={card.seriesId} className="standings-series">
          <h3>
            {card.name} · {card.kindLabel}
          </h3>
          <p className="hint">
            {card.championName === null
              ? card.kind === 'crown'
                ? '아직 달성마가 없습니다.'
                : '시즌이 끝나면 1위가 정해집니다.'
              : `${card.kind === 'crown' ? '달성마' : '1위'}: ${card.championName}`}
            {' · '}보너스 {feeKo(card.bonus)}
          </p>
          {card.kind === 'crown' ? (
            <table>
              <thead>
                <tr>
                  <th>레그</th>
                  <th>우승마</th>
                </tr>
              </thead>
              <tbody>
                {card.legs.map((leg) => (
                  <tr key={leg.raceId}>
                    <td>{leg.raceName}</td>
                    <td>{leg.winnerName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : card.topPoints.length === 0 ? (
            <p className="hint">{EMPTY_TEXT}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>말</th>
                  <th>포인트</th>
                </tr>
              </thead>
              <tbody>
                {card.topPoints.map((row) => (
                  <tr key={row.horseId}>
                    <td>{row.rank}</td>
                    <td>{row.name}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}

// ── 리딩 ────────────────────────────────────────────────────────

function LeadingSection({ state }: { state: GameState }): JSX.Element {
  const [category, setCategory] = useState<LeadingCategory>('sire');
  const [scopePick, setScopePick] = useState<LeadingScope>('EU');
  const scopes = useMemo(() => leadingScopes(state), [state]);
  // 나라 기록이 사라졌으면 유럽 합산으로 돌아간다
  const scope: LeadingScope = scopes.includes(scopePick) ? scopePick : 'EU';
  const rows = useMemo(() => leadingView(state, category, scope), [state, category, scope]);

  return (
    <section className="panel">
      <h2>리딩 ({state.seasonState.year}년)</h2>
      <div className="field">
        <label>
          부문{' '}
          <select value={category} onChange={(e) => setCategory(e.target.value as LeadingCategory)}>
            {LEADING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {leadingCategoryKo(c)}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          범위{' '}
          <select value={scope} onChange={(e) => setScopePick(e.target.value as LeadingScope)}>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {leadingScopeKo(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="hint">{EMPTY_TEXT}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>순위</th>
              <th>이름</th>
              <th>출주</th>
              <th>승</th>
              <th>입상</th>
              <th>그룹 승</th>
              <th>상금</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.runners}</td>
                <td>{row.wins}</td>
                <td>{row.places}</td>
                <td>{row.groupWins}</td>
                <td>{feeKo(row.earnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── 지난 시상 ───────────────────────────────────────────────────

function AwardsSection({ state }: { state: GameState }): JSX.Element {
  const years = useMemo(() => awardYears(state), [state]);
  const [yearPick, setYearPick] = useState<number | null>(null);
  // 고른 해가 없으면 가장 최근 해를 보인다
  const year = yearPick !== null && years.includes(yearPick) ? yearPick : (years[0] ?? null);
  const view = useMemo(() => (year === null ? null : awardsView(state, year)), [state, year]);

  if (view === null) {
    return (
      <section className="panel">
        <h2>지난 시상</h2>
        <p className="hint">아직 발표된 시상이 없습니다. 연도가 바뀌면 지난해 시상이 발표됩니다.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{view.year}년 시상·순위</h2>
      <div className="field">
        <label>
          연도{' '}
          <select value={view.year} onChange={(e) => setYearPick(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3>라우렐 레이싱 어워즈 (부문 수상)</h3>
      <table>
        <thead>
          <tr>
            <th>부문</th>
            <th>수상마</th>
          </tr>
        </thead>
        <tbody>
          {view.laurel.map((row) => (
            <tr key={row.category}>
              <td>{laurelCategoryKo(row.category)}</td>
              <td>{row.horseName}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>더 레이싱 레저 (연간 레이팅 상위)</h3>
      <RatedTable rows={view.ledger} emptyText={EMPTY_TEXT} />

      <h3>글로벌 터프 랭킹 (시즌 최고 퍼포먼스 상위)</h3>
      <RatedTable rows={view.globalRankings} emptyText={EMPTY_TEXT} />

      <h3>최우수 레이스</h3>
      {view.bestRace === null ? (
        <p className="hint">{EMPTY_TEXT}</p>
      ) : (
        <p>
          {view.bestRace.name} · {view.bestRace.dateLabel} · {view.bestRace.countryLabel} · {view.bestRace.grade} ·
          레이팅 {view.bestRace.rating}
        </p>
      )}

      <h3>시리즈 챔피언</h3>
      {view.seriesChampions.length === 0 ? (
        <p className="hint">{EMPTY_TEXT}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>시리즈</th>
              <th>챔피언</th>
            </tr>
          </thead>
          <tbody>
            {view.seriesChampions.map((row) => (
              <tr key={row.seriesId}>
                <td>{row.name}</td>
                <td>{row.horseName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RatedTable({
  rows,
  emptyText,
}: {
  rows: readonly RatedRowView[];
  emptyText: string;
}): JSX.Element {
  if (rows.length === 0) return <p className="hint">{emptyText}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>순위</th>
          <th>말</th>
          <th>레이팅</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.horseId}>
            <td>{row.rank}</td>
            <td>{row.name}</td>
            <td>{row.rating}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 산구 성적 ───────────────────────────────────────────────────

function SireSection({ state }: { state: GameState }): JSX.Element {
  const table = useMemo(() => sireTable(state), [state]);
  return (
    <section className="panel">
      <h2>산구 성적 (자마 누적)</h2>
      <p className="hint">
        자마 {table.totals.sires}두 기준 · 출주 {table.totals.starters} · 승 {table.totals.wins} · 그룹 승{' '}
        {table.totals.groupWins}
      </p>
      {table.rows.length === 0 ? (
        <p className="hint">아직 자마가 출주하지 않았습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>순위</th>
              <th>종마</th>
              <th>출주 자마</th>
              <th>승 자마</th>
              <th>승</th>
              <th>그룹 승</th>
              <th>상금</th>
              <th>거리 적성</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.sireId}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td>{row.starters}</td>
                <td>{row.winners}</td>
                <td>{row.wins}</td>
                <td>{row.groupWins}</td>
                <td>{feeKo(row.earnings)}</td>
                <td>{row.profileLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
