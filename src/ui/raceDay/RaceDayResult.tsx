import type { JSX } from 'react';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameState, RaceDayBrief } from '../../engine/types';
import { feeKo } from '../game/text';
import {
  finishRows,
  findRaceResult,
  expectedPosition,
  postRaceComment,
  prizeOfPosition,
  ratingChangeOf,
  ratingChangeText,
} from './raceDayView';

export interface RaceDayResultProps {
  state: GameState;
  /** 출주 전에 찍어 둔 출주표·신청 요약(결과 화면의 기준) */
  brief: RaceDayBrief;
  hasNext: boolean;
  onNext: () => void;
  onClose: () => void;
}

/** 레이스 결과 화면: 전체 착순표, 내 말 상금·OR 변화, 조교사 사후 코멘트 한 줄. */
export default function RaceDayResult({ state, brief, hasNext, onNext, onClose }: RaceDayResultProps): JSX.Element {
  const result = findRaceResult(state, brief.raceId, brief.card.date);
  if (result === undefined) {
    return (
      <section className="rd-result" aria-label="레이스 결과">
        <p role="alert">결과를 찾지 못했습니다. 주를 진행했는지 확인하세요.</p>
        <div className="rd-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </section>
    );
  }
  const mine = result.runners.find((r) => r.horseId === brief.horseId);
  const rows = finishRows(result, state, brief.horseId);
  const prize = mine === undefined ? null : prizeOfPosition(brief.card.race, mine.position);
  const change = ratingChangeOf(state, brief.horseId, brief.raceId, brief.card.date);
  const trainerName = brief.card.runners.find((r) => r.isPlayer)?.trainerName ?? '조교사';
  const comment = mine === undefined ? null : postRaceComment(mine.position, expectedPosition(brief));

  return (
    <section className="rd-result" aria-label="레이스 결과">
      <header className="rd-replay__head">
        <h3>{brief.card.race.name} · 결과</h3>
        <p className="hint">{formatDateKo(brief.card.date)}</p>
      </header>
      <div className="rd-table-wrap">
        <table className="rd-table rd-table--result">
          <caption className="sr-only">전체 착순표</caption>
          <thead>
            <tr>
              <th scope="col">착순</th>
              <th scope="col">마번</th>
              <th scope="col">말</th>
              <th scope="col">착차</th>
              <th scope="col">기수</th>
              <th scope="col">오즈</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.horseId} className={row.isMine ? 'is-mine' : undefined}>
                <td>{row.position}</td>
                <td>{row.saddleCloth}</td>
                <td>{row.name}</td>
                <td>{row.marginText}</td>
                <td>{row.jockeyName}</td>
                <td>{row.oddsText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rd-grid">
        <section className="rd-panel" aria-label="내 말 결과">
          <h4>내 말</h4>
          {mine === undefined ? (
            <p className="hint">이번 레이스 결과에 내 말이 없습니다.</p>
          ) : (
            <ul className="rd-list">
              <li>{mine.position}착 · 상금 {prize === null ? '없음' : feeKo(prize)}</li>
              <li>{change === undefined ? 'OR 변화 없음' : `OR 변화 ${ratingChangeText(change)}`}</li>
            </ul>
          )}
        </section>
        {comment !== null && (
          <section className="rd-panel" aria-label="조교사 사후 코멘트">
            <h4>조교사 사후 코멘트</h4>
            <p className="rd-bubble">
              <strong>
                {trainerName} · {comment.label}
              </strong>
              <span>{comment.text}</span>
            </p>
          </section>
        )}
      </div>
      <div className="rd-actions">
        {hasNext ? (
          <button type="button" className="btn btn--primary" onClick={onNext}>
            다음 레이스
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            닫기
          </button>
        )}
      </div>
    </section>
  );
}
