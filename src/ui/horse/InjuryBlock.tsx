import type { JSX } from 'react';
import type { InjuryError } from '../../engine/horse/injury';
import type { InjuryTreatment } from '../../engine/types';
import type { InjuryView } from '../season/seasonView';
import { injuryErrorKo } from '../game/text';
interface InjuryBlockProps {
  injury: InjuryView;
  locked?: boolean;
  /** 이 카드의 마지막 처치 실패 사유 */
  error: InjuryError | null;
  onExam: () => void;
  onTreat: (treatment: InjuryTreatment) => void;
}

/** 부상 영역: 확진 전이면 단서와 검사 버튼, 확진되면 종류·기간과 치료 선택 버튼 */
export default function InjuryBlock({
  injury,
  error,
  onExam,
  onTreat,
  locked = false,
}: InjuryBlockProps): JSX.Element {
  return (
    <div className="horse-card__injury">
      {injury.kind === 'suspected' ? (
        <>
          <p className="horse-card__line">이상 증세: {injury.hintKo}</p>
          <button type="button" className="btn" disabled={locked} onClick={onExam}>
            검사 받기 ({injury.examCostKo})
          </button>
        </>
      ) : (
        <>
          <p className="horse-card__line">
            확진: {injury.nameKo} · 약 {injury.weeksOut}주
          </p>
          {injury.treatmentKo !== null && <p className="horse-card__hint">치료: {injury.treatmentKo}</p>}
          {injury.options.length > 0 ? (
            <>
              <ul className="comments">
                {injury.options.map((option) => (
                  <li key={option.treatment}>
                    <button
                      type="button"
                      className="btn"
                      disabled={locked}
                      onClick={() => onTreat(option.treatment)}
                    >
                      {option.labelKo} ({option.costKo})
                    </button>{' '}
                    <span className="hint">{option.noteKo}</span>
                  </li>
                ))}
              </ul>
              {injury.treatmentKo === null && <p className="hint">고르지 않으면 휴양합니다.</p>}
            </>
          ) : (
            injury.treatmentKo === null && <p className="hint">고를 수 있는 치료가 없어 휴양합니다.</p>
          )}
        </>
      )}
      {error !== null && (
        <p className="notice notice--error" role="alert">
          {injuryErrorKo(error)}
        </p>
      )}
    </div>
  );
}
