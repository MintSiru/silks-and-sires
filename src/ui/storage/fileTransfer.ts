import type { GameDate } from '../../engine/types';

/** 다운로드 직후 바로 revoke 하면 일부 브라우저에서 저장이 실패하므로 지연한다. */
const REVOKE_DELAY_MS = 1000;
const FALLBACK_NAME = 'owner';

/** JSON 문자열을 파일로 내려받는다. */
export function downloadSaveFile(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** 사용자가 고른 저장 파일을 텍스트로 읽는다. */
export function readSaveFile(file: File): Promise<string> {
  return file.text();
}

/**
 * 저장 파일 이름 제안. 이름은 영숫자만 남긴다.
 * 문자·숫자(유니코드)가 하나도 없으면 'owner' 로 대체한다.
 */
export function suggestSaveFileName(playerName: string, date: GameDate): string {
  const safeName = playerName.replace(/[^\p{L}\p{N}]/gu, '') || FALLBACK_NAME;
  const week = String(date.week).padStart(2, '0');
  return `silks-and-sires_${safeName}_${date.year}-w${week}.json`;
}
