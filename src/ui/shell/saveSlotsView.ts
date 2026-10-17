// 저장 관리 표의 순수 함수(M6-S S3). DOM·저장소 접근 없음.
import { WEEKS_PER_YEAR } from '../../engine/config/game';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameDate } from '../../engine/types';
import { AUTOSAVE_SLOT_ID, MANUAL_SLOT_IDS, type ManualSlotId, type SaveSlotMeta } from '../storage/saveStore';

/** 자동 저장은 진행으로 이 주 간격마다(게임 주 기준) 갱신한다. */
export const AUTOSAVE_INTERVAL_WEEKS = 4;

const AUTOSAVE_LABEL = '자동 저장';
const EMPTY_TEXT = '비어 있음';
const LOADING_TEXT = '확인 중';
const NONE_TEXT = '—';
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

/** 표의 한 줄. 자동 저장은 불러오기만, 수동 칸은 저장·불러오기·삭제. */
export type SaveSlotRow =
  | { kind: 'auto'; id: typeof AUTOSAVE_SLOT_ID; label: string }
  | { kind: 'manual'; id: ManualSlotId; label: string };

/** 자동 저장 1줄 + 수동 3칸 (칸 이름은 화면 표시용 고정 이름) */
export const SAVE_SLOT_ROWS: readonly SaveSlotRow[] = [
  { kind: 'auto', id: AUTOSAVE_SLOT_ID, label: AUTOSAVE_LABEL },
  ...MANUAL_SLOT_IDS.map((id, index): SaveSlotRow => ({ kind: 'manual', id, label: `칸 ${index + 1}` })),
];

/** 칸 id → 화면 칸 이름. 알 수 없는 id 는 id 그대로 보인다. */
export function slotLabelOf(id: string): string {
  return SAVE_SLOT_ROWS.find((row) => row.id === id)?.label ?? id;
}

/** 목록에서 칸의 메타를 찾는다. 목록을 아직 읽지 않았으면(null) undefined. */
export function slotMetaOf(metas: readonly SaveSlotMeta[] | null, id: string): SaveSlotMeta | undefined {
  return metas?.find((meta) => meta.id === id);
}

/** 표 한 줄의 칸별 문구. 비어 있으면 게임 날짜 칸에 '비어 있음'(읽는 중이면 '확인 중'). */
export interface SaveSlotCells {
  filled: boolean;
  dateText: string;
  playerText: string;
  savedAtText: string;
  sizeText: string;
}

export function saveSlotCells(meta: SaveSlotMeta | undefined, loading: boolean): SaveSlotCells {
  if (meta === undefined) {
    return {
      filled: false,
      dateText: loading ? LOADING_TEXT : EMPTY_TEXT,
      playerText: NONE_TEXT,
      savedAtText: NONE_TEXT,
      sizeText: NONE_TEXT,
    };
  }
  return {
    filled: true,
    dateText: formatDateKo(meta.date),
    playerText: meta.playerName === '' ? NONE_TEXT : meta.playerName,
    savedAtText: formatSavedAt(meta.savedAt),
    sizeText: formatSlotBytes(meta.bytes),
  };
}

/** 저장된 바이트를 KB(1MB 미만) 또는 MB 로. 옛 저장본처럼 값이 없으면 '—'. */
export function formatSlotBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return NONE_TEXT;
  if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
}

/** 저장 시각을 이 기기 시간대의 'YYYY-MM-DD HH:mm' 으로. 잘못된 값이면 '—'. */
export function formatSavedAt(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return NONE_TEXT;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/** 채워진 칸에 저장할 때의 확인 문구 */
export function overwriteConfirmKo(label: string): string {
  return `${label}의 저장본을 덮어씁니다. 이전 저장본은 되돌릴 수 없습니다.`;
}

/** 수동 칸 삭제 확인 문구 */
export function deleteConfirmKo(label: string): string {
  return `${label}의 저장본을 지웁니다. 되돌릴 수 없습니다.`;
}

/** 진행 전후 게임 주가 자동 저장 간격의 경계를 넘었는지. 넘었으면 true(여러 경계를 한 번에 넘어도 한 번). */
export function isAutoSaveDue(before: GameDate, after: GameDate): boolean {
  const from = Math.floor(absoluteWeek(before) / AUTOSAVE_INTERVAL_WEEKS);
  const to = Math.floor(absoluteWeek(after) / AUTOSAVE_INTERVAL_WEEKS);
  return to > from;
}

/** 연도·주를 한 줄의 주 번호로 펼친다(연도 경계 포함). */
function absoluteWeek(date: GameDate): number {
  return date.year * WEEKS_PER_YEAR + (date.week - 1);
}
