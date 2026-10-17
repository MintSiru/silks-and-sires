import './yearReview.css';
import type { YearReviewView } from './yearReviewView';

/** 연말 정산 맨 위의 '한 해 돌아보기'. 접을 수 있고 기본은 펼쳐진다. 값은 yearReviewView 가 만든다. */
export default function YearReview({ view }: { view: YearReviewView }) {
  return <details className="year-review" open>
    <summary>{view.titleKo}</summary>
    <div className="year-review__grid">
      {view.cards.map((card) => <section key={card.key} className="year-review__card" aria-label={card.titleKo}>
        <h3>{card.titleKo}</h3>
        <dl>
          {card.rows.map((row, index) => <div key={`${row.label}-${index}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>)}
        </dl>
        {card.notices.map((notice) => <p key={notice} className="hint">{notice}</p>)}
      </section>)}
    </div>
  </details>;
}
