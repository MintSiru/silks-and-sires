import { useEffect, useState, type RefObject } from 'react';

/** 이 너비(px) 이하는 좁은 화면이라 높이를 재지 않는다(sales.css 의 800px 규칙과 같은 기준) */
const NARROW_MAX_WIDTH = 800;
/** 칸 높이의 아래 한계(px). 이보다 작으면 페이지가 조금 넘쳐도 칸 안 스크롤로 버틴다 */
const MIN_HEIGHT = 460;

/**
 * 칸이 창 아래 끝까지 차지하도록 높이(px)를 잰다. 위쪽 상단 바 높이가 게임 상태에 따라 달라지므로
 * 고정 값 대신 칸의 실제 위치(top)를 재서 뺀다. bottomGap 은 화면 아래 여백(main 패딩).
 * 좁은 화면이면 null(CSS 가 높이를 auto 로 둔다). 렌더마다 다시 재고, 창 크기가 바뀌면 다시 잰다.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, bottomGap: number): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const measure = (): void => {
      const element = ref.current;
      if (element === null || window.innerWidth <= NARROW_MAX_WIDTH) {
        setHeight(null);
        return;
      }
      const top = element.getBoundingClientRect().top;
      const next = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - bottomGap));
      setHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
  return height;
}
