/**
 * 저장 데이터 압축 도우미(M6-S S1). 브라우저·Node 내장 CompressionStream/DecompressionStream 만 쓴다.
 * 외부 의존성은 없다.
 */

/** gzip 매직 넘버: 1f 8b */
const GZIP_MAGIC_FIRST = 0x1f;
const GZIP_MAGIC_SECOND = 0x8b;

/** 압축 스트림 두 개가 모두 있는 환경인지. 없으면 저장은 압축 없이 JSON 으로 한다. */
export function canCompress(): boolean {
  return typeof globalThis.CompressionStream === 'function' && typeof globalThis.DecompressionStream === 'function';
}

/** 입력을 변환 스트림에 넣고 출력 전체를 모은다. 입력 쓰기 오류도 출력 읽기 오류로 전파된다. */
async function runTransform(input: Uint8Array, transform: TransformStream<BufferSource, Uint8Array>): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // 복사본을 써서 ArrayBuffer 기반 타입으로 맞춘다(SharedArrayBuffer 입력도 받기 위함).
  const writing = writer.write(input.slice()).then(() => writer.close());
  // 읽기 쪽이 먼저 실패하면 아래 await 가 던지므로, 이 쓰기 실패는 따로 처리하지 않아도 된다.
  writing.catch(() => undefined);
  const output = await new Response(transform.readable).arrayBuffer();
  await writing;
  return new Uint8Array(output);
}

/** 텍스트를 gzip 바이트로 압축한다. */
export async function gzipText(text: string): Promise<Uint8Array> {
  return runTransform(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

/** gzip 바이트를 텍스트로 푼다. gzip 이 아니거나 손상되었으면 던진다. */
export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const plain = await runTransform(bytes, new DecompressionStream('gzip'));
  return new TextDecoder().decode(plain);
}

/** 앞 두 바이트가 gzip 매직(1f 8b)인지. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC_FIRST && bytes[1] === GZIP_MAGIC_SECOND;
}
