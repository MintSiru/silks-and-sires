import { useContext, useState } from 'react';
import { getRaceTemplates } from '../../engine/data/staticData';
import { displayName } from '../../engine/naming/register';
import type { GameState } from '../../engine/types';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import {
  chronicleYearGroups, establishedLineRows, familyConditionText, femaleFamilyRows,
  goalCards, hallOfFameRows, lineConditionText, MAJOR_ROW_COUNT, rivalRows,
  type ChronicleFilter, type ChronicleRow, type ChronicleYearGroup,
} from './legacyView';
import { RivalIdentity } from './RivalCard';
import './legacy.css';

const TABS = [
  ['chronicle', '연대기'], ['goals', '왕조 목표'], ['lines', '부계·모계'],
  ['hall', '명예의 전당'], ['rivals', '라이벌'],
] as const;
type Tab = (typeof TABS)[number][0];

/** 탭마다 무엇을 보는 곳인지 한 줄(I3) */
const TAB_PURPOSE: Record<Tab, string> = {
  chronicle: '가문의 주요 순간을 연도별로 모아 봅니다.',
  goals: '12개 왕조 목표의 달성 여부와 진행률을 봅니다.',
  lines: '이어지는 혈통과 후계마를 봅니다. 새로 확립된 부계와 명문 모계가 여기에 남습니다.',
  hall: '내 소유·생산마의 G1 우승과 Laurel 수상을 모은 곳입니다.',
  rivals: '나와 맞붙는 마주와 맞대결 기록을 봅니다.',
};

/** 기록 범위별 빈 상태 안내(I3) */
const EMPTY_CHRONICLE: Record<ChronicleFilter, string> = {
  mine: '아직 내 기록이 없습니다. 첫 출주와 첫 승이 여기에 쌓입니다.',
  world: '아직 세계 기록이 없습니다.',
  all: '아직 기록이 없습니다. 경주와 생산의 발자취가 여기에 쌓입니다.',
};

/** 연대기 줄 목록. showSource 는 '전체' 범위에서만 내 기록·세계 구분을 보인다(I2) */
export function ChronicleList({ rows, showSource = true }: { rows: ChronicleRow[]; showSource?: boolean }) {
  const { state, openHorse } = useContext(HorseNavigation);
  return <ol className="legacy-timeline">
    {rows.map((row) => <li key={row.id} className="legacy-row">
      <time>{row.dateLabel}</time>
      <span className={`legacy-tag legacy-tag--${row.tag.tone}`}>{row.tag.label}</span>
      {row.horseId && state?.horses[row.horseId]
        ? <button type="button" className="link-btn horse-link" onClick={() => openHorse(row.horseId!, 'events')}>{row.body}</button>
        : <span>{row.body}</span>}
      {showSource && <span className="hint legacy-source">{row.player ? '내 기록' : '세계'}</span>}
    </li>)}
  </ol>;
}

/**
 * 연도 묶음: 기본은 주요 순간만, '전체 N건 보기'로 펼친다(I2). 펼친 뒤에는 머리줄 오른쪽 '주요 N건만 보기'로 다시 접는다.
 * 첫 묶음만 처음부터 펼쳐 둔다. 머리줄 버튼은 details 가 접히지 않도록 기본 동작을 막는다.
 */
