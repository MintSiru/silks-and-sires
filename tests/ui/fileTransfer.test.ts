import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../../src/engine/config/game';
import { deserializeGame, serializeGame } from '../../src/engine/save/serialize';
import { createNewGame } from '../../src/engine/state/newGame';
import type { GameState, SaveError } from '../../src/engine/types';
import { gunzipText, isGzip } from '../../src/ui/storage/compress';
import {
  encodeSaveFile,
  importConfirmKo,
  parseSaveBytes,
  parseSaveFile,
  saveErrorMessageKo,
  suggestSaveFileName,
} from '../../src/ui/storage/fileTransfer';

const SAVED_AT = '2026-03-01T10:00:00.000Z';

function newState(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

/** 엔진 직렬화 결과를 JSON 객체로 되돌린다(테스트에서 봉투를 고칠 때 쓴다). */
function envelopeOf(state: GameState): Record<string, unknown> {
  return JSON.parse(serializeGame(state, SAVED_AT)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('저장 파일 이름 (M6-S S4)', () => {
  it('형식에 맞는 확장자만 붙인다(기본 json)', () => {
    expect(suggestSaveFileName('Owner', { year: 2027, week: 45 }, 'ssg')).toBe('silks-and-sires_Owner_2027-w45.ssg');
    expect(suggestSaveFileName('Owner', { year: 2027, week: 45 })).toBe('silks-and-sires_Owner_2027-w45.json');
  });
});

describe('내보내기 내용 (M6-S S4)', () => {
  it('ssg 는 gzip 으로 풀면 엔진 직렬화 원문과 같고, json 은 비압축 원문이다', async () => {
    const state = newState();
    const ssg = await encodeSaveFile(state, 'ssg', SAVED_AT);
    const json = await encodeSaveFile(state, 'json', SAVED_AT);
    const plain = serializeGame(state, SAVED_AT);

    expect(ssg.fileName.endsWith('.ssg')).toBe(true);
    expect(ssg.mime).toBe('application/octet-stream');
    expect(isGzip(ssg.bytes)).toBe(true);
    expect(await gunzipText(ssg.bytes)).toBe(plain);

    expect(json.fileName.endsWith('.json')).toBe(true);
    expect(json.mime).toBe('application/json');
    expect(isGzip(json.bytes)).toBe(false);
    expect(new TextDecoder().decode(json.bytes)).toBe(plain);
  });

  it('ssg 는 json 보다 작다', async () => {
    const state = newState();
    const ssg = await encodeSaveFile(state, 'ssg', SAVED_AT);
    const json = await encodeSaveFile(state, 'json', SAVED_AT);
    expect(ssg.bytes.byteLength).toBeLessThan(json.bytes.byteLength);
  });

  it('압축을 쓸 수 없으면 ssg 내보내기는 한국어 오류로 던진다', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    await expect(encodeSaveFile(newState(), 'ssg', SAVED_AT)).rejects.toThrow('.json');
  });
});

describe('가져오기 - 정상 경로 (M6-S S4)', () => {
  it('ssg 와 json 을 가져오면 같은 게임 상태가 된다', async () => {
    const state = newState();
    const expected = JSON.parse(JSON.stringify(state)) as GameState;
    const ssg = await encodeSaveFile(state, 'ssg', SAVED_AT);
    const json = await encodeSaveFile(state, 'json', SAVED_AT);

    const fromSsg = await parseSaveBytes(ssg.bytes);
    const fromJson = await parseSaveBytes(json.bytes);

    expect(fromSsg).toEqual({ ok: true, state: expect.anything() });
    expect(fromJson).toEqual({ ok: true, state: expect.anything() });
    if (!fromSsg.ok || !fromJson.ok) throw new Error('정상 저장본이 실패했습니다.');
    expect(fromSsg.state).toEqual(expected);
    expect(fromJson.state).toEqual(expected);
  });

  it('Blob(파일)으로 넘겨도 같은 결과다', async () => {
    const json = await encodeSaveFile(newState(), 'json', SAVED_AT);
    const result = await parseSaveFile(new Blob([new Uint8Array(json.bytes)]));
    expect(result.ok).toBe(true);
  });

  it('압축을 풀 수 없는 환경이어도 비압축 json 은 가져온다', async () => {
    const json = await encodeSaveFile(newState(), 'json', SAVED_AT);
    vi.stubGlobal('DecompressionStream', undefined);
    expect((await parseSaveBytes(json.bytes)).ok).toBe(true);
  });
});

describe('가져오기 - 실패 문구 (M6-S S4)', () => {
  it('형식이 아닌 파일(빈 파일 포함)은 형식 문구', async () => {
    for (const bytes of [new TextEncoder().encode('이것은 저장본이 아닙니다'), new Uint8Array([])]) {
      const result = await parseSaveBytes(bytes);
      expect(result).toEqual({ ok: false, message: expect.stringContaining('저장본 형식이 아니거나') });
    }
  });

  it('gzip 머리만 맞고 내용이 깨진 파일은 형식 문구', async () => {
    const broken = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03]);
    const result = await parseSaveBytes(broken);
    expect(result).toEqual({ ok: false, message: expect.stringContaining('저장본 형식이 아니거나') });
  });

  it('UTF-8 이 아닌 바이트 열은 형식 문구', async () => {
    const result = await parseSaveBytes(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]));
    expect(result).toEqual({ ok: false, message: expect.stringContaining('저장본 형식이 아니거나') });
  });

  it('다른 게임 형식(format 불일치)은 형식 문구', async () => {
    const env = envelopeOf(newState());
    env.format = 'other-game-save';
    const result = await parseSaveBytes(new TextEncoder().encode(JSON.stringify(env)));
    expect(result).toEqual({ ok: false, message: expect.stringContaining('저장본 형식이 아니거나') });
  });

  it('지원 범위 밖 버전은 엔진의 버전 문구를 그대로 보여 준다', async () => {
    const env = envelopeOf(newState());
    env.schemaVersion = SAVE_SCHEMA_VERSION + 1;
    const result = await parseSaveBytes(new TextEncoder().encode(JSON.stringify(env)));
    expect(result).toEqual({ ok: false, message: expect.stringContaining('지원하지 않는 저장 버전') });
  });

  it('압축을 풀 수 없는 환경에서 gzip 파일을 고르면 .json 안내 문구', async () => {
    const ssg = await encodeSaveFile(newState(), 'ssg', SAVED_AT);
    vi.stubGlobal('DecompressionStream', undefined);
    const result = await parseSaveBytes(ssg.bytes);
    expect(result).toEqual({ ok: false, message: expect.stringContaining('.json 파일로 다시 내보내') });
  });

  it('검증 오류는 검증 문구와 엔진의 항목 설명을 담는다', async () => {
    const env = envelopeOf(newState());
    (env.state as Record<string, unknown>).horses = 5;
    const result = await parseSaveBytes(new TextEncoder().encode(JSON.stringify(env)));
    expect(result).toEqual({ ok: false, message: expect.stringContaining('저장 내용이 맞지 않아') });
    expect(result).toEqual({ ok: false, message: expect.stringContaining('horses') });
  });

  it('옛 버전에 마이그레이션 함수가 없으면 마이그레이션 실패 문구(엔진 문구 연동)', () => {
    const env = envelopeOf(newState());
    env.schemaVersion = 17;
    const result = deserializeGame(JSON.stringify(env), {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('마이그레이션이 없는데 통과했습니다.');
    expect(result.error.code).toBe('unsupported_version');
    expect(saveErrorMessageKo(result.error)).toContain('마이그레이션 실패');
  });
});

