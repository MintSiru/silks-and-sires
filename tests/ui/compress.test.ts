import { afterEach, describe, expect, it, vi } from 'vitest';
import { canCompress, gunzipText, gzipText, isGzip } from '../../src/ui/storage/compress';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canCompress', () => {
  it('Node 내장 CompressionStream 이 있으면 true', () => {
    expect(canCompress()).toBe(true);
  });

  it('둘 중 하나라도 없으면 false', () => {
    vi.stubGlobal('CompressionStream', undefined);
    expect(canCompress()).toBe(false);

    vi.unstubAllGlobals();
    vi.stubGlobal('DecompressionStream', undefined);
    expect(canCompress()).toBe(false);
  });
});

describe('gzipText / gunzipText', () => {
  it('한글을 포함한 긴 문자열을 왕복하면 원문과 같고 크기가 줄어든다', async () => {
    const text = JSON.stringify(
      Array.from({ length: 1000 }, (_, index) => ({ 이름: '구름들 컵', 주차: index % 52, 종류: 'g1_win' })),
    );

    const gz = await gzipText(text);

    expect(gz.byteLength).toBeLessThan(new TextEncoder().encode(text).byteLength);
    expect(isGzip(gz)).toBe(true);
    expect(await gunzipText(gz)).toBe(text);
  });

  it('빈 문자열도 왕복한다', async () => {
    const gz = await gzipText('');
    expect(isGzip(gz)).toBe(true);
    expect(await gunzipText(gz)).toBe('');
  });

  it('gzip 이 아닌 바이트를 풀면 던진다', async () => {
    const garbage = new TextEncoder().encode('이것은 gzip 이 아닙니다');
    await expect(gunzipText(garbage)).rejects.toThrow();
  });
});

describe('isGzip', () => {
  it('앞 두 바이트가 1f 8b 이면 true', () => {
    expect(isGzip(new Uint8Array([0x1f, 0x8b, 0x08]))).toBe(true);
  });

  it('다른 바이트이거나 너무 짧으면 false', () => {
    expect(isGzip(new TextEncoder().encode('{"a":1}'))).toBe(false);
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
    expect(isGzip(new Uint8Array([]))).toBe(false);
  });
});
