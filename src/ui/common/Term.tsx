import { useId, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryId } from './glossary';
import './term.css';

/**
 * 용어 한 개. 점선 밑줄로 표시하고, 포커스(키보드)·호버 때 한 줄 풀이 말풍선을 보인다.
 * 풀이는 aria-describedby(숨김 문구)로도 전달한다. title 은 말풍선과 같은 문구가 두 번 보여 쓰지 않는다(Opus).
 */
export function Term({ id, children }: { id: GlossaryId; children: ReactNode }) {
  const descId = useId();
  const entry = GLOSSARY[id];
  return (
    <span
      className="term"
      tabIndex={0}
      aria-describedby={descId}
      data-term={id}
    >
      {children}
      <span id={descId} className="term__sr">
        {entry.gloss}
      </span>
      <span className="term__bubble" aria-hidden="true">
        {entry.gloss}
      </span>
    </span>
  );
}