function ChronicleYear({ group, first, showSource }: { group: ChronicleYearGroup; first: boolean; showSource: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = group.rows.length > group.majorRows.length;
  return <details open={first ? true : undefined}>
    <summary>{group.year}년 · {group.rows.length}건
      {expanded && <button type="button" className="link-btn legacy-collapse" onClick={(event) => {
        event.preventDefault();
        setExpanded(false);
      }}>{`주요 ${MAJOR_ROW_COUNT}건만 보기`}</button>}
    </summary>
    <ChronicleList rows={expanded ? group.rows : group.majorRows} showSource={showSource} />
    {hasMore && !expanded && <button type="button" className="link-btn legacy-more"
      onClick={() => setExpanded(true)}>{`전체 ${group.rows.length}건 보기`}</button>}
  </details>;
}

export default function LegacyScreen({ state, initialTab = 'chronicle' }: { state: GameState; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState<ChronicleFilter>('mine');
  const nameOf = (id: string) => state.horses[id] ? displayName(state, state.horses[id]!) : id;
  const groups = tab === 'chronicle' ? chronicleYearGroups(state, filter, nameOf, (id) => state.owners[id]?.name ?? id) : [];
  const goals = tab === 'goals' ? goalCards(state, { templates: getRaceTemplates() }) : [];
  const lines = tab === 'lines' ? establishedLineRows(state) : [];
  const families = tab === 'lines' ? femaleFamilyRows(state) : [];
  const hall = tab === 'hall' ? hallOfFameRows(state, nameOf) : [];
  const rivals = tab === 'rivals' ? rivalRows(state) : [];
  return <>
    <h2>기록</h2>
    <nav className="tabs" aria-label="기록 구분">
      {TABS.map(([id, label]) => <button type="button" key={id}
        className={`tab ${tab === id ? 'tab--active' : ''}`} aria-pressed={tab === id}
        onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    <p className="hint legacy-purpose">{TAB_PURPOSE[tab]}</p>
    {tab === 'chronicle' && <section className="panel">
      <div className="legacy-toolbar">
        <label className="legacy-filter">기록 범위{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value as ChronicleFilter)}>
            <option value="mine">내 기록</option><option value="world">세계</option><option value="all">전체</option>
          </select>
        </label>
        <span className="legacy-sort">최신순</span>
      </div>
      <div className="legacy-scroll" key={filter} tabIndex={0} role="region" aria-label="연대기 목록">
        {groups.length === 0 && <p className="empty-state">{EMPTY_CHRONICLE[filter]}</p>}
        {groups.map((group, index) => <ChronicleYear key={group.year} group={group} first={index === 0}
          showSource={filter === 'all'} />)}
      </div>
    </section>}
    {tab === 'goals' && <div className="legacy-scroll" tabIndex={0} role="region" aria-label="왕조 목표 목록">
      {goals.every((card) => !card.done) && <p className="empty-state">아직 달성한 목표가 없습니다. 첫 출주와 첫 승부터 노려 보세요.</p>}
      <div className="legacy-goals">
        {goals.map((card) => <section className="panel" key={card.id}>
          <h3>{card.title}</h3>
          {card.done ? <p className="status-good">달성{card.doneYear === null ? '' : ` · ${card.doneYear}년`}</p>
            : <><p>{card.progressLabel}</p><progress aria-label={`${card.title} 진행`} max={1} value={card.ratio} /></>}
        </section>)}
      </div>
    </div>}
    {tab === 'lines' && <div className="legacy-scroll" tabIndex={0} role="region" aria-label="부계·모계 목록">
      <section className="panel">
        <h3>확립 부계</h3>
        {lines.length === 0 ? <p className="hint">{lineConditionText()}</p>
          : <div className="table-scroll"><table className="data-table">
            <thead><tr>{['시조·계통', '분지', '확립', '아들 종마', '그룹 우승마', '생산'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{lines.map((row) => <tr key={row.id}>
              <td><HorseLink horseId={state.legacy?.lines.find((line) => line.id === row.id)?.founderId} name={row.founderName} /><div className="hint">{row.label}</div></td>
              <td>{row.parentLabel}에서 분지</td><td>{row.establishedYear}년</td><td>{row.sons}두</td>
              <td>{row.groupWinners}두</td><td>{row.playerBred ? '내 생산' : '세계'}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <section className="panel">
        <h3>명문 모계</h3>
        {families.length === 0 ? <p className="hint">{familyConditionText()}</p>
          : <div className="table-scroll"><table className="data-table">
            <thead><tr><th>기초 암말</th><th>인정</th><th>블랙타입 우승마</th><th>생산</th></tr></thead>
            <tbody>{families.map((row) => <tr key={row.founderMareId}>
              <td><HorseLink horseId={row.founderMareId} name={row.name} /></td><td>{row.establishedYear}년</td>
              <td>{row.blackTypeWinners}두</td><td>{row.playerBred ? '내 생산' : '세계'}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </div>}
    {tab === 'hall' && <section className="panel legacy-scroll" tabIndex={0} role="region" aria-label="명예의 전당 목록">
      {hall.length === 0 ? <p className="empty-state">내 소유·생산마의 G1 우승과 Laurel 수상이 이곳에 남습니다.</p>
        : <div className="table-scroll"><table className="data-table">
          <thead><tr><th>말</th><th>첫 기록</th><th>G1 우승</th><th>클래식 우승</th><th>Laurel 수상</th></tr></thead>
          <tbody>{hall.map((row) => <tr key={row.horseId}>
            <td><HorseLink horseId={row.horseId} name={row.name} /></td><td>{row.firstYear}년</td>
            <td>{row.g1Wins}승</td><td>{row.classicWins}승</td><td>{row.awards.join(' · ') || '—'}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>}
    {tab === 'rivals' && <div className="legacy-scroll" tabIndex={0} role="region" aria-label="라이벌 목록">
      {[true, false].map((active) => <section className="panel" key={String(active)}>
        <h3>{active ? '활성 라이벌' : '지난 라이벌'}</h3>
        {rivals.filter((row) => row.active === active).length === 0 && <p className="hint">{active ? '아직 지정된 라이벌이 없습니다.' : '지난 라이벌이 없습니다.'}</p>}
        {rivals.filter((row) => row.active === active).map((row) => <article className="legacy-rival" key={row.ownerId}>
          <RivalIdentity state={state} row={row} />
          <p className="hint">{row.countryLabel} · {row.since}년부터 · {row.reasonLabel}</p>
          <label>경쟁심 {row.intensity} <meter min={0} max={1} value={row.intensityRatio} /></label>
          <p>{row.recentClash ?? '아직 맞대결이 없습니다.'}</p>
        </article>)}
      </section>)}
    </div>}
  </>;
}
