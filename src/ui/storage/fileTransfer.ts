import { deserializeGame, serializeGame } from '../../engine/save/serialize';
import type { GameDate, GameState, SaveError } from '../../engine/types';
import { canCompress, gunzipText, gzipText, isGzip } from './compress';

/** 다운로드 직후 바로 revoke 하면 일부 브라우저에서 저장이 실패하므로 지연한다. */
const REVOKE_DELAY_MS = 1000;
const FALLBACK_NAME = 'owner';

/** 저장 파일 형식(M6-S S4). ssg = gzip 으로 압축한 JSON(기본), json = 비압축 JSON. */
export type SaveFileFormat = 'ssg' | 'json';

const FILE_EXTENSION: Readonly<Record<SaveFileFormat, string>> = { ssg: '.ssg', json: '.json' };
const FILE_MIME: Readonly<Record<SaveFileFormat, string>> = {
  ssg: 'application/octet-stream',
  json: 'application/json',
};

/** 가져오기 결과. 성공이면 엔진이 검사·이주한 게임 상태, 실패면 화면에 보일 한국어 문구. */
export type SaveImportResult = { ok: true; state: GameState } | { ok: false; message: string };

/** 내보내기 한 번의 결과: 파일 이름·MIME·내용 바이트(다운로드 전 단계) */
export interface SaveFilePayload {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

const FORMAT_MESSAGE_KO = '이 파일은 게임 저장본 형식이 아니거나 손상되었습니다.';
const NO_DECOMPRESS_MESSAGE_KO = '이 브라우저는 압축된 저장 파일(.ssg)을 풀 수 없습니다. .json 파일로 다시 내보내 보세요.';
const NO_COMPRESS_MESSAGE_KO = '이 브라우저는 압축 저장 파일(.ssg)을 만들 수 없습니다. .json 으로 내보내세요.';
const MIGRATION_FAILED_MESSAGE_KO = '마이그레이션 실패: 옛 저장본을 현재 버전으로 옮기지 못했습니다.';
const VALIDATION_FAILED_MESSAGE_KO = '저장 내용이 맞지 않아 가져올 수 없습니다.';

/**
 * 엔진 오류 문구의 앞부분을 구분하는 표지. 엔진이 이 문구를 바꾸면 saveErrorMessageKo 테스트가 깨진다.
 * - MIGRATION_MISSING_TEXT: 버전 n → n+1 마이그레이션 함수가 없을 때(unsupported_version)
 * - PROCESSING_FAILED_PREFIX: 마이그레이션 함수가 예외를 던졌을 때(invalid_state)
 */
const MIGRATION_MISSING_TEXT = '마이그레이션이 없어';
const PROCESSING_FAILED_PREFIX = '저장 데이터를 처리하지 못했습니다';

/** 엔진 오류(SaveError) → 화면용 한국어 문구. 형식 / 지원하지 않는 버전 / 마이그레이션 실패 / 검증 오류. */
export function saveErrorMessageKo(error: SaveError): string {
  switch (error.code) {
    case 'invalid_json':
    case 'wrong_format':
      return FORMAT_MESSAGE_KO;
    case 'unsupported_version':
      return error.message.includes(MIGRATION_MISSING_TEXT)
        ? `${MIGRATION_FAILED_MESSAGE_KO} ${error.message}`
        : error.message;
    case 'invalid_state':
      return error.message.startsWith(PROCESSING_FAILED_PREFIX)
        ? `${MIGRATION_FAILED_MESSAGE_KO} ${error.message}`
        : `${VALIDATION_FAILED_MESSAGE_KO} ${error.message}`;
  }
}

/** 가져오기 확인 문구: 지금 게임을 이 파일의 저장본으로 바꾼다고 알린다. */
export function importConfirmKo(fileName: string): string {
  return `지금 게임을 "${fileName}" 저장본으로 바꿉니다. 저장하지 않은 진행은 사라집니다.`;
}

/**
 * 저장 파일 이름 제안. 이름은 영숫자만 남긴다.
 * 문자·숫자(유니코드)가 하나도 없으면 'owner' 로 대체한다. 확장자만 형식에 맞춘다(M6-S S4).
 */
export function suggestSaveFileName(playerName: string, date: GameDate, format: SaveFileFormat = 'json'): string {
  const safeName = playerName.replace(/[^\p{L}\p{N}]/gu, '') || FALLBACK_NAME;
  const week = String(date.week).padStart(2, '0');
  return `silks-and-sires_${safeName}_${date.year}-w${week}${FILE_EXTENSION[format]}`;
}

/** 내용 바이트를 파일로 내려받는다. 저장 전에 revoke 하면 실패할 수 있어 지연한다. */
export function downloadSaveFile(bytes: Uint8Array, mime: string, fileName: string): void {
  const blob = new Blob([bytes.slice()], { type: mime });
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
 * 게임 상태를 저장 파일 내용으로 만든다(다운로드 전 단계, DOM 접근 없음).
 * ssg 는 gzip 압축이므로 압축을 쓸 수 없는 환경이면 던진다(호출 측이 토스트로 알린다).
 */
export async function encodeSaveFile(
  state: GameState,
  format: SaveFileFormat,
  savedAtIso: string,
): Promise<SaveFilePayload> {
  const json = serializeGame(state, savedAtIso);
  const owner = state.owners[state.playerOwnerId];
  const fileName = suggestSaveFileName(owner?.name ?? '', state.date, format);
  if (format === 'json') {
    return { fileName, mime: FILE_MIME.json, bytes: new TextEncoder().encode(json) };
  }
  if (!canCompress()) {
    throw new Error(NO_COMPRESS_MESSAGE_KO);
  }
  return { fileName, mime: FILE_MIME.ssg, bytes: await gzipText(json) };
}

/** 현재 게임을 파일로 내려받는다. 게임 상태는 바뀌지 않는다. 내려받은 파일 이름을 돌려준다. */
export async function exportSaveFile(state: GameState, format: SaveFileFormat): Promise<string> {
  const payload = await encodeSaveFile(state, format, new Date().toISOString());
  downloadSaveFile(payload.bytes, payload.mime, payload.fileName);
  return payload.fileName;
}

/**
 * 저장 파일 바이트를 게임 상태로 되돌린다. 앞 두 바이트가 gzip 이면 풀고, 아니면 UTF-8 JSON 으로 읽는다.
 * 게임 상태는 바꾸지 않는다. 검사·이주는 deserializeGame(엔진)이 맡는다.
 */
export async function parseSaveBytes(bytes: Uint8Array): Promise<SaveImportResult> {
  let json: string;
  if (isGzip(bytes)) {
    if (!canCompress()) return { ok: false, message: NO_DECOMPRESS_MESSAGE_KO };
    try {
      json = await gunzipText(bytes);
    } catch {
      return { ok: false, message: FORMAT_MESSAGE_KO };
    }
  } else {
    try {
      json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, message: FORMAT_MESSAGE_KO };
    }
  }
  const result = deserializeGame(json);
  if (!result.ok) return { ok: false, message: saveErrorMessageKo(result.error) };
  return { ok: true, state: result.state };
}

/** 사용자가 고른 파일(.ssg·.json)을 읽어 검사한다. 게임 상태는 바꾸지 않는다. */
export async function parseSaveFile(file: Blob): Promise<SaveImportResult> {
  return parseSaveBytes(new Uint8Array(await file.arrayBuffer()));
}
