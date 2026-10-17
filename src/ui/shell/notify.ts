import { createContext, useContext } from 'react';
import type { ToastTone } from './Toast';

/** 화면 어디서나 오른쪽 아래 토스트로 알리는 함수(M6-W, 아르곤 검토: 완료 알림은 토스트로 통일). */
export type Notify = (text: string, tone?: ToastTone) => void;

/** App 이 값을 넣는다. Provider 밖(테스트의 단독 렌더)에서는 아무것도 하지 않는다. */
export const NotifyContext = createContext<Notify>(() => {});

export function useNotify(): Notify {
  return useContext(NotifyContext);
}