describe('saveErrorMessageKo 분류 (M6-S S4)', () => {
  it('엔진 오류 코드를 네 분류로 나눈다', () => {
    const plain = (code: SaveError['code'], message = '엔진 문구'): string =>
      saveErrorMessageKo({ code, message });

    expect(plain('invalid_json')).toContain('저장본 형식이 아니거나');
    expect(plain('wrong_format')).toContain('저장본 형식이 아니거나');
    expect(plain('unsupported_version', '지원하지 않는 저장 버전입니다 (9, 지원 범위 1~18).')).toBe(
      '지원하지 않는 저장 버전입니다 (9, 지원 범위 1~18).',
    );
    expect(plain('unsupported_version', '버전 3 → 4 마이그레이션이 없어 불러올 수 없습니다.')).toContain(
      '마이그레이션 실패',
    );
    expect(plain('invalid_state', '저장 데이터를 처리하지 못했습니다: boom')).toContain('마이그레이션 실패');
    expect(plain('invalid_state', 'horses 가 배열이 아닌 객체가 아닙니다')).toContain('저장 내용이 맞지 않아');
  });
});

describe('가져오기 확인 문구 (M6-S S4)', () => {
  it('파일 이름을 넣고 저장하지 않은 진행이 사라진다고 알린다', () => {
    const text = importConfirmKo('silks-and-sires_Owner_2027-w45.ssg');
    expect(text).toContain('silks-and-sires_Owner_2027-w45.ssg');
    expect(text).toContain('저장하지 않은');
  });
});
