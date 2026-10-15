import { useState } from 'react';
import type { GameApi } from '../game/useGame';
import { defaultSubmission, yearEndErrorKo, yearEndView } from './yearEndView';

export default function YearEndScreen({ game }: { game: GameApi }) {
  const state = game.state!;
  const view = yearEndView(state);
  const [submission, setSubmission] = useState(() => defaultSubmission(state));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const result = game.submitYearEnd(submission);
    if (!result.ok) {
      const name = result.horseId === undefined ? undefined : state.horses[result.horseId]?.name;
      setError(`${name === undefined ? '' : `${name}: `}${yearEndErrorKo(result.error)}`);
      setConfirming(false);
    }
  }

  return <section className="panel" aria-label="연말 정산">
    {/* view.year 는 맞이하는 새해. 정산은 끝난 해 기준으로 표시 */}
    <h2>{view.year - 1}년 연말 정산</h2>
    <p>모든 현역마의 진로와 전속 계약 갱신을 정해야 새해로 진행합니다.</p>
    <h3>현역마 진로</h3>
    <p>{view.freeSlotsKo}</p>
    {view.horses.length === 0 ? <p>현역마가 없습니다</p> : <table>
      <thead><tr>{['이름', '성별', '새해 나이', '통산 성적', '진로 선택'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{view.horses.map((horse) => <tr key={horse.horseId}>
        <td>{horse.name}</td><td>{horse.sexKo}</td><td>{horse.newAge}세</td><td>{horse.careerKo}</td>
        <td><select aria-label={`${horse.name} 진로`} disabled={confirming}
          value={submission.horses.find((h) => h.horseId === horse.horseId)!.choice}
          onChange={(event) => {
            const choice = horse.options.find((option) => option.choice === event.target.value)!.choice;
            setSubmission((current) => ({ ...current, horses: current.horses.map((h) => h.horseId === horse.horseId ? { ...h, choice } : h) }));
          }}>
          {horse.options.map((option) => <option key={option.choice} value={option.choice}>{option.labelKo}</option>)}
        </select></td>
      </tr>)}</tbody>
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
