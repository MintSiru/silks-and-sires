import { describe, expect, it } from 'vitest';
import { formatDateKo } from '../../src/engine/time/calendar';
import {
  AUTOSAVE_INTERVAL_WEEKS,
  SAVE_SLOT_ROWS,
  deleteConfirmKo,
  formatSavedAt,
  formatSlotBytes,
  isAutoSaveDue,
  overwriteConfirmKo,
  saveSlotCells,
  slotLabelOf,
  slotMetaOf,
} from '../../src/ui/shell/saveSlotsView';
import {
  AUTOSAVE_SLOT_ID,
  MANUAL_SLOT_IDS,
  createMemorySaveStore,
  type SaveSlotMeta,
} from '../../src/ui/storage/saveStore';

const meta: SaveSlotMeta = {
  id: 'slot-1',
  name: '칸 1',
  savedAt: '2026-03-01T10:00:00.000Z',
  date: { year: 2026, week: 5 },
  playerName: '구름들 마주',
  bytes: 28 * 1024 * 1024,
};

describe('저장 칸 표의 행 (M6-S S3)', () => {
  it('자동 저장 1줄 다음에 수동 칸 3개가 같은 순서로 온다', () => {
    expect(SAVE_SLOT_ROWS.map((row) => row.id)).toEqual([AUTOSAVE_SLOT_ID, ...MANUAL_SLOT_IDS]);
    expect(SAVE_SLOT_ROWS.map((row) => row.label)).toEqual(['자동 저장', '칸 1', '칸 2', '칸 3']);
    expect(SAVE_SLOT_ROWS.map((row) => row.kind)).toEqual(['auto', 'manual', 'manual', 'manual']);
  });

  it('칸 id 를 화면 칸 이름으로 바꾸고, 모르는 id 는 그대로 둔다', () => {
    expect(slotLabelOf('slot-2')).toBe('칸 2');
    expect(slotLabelOf(AUTOSAVE_SLOT_ID)).toBe('자동 저장');
    expect(slotLabelOf('slot-x')).toBe('slot-x');
  });

  it('목록이 없거나 해당 칸이 없으면 메타는 undefined', () => {
    expect(slotMetaOf(null, 'slot-1')).toBeUndefined();
    expect(slotMetaOf([meta], 'slot-2')).toBeUndefined();
    expect(slotMetaOf([meta], 'slot-1')).toBe(meta);
  });
});

describe('저장 칸 셀 문구 (M6-S S3)', () => {
  it('비어 있는 칸은 비어 있음, 읽는 중이면 확인 중', () => {
    const empty = saveSlotCells(undefined, false);
    expect(empty.filled).toBe(false);
    expect(empty.dateText).toBe('비어 있음');
    const loading = saveSlotCells(undefined, true);
    expect(loading.dateText).toBe('확인 중');
    expect(loading.filled).toBe(false);
  });

  it('채워진 칸은 게임 날짜·마주·저장 시각·크기를 보여 준다', () => {
    const cells = saveSlotCells(meta, false);
    expect(cells.filled).toBe(true);
    expect(cells.dateText).toBe(formatDateKo(meta.date));
    expect(cells.playerText).toBe('구름들 마주');
    expect(cells.sizeText).toBe('28.00 MB');
    expect(cells.savedAtText).toBe(formatSavedAt(meta.savedAt));
  });

  it('마주 이름이 비었거나 바이트가 없으면 대시', () => {
    const cells = saveSlotCells({ ...meta, playerName: '', bytes: undefined }, false);
    expect(cells.playerText).toBe('—');
    expect(cells.sizeText).toBe('—');
  });
});

describe('크기·시각 표시 (M6-S S3)', () => {
  it('1MB 미만은 KB, 이상은 MB', () => {
    expect(formatSlotBytes(undefined)).toBe('—');
    expect(formatSlotBytes(512)).toBe('0.5 KB');
    expect(formatSlotBytes(1536)).toBe('1.5 KB');
    expect(formatSlotBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatSlotBytes(-1)).toBe('—');
  });

  it('저장 시각은 이 기기 시간대의 YYYY-MM-DD HH:mm 이고, 잘못된 값은 대시', () => {
    expect(formatSavedAt(meta.savedAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatSavedAt('not-a-date')).toBe('—');
  });
});

describe('확인 문구 (M6-S S3)', () => {
  it('덮어쓰기와 삭제 확인에 칸 이름이 들어가고 되돌릴 수 없음을 알린다', () => {
    expect(overwriteConfirmKo('칸 1')).toContain('칸 1의 저장본을 덮어씁니다');
    expect(overwriteConfirmKo('칸 1')).toContain('되돌릴 수 없습니다');
    expect(deleteConfirmKo('칸 3')).toContain('칸 3의 저장본을 지웁니다');
  });
});

describe('자동 저장 주기 (M6-S S3)', () => {
  it('간격은 게임 4주', () => {
    expect(AUTOSAVE_INTERVAL_WEEKS).toBe(4);
  });

  it('4주 경계를 넘을 때만 자동 저장한다', () => {
    const start = { year: 2026, week: 1 };
    expect(isAutoSaveDue(start, { year: 2026, week: 2 })).toBe(false);
    expect(isAutoSaveDue(start, { year: 2026, week: 4 })).toBe(false);
    expect(isAutoSaveDue(start, { year: 2026, week: 5 })).toBe(true);
    expect(isAutoSaveDue({ year: 2026, week: 2 }, { year: 2026, week: 3 })).toBe(false);
  });

  it('여러 경계를 한 번에 넘어도 true 이고, 주가 그대로면 false', () => {
    expect(isAutoSaveDue({ year: 2026, week: 1 }, { year: 2026, week: 12 })).toBe(true);
    expect(isAutoSaveDue({ year: 2026, week: 7 }, { year: 2026, week: 7 })).toBe(false);
  });

  it('연도가 바뀌어도 주 번호를 이어서 센다', () => {
    // 2026년 52주(연속 주 번호 105403, 26350.75 → 26350) → 2027년 1주(105404, 26351): 경계를 넘는다.
    expect(isAutoSaveDue({ year: 2026, week: 52 }, { year: 2027, week: 1 })).toBe(true);
    // 2026년 49주(105400 → 26350) → 50주(105401 → 26350): 같은 칸 안이라 넘지 않는다.
    expect(isAutoSaveDue({ year: 2026, week: 49 }, { year: 2026, week: 50 })).toBe(false);
  });
});

describe('저장소 → 칸 셀 (메모리 구현, M6-S S3)', () => {
  it('저장한 칸은 목록에서 찾아 셀 문구로 바뀐다', async () => {
    const store = createMemorySaveStore();
    await store.save(meta, '{"format":"x"}');
    const list = await store.list();
    const found = slotMetaOf(list, 'slot-1');
    expect(found).toBeDefined();
    const cells = saveSlotCells(found, false);
    expect(cells.filled).toBe(true);
    expect(cells.sizeText).toMatch(/ (KB|MB)$/);
    expect(cells.sizeText).toBe(formatSlotBytes(found?.bytes));
    // 저장하지 않은 칸은 여전히 비어 있음
    expect(saveSlotCells(slotMetaOf(list, 'slot-2'), false).dateText).toBe('비어 있음');
  });
});
