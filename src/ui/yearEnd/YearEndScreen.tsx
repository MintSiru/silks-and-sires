import HorseLink from '../horse/HorseLink';
import { DUAL_FEE_RATIO, NH_FEE_RATIO } from '../../engine/config/nh';
import { horseProfile } from '../../engine/stud/nh';
import { estimateStudFee } from '../../engine/stud/value';
import { feeKo, studRoleKo } from '../game/text';
import { displayName } from '../../engine/naming/register';
import { useState } from 'react';
import type { GameApi } from '../game/useGame';
import { NOMINATION_MAX_PER_SEASON } from '../../engine/config/stud';
import type { StudRole, YearEndChoice, YearEndHorseDecision } from '../../engine/types';
import { defaultSubmission, salePriceWithNominationsKo, yearEndErrorKo, yearEndView } from './yearEndView';
import YearReview from './YearReview';
import { yearReviewView } from './yearReviewView';

/** 국내 판매 때 고를 수 있는 교배권 수(0~엔진 상한) */
const NOMINATION_CHOICES: readonly number[] = Array.from({ length: NOMINATION_MAX_PER_SEASON + 1 }, (_, i) => i);

/** 진로를 바꾼다. 국내 판매가 아니면 교배권 수를 지워 0 초과가 제출에 남지 않게 한다. */
function withChoice(decision: YearEndHorseDecision, choice: YearEndChoice): YearEndHorseDecision {
  const next: YearEndHorseDecision = { ...decision, choice };
  if (choice !== 'stud') delete next.studRole;
  if (choice !== 'sell_domestic') delete next.nominations;
  return next;
}

export default function YearEndScreen({ game }: { game: GameApi }) {
  const state = game.state!;
  const view = yearEndView(state);
  const review = yearReviewView(state);
  const [submission, setSubmission] = useState(() => defaultSubmission(state));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const result = game.submitYearEnd(submission);
    if (!result.ok) {
      const name = result.horseId === undefined ? undefined : (state.horses[result.horseId] === undefined ? undefined : displayName(state, state.horses[result.horseId]!));
      setError(`${name === undefined ? '' : `${name}: `}${yearEndErrorKo(result.error)}`);
      setConfirming(false);
    }
  }

  return <section className="panel" aria-label="연말 정산">
    {/* view.year 는 맞이하는 새해. 정산은 끝난 해 기준으로 표시 */}
    <h2>{view.year - 1}년 연말 정산</h2>
    <YearReview view={review} />
    <p>모든 현역마의 진로와 전속 계약 갱신을 정해야 새해로 진행합니다.</p>
    <h3>현역마 진로</h3>
    <p>{view.freeSlotsKo}</p>
    {view.horses.length === 0 ? <p>현역마가 없습니다</p> : <table>
      <thead><tr>{['이름', '성별', '새해 나이', '통산 성적', '진로 선택'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{view.horses.map((horse) => {
        const decision = submission.horses.find((h) => h.horseId === horse.horseId)!;
        const nominations = decision.nominations ?? 0;
        return <tr key={horse.horseId}>
          <td><HorseLink horseId={horse.horseId} name={horse.name} /></td><td>{horse.sexKo}</td><td>{horse.newAge}세</td><td>{horse.careerKo}</td>
          <td>
            <select aria-label={`${horse.name} 진로`} disabled={confirming}
              value={decision.choice}
              onChange={(event) => {
                const choice = horse.options.find((option) => option.choice === event.target.value)!.choice;
                setSubmission((current) => ({ ...current, horses: current.horses.map((h) => h.horseId === horse.horseId ? withChoice(h, choice) : h) }));
              }}>
              {horse.options.map((option) => <option key={option.choice} value={option.choice}>{option.labelKo}</option>)}
            </select>
            {decision.choice === 'stud' && <div>
              <label>종마 역할{' '}
                <select aria-label={`${horse.name} 종마 역할`} disabled={confirming}
                  value={decision.studRole ?? 'flat'}
                  onChange={(event) => {
                    const studRole = event.target.value as StudRole;
                    setSubmission((current) => ({ ...current, horses: current.horses.map((h) =>
                      h.horseId === horse.horseId ? { ...h, studRole } : h) }));
                  }}>
                  {(['flat', 'dual', 'nh'] as const).map((role) => <option key={role} value={role}
                    disabled={role === 'nh' && horseProfile(state.horses[horse.horseId]!) === 'speed'}>
                    {studRoleKo(role)}
                  </option>)}
                </select>
              </label>
              <p>예상 첫 종부료 {feeKo(Math.round(estimateStudFee(state, horse.horseId).fee
                * (decision.studRole === 'nh' ? NH_FEE_RATIO : decision.studRole === 'dual' ? DUAL_FEE_RATIO : 1)))}</p>
            </div>}
            {decision.choice === 'sell_domestic' && <div>
              <label>교배권{' '}
                <select aria-label={`${horse.name} 교배권`} disabled={confirming} value={nominations}
                  onChange={(event) => {
                    const count = Number(event.target.value);
                    setSubmission((current) => ({ ...current, horses: current.horses.map((h) => h.horseId === horse.horseId ? { ...h, nominations: count } : h) }));
                  }}>
                  {NOMINATION_CHOICES.map((count) => <option key={count} value={count}>{`${count}개`}</option>)}
                </select>
              </label>
              {horse.nominationCostKo !== null && <p className="hint">{horse.nominationCostKo}</p>}
              <p>{`국내 판매가 ${salePriceWithNominationsKo(state, horse.horseId, nominations)}`}</p>
            </div>}
          </td>
        </tr>;
      })}</tbody>
    </table>}
    <h3>전속 계약</h3>
    {view.retainers.length === 0 ? <p>갱신할 계약이 없습니다</p> : <table>
      <thead><tr>{['이름', '역할', '연간 계약금', '관계', '갱신'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{view.retainers.map((contract) => <tr key={`${contract.kind}:${contract.personId}`}>
        <td>{contract.nameKo}</td><td>{contract.roleKo}</td><td>{contract.feeKo}</td><td>{contract.relationKo}</td>
        <td><input type="checkbox" aria-label={`${contract.nameKo} 계약 갱신`} disabled={confirming}
          checked={submission.retainers.find((c) => c.kind === contract.kind && c.personId === contract.personId)!.renew}
          onChange={(event) => {
            const renew = event.target.checked;
            setSubmission((current) => ({ ...current, retainers: current.retainers.map((c) => c.kind === contract.kind && c.personId === contract.personId ? { ...c, renew } : c) }));
          }} /></td>
      </tr>)}</tbody>
    </table>}
    {error !== null && <p className="notice notice--error" role="alert">{error}</p>}
    {confirming ? <div>
      <button type="button" onClick={submit}>이대로 확정</button>
      <button type="button" onClick={() => setConfirming(false)}>취소</button>
    </div> : <button type="button" onClick={() => { setError(null); setConfirming(true); }}>제출</button>}
  </section>;
}
