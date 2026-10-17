import { useEffect } from 'react';

/** 토스트가 화면에 머무는 시간(ms). 새 알림이 오면 다시 센다. */
export const TOAST_MS = 4000;

export type ToastTone = 'ok' | 'error';

/** 알림 한 건. id 가 바뀌면 같은 문구라도 다시 뜨고 시간을 다시 잰다. */
export interface ToastNotice {
  id: number;
  text: string;
  tone: ToastTone;
}

/**
 * 화면 오른쪽 아래에 떠 있는 알림(M6-U2 A2). position: fixed 라서 문서 높이를 늘리지 않는다.
 * aria-live 영역은 항상 있어야 읽힌다. 알림이 없을 때도 빈 영역을 둔다.
 */
export function Toast({ notice, onExpire }: { notice: ToastNotice | null; onExpire: () => void }) {
  const id = notice?.id ?? null;
  useEffect(() => {
    if (id === null) return undefined;
    const timer = window.setTimeout(onExpire, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [id, onExpire]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {notice && (
        <p key={notice.id} className={`toast toast--${notice.tone}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
