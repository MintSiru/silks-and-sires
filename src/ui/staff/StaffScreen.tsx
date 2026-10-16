import { useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { RETAINER_MAX_PER_KIND, RETAINER_TERMINATION_PENALTY_RATE } from '../../engine/config/economy';
import { contractFor } from '../../engine/economy/contractQuery';
import type { RetainerKind } from '../../engine/economy/contracts';
import type { GameState } from '../../engine/types';
import {
  countryKo,
  feeKo,
  gradeColor,
  retainerRefusalKo,
  signConfirmKo,
  terminateConfirmKo,
} from '../game/text';
import type { GameApi } from '../game/useGame';
import { useWeightUnit } from '../game/WeightUnitContext';
import { formatWeight, type WeightUnit } from '../game/units';
import {
  jockeyProfile,
  reputationView,
  staffRows,
  trainerProfile,
  type CareerRecords,
  type GradeItem,
  type RelationView,
  type StaffRow,
  type StatLine,
} from './staffView';

/** 값이 없을 때 칸을 채우는 표기 */
const NO_VALUE = '—';
/** 종류 선택 순서와 표기 */
const KINDS: readonly RetainerKind[] = ['trainer', 'jockey'];
const KIND_LABEL: Record<RetainerKind, string> = { trainer: '조교사', jockey: '기수' };
/** 목록과 프로필을 나란히 놓는다. 좁은 화면에서는 줄이 바뀌어 프로필이 아래로 내려간다. */
const LAYOUT_STYLE: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' };
const LIST_STYLE: CSSProperties = { flex: '1 1 480px', minWidth: 0 };
const PROFILE_STYLE: CSSProperties = { flex: '1 1 320px', minWidth: 0 };
const GRADE_LIST_STYLE: CSSProperties = { listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' };

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

// ── 화면 진입점 ─────────────────────────────────────────────────

interface StaffScreenProps {
  game: GameApi;
}

/** 게임이 없으면 안내만, 있으면 인맥 화면을 보인다. */
export default function StaffScreen({ game }: StaffScreenProps): JSX.Element {
  if (game.state === null) {
    return (
      <section className="panel">
        <h2>인맥</h2>
        <p className="hint">먼저 '번식·배합' 탭에서 새 게임을 시작하세요.</p>
      </section>
    );
  }
  return <StaffView game={game} state={game.state} />;
}

function StaffView({ game, state }: { game: GameApi; state: GameState }): JSX.Element {
  const [kind, setKind] = useState<RetainerKind>('trainer');
  const [onlyKnown, setOnlyKnown] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 프로필 카드에 보일 사람(이름을 누르면 정한다). null 이면 카드를 보이지 않는다 */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { unit } = useWeightUnit();

  const reputation = reputationView(state);
  const rows = useMemo(() => staffRows(state, kind, { onlyKnown }), [state, kind, onlyKnown]);

  /** 전속 제의: 제의가 가능할 때만 누를 수 있고, 계약금을 확인한 뒤 체결한다 */
  const handleSign = (row: StaffRow): void => {
    if (!row.quote.ok) return;
    if (!window.confirm(signConfirmKo(row.quote.feeKo))) return;
    const result = game.signRetainer(kind, row.personId);
    if (result.ok) setNotice({ tone: 'ok', text: `${row.name} 전속 계약을 맺었습니다.` });
    else setNotice({ tone: 'error', text: retainerRefusalKo(result.error) });
  };

  /** 계약 해지: 위약금(연간 계약금 × 위약금 비율, 엔진과 같은 식)을 확인한 뒤 해지한다 */
  const handleTerminate = (row: StaffRow): void => {
    const contract = contractFor(state, kind, row.personId);
    if (contract === undefined) {
      setNotice({ tone: 'error', text: retainerRefusalKo('not_contracted') });
      return;
    }
    const penalty = Math.round(contract.annualFee * RETAINER_TERMINATION_PENALTY_RATE);
    if (!window.confirm(terminateConfirmKo(penalty))) return;
    const result = game.terminateRetainer(kind, row.personId);
    if (result.ok) setNotice({ tone: 'ok', text: `${row.name} 전속 계약을 해지했습니다.` });
    else setNotice({ tone: 'error', text: retainerRefusalKo(result.error) });
  };

  return (
    <section aria-label="인맥">
      <section className="panel">
        <h2>인맥</h2>
        <p className="hint">
          관계가 쌓인 조교사·기수에게 전속을 제의합니다. 전속 자리는 종류마다 {RETAINER_MAX_PER_KIND}명뿐이며, 해지하면 위약금이 나갑니다.
        </p>
        <p>
          명성 <strong>{reputation.reputation.toFixed(1)}</strong> · {reputation.labelKo}
        </p>
      </section>

      <div style={LAYOUT_STYLE}>
        <section className="panel" style={LIST_STYLE}>
          <div className="sales-filter">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={k === kind ? 'tab tab--active' : 'tab'}
                aria-pressed={k === kind}
                onClick={() => {
                  setKind(k);
                  setNotice(null);
                  setSelectedId(null);
                }}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            <label>
              <input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} /> 아는 사람만
            </label>
          </div>
          <NoticeLine notice={notice} />

          {rows.length === 0 ? (
            <p className="hint">
              {onlyKnown
                ? `아직 관계가 쌓인 ${KIND_LABEL[kind]}가 없습니다. '아는 사람만'을 끄면 전체 목록을 봅니다.`
                : `${KIND_LABEL[kind]} 목록이 비어 있습니다.`}
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>나라</th>
                    <th>나이</th>
                    <th>관계</th>
                    <th>전속 상태</th>
                    <th>제의 조건</th>
                    <th>행동</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const contracted = row.contractKo !== null;
                    return (
                      <tr key={row.personId} className={contracted ? 'is-selected' : undefined}>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            aria-current={row.personId === selectedId ? 'true' : undefined}
                            onClick={() => setSelectedId(row.personId)}
                          >
                            {row.name}
                          </button>
                        </td>
                        <td>{countryKo(row.country)}</td>
                        <td>{row.age}세</td>
                        <td>
                          {row.relation.toFixed(1)} · {row.tierKo}
                        </td>
                        <td>{row.contractKo ?? NO_VALUE}</td>
                        <td>
                          {contracted
                            ? NO_VALUE
                            : row.quote.ok
                              ? `계약금 ${row.quote.feeKo}`
                              : row.quote.reasonKo}
                        </td>
                        <td>
                          {contracted ? (
                            <button type="button" className="btn" onClick={() => handleTerminate(row)}>
                              계약 해지
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              disabled={!row.quote.ok}
                              onClick={() => handleSign(row)}
                            >
                              전속 제의
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedId !== null && (
          <div style={PROFILE_STYLE}>
            <ProfileCard state={state} kind={kind} personId={selectedId} unit={unit} />
          </div>
        )}
      </div>
    </section>
  );
}

// ── 프로필 카드 ─────────────────────────────────────────────────

interface ProfileCardProps {
  state: GameState;
  kind: RetainerKind;
  personId: string;
  unit: WeightUnit;
}

/** 기수 또는 조교사 프로필. 원래 능력 수치는 나오지 않고 S~E 등급과 성적 숫자만 나온다. */
function ProfileCard({ state, kind, personId, unit }: ProfileCardProps): JSX.Element | null {
  if (kind === 'jockey') {
    const p = jockeyProfile(state, personId);
    if (p === null) return null;
    return (
      <section className="panel" aria-label="기수 프로필">
        <h2>{p.name}</h2>
        <p className="hint">
          {countryKo(p.country)} · {p.age}세 ·{' '}
          {p.apprentice ? `견습 (감량 ${formatWeight(p.apprenticeAllowanceLb, unit)})` : '정식 기수'}
        </p>
        <p>
          최저 기승 체중 {formatWeight(p.minRidingWeightLb, unit)} · 잘 맞는 작전 {p.preferredStyleKo}
        </p>
        <GradeList items={p.grades} />
        <RecordsTable records={p.records} />
        <RelationLines relation={p.relation} />
      </section>
    );
  }

  const p = trainerProfile(state, personId);
  if (p === null) return null;
  return (
    <section className="panel" aria-label="조교사 프로필">
      <h2>{p.name}</h2>
      <p className="hint">
        {countryKo(p.country)} · {p.age}세 · 지역 {p.region} · 야드 {p.yardName}
      </p>
      <p>
        수용 {p.capacity}두 · 내 말 위탁 {p.ownedHorseCount}두
      </p>
      <p>
        성향 {p.styleKo} · {p.staminaKo} · {p.juvenileKo}
      </p>
      <GradeList items={p.grades} />
      <RecordsTable records={p.records} />
      <RelationLines relation={p.relation} />
    </section>
  );
}

function GradeList({ items }: { items: readonly GradeItem[] }): JSX.Element {
  return (
    <ul style={GRADE_LIST_STYLE} aria-label="등급">
      {items.map((item) => (
        <li key={item.labelKo}>
          {item.labelKo}{' '}
          <span className="grade-badge" style={{ backgroundColor: gradeColor(item.grade) }}>
            {item.grade}
          </span>
        </li>
      ))}
    </ul>
  );
}

const RECORD_ROWS: readonly { key: keyof CareerRecords; labelKo: string }[] = [
  { key: 'thisYear', labelKo: '올해' },
  { key: 'career', labelKo: '통산' },
  { key: 'total', labelKo: '합계' },
];

/** 성적 숫자 표. 승률·입상률은 소수 1자리 %, 출주가 없으면 '—' */
function RecordsTable({ records }: { records: CareerRecords }): JSX.Element {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>구분</th>
            <th>출주</th>
            <th>승</th>
            <th>승률</th>
            <th>입상률</th>
            <th>그룹 승</th>
            <th>G1 승</th>
            <th>상금</th>
          </tr>
        </thead>
        <tbody>
          {RECORD_ROWS.map(({ key, labelKo }) => (
            <RecordRow key={key} labelKo={labelKo} line={records[key]} />
          ))}
        </tbody>
      </table>
      <p className="hint">올해 G1 승은 연말에 통산에 더해지므로 올해 칸은 '—' 입니다.</p>
    </div>
  );
}

function RecordRow({ labelKo, line }: { labelKo: string; line: StatLine }): JSX.Element {
  return (
    <tr>
      <td>{labelKo}</td>
      <td>{line.runners}</td>
      <td>{line.wins}</td>
      <td>{line.winRatePct === null ? NO_VALUE : `${line.winRatePct.toFixed(1)}%`}</td>
      <td>{line.placeRatePct === null ? NO_VALUE : `${line.placeRatePct.toFixed(1)}%`}</td>
      <td>{line.groupWins}</td>
      <td>{line.g1Wins === null ? NO_VALUE : line.g1Wins}</td>
      <td>{feeKo(line.earnings)}</td>
    </tr>
  );
}

function RelationLines({ relation }: { relation: RelationView }): JSX.Element {
  return (
    <div>
      <p>
        관계 {relation.relation.toFixed(1)} · {relation.tierKo}
      </p>
      <p>전속 상태 {relation.contractKo ?? NO_VALUE}</p>
      <p>
        제의 조건{' '}
        {relation.quote.ok ? `계약금 ${relation.quote.feeKo}` : relation.quote.reasonKo}
      </p>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice | null }): JSX.Element | null {
  if (notice === null) return null;
  return (
    <p className={`notice notice--${notice.tone}`} role="status">
      {notice.text}
    </p>
  );
}
