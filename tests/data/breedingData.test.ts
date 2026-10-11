import { describe, expect, it } from 'vitest';
import nicksJson from '../../data/breeding/nicks.json';
import wordsJson from '../../data/names/horse_words.json';
import commentsJson from '../../data/text/comments.ko.json';
import sireLinesJson from '../../data/stallions/sire_lines.json';
import { COMMENT_KEYS } from '../../src/engine/types/breeding';
import type { CommentKey, NickEntry } from '../../src/engine/types/breeding';
import type { SireLine } from '../../src/engine/types/bloodline';

/** M2-04 배합 데이터 검증 (data/breeding, data/names, data/text). 스키마는 src/engine/types/breeding.ts 를 따른다. */

const nicks = nicksJson as NickEntry[];
const words = wordsJson as { adjectives: string[]; nouns: string[] };
const comments = commentsJson as Record<string, string[]>;
const lineIds = new Set((sireLinesJson as SireLine[]).map((l) => l.id));

/** 실제로 잘 알려진 니크스 경향(명세 고정 항목). knownAtStart true, value > 0 이어야 한다 */
const FAMOUS_NICKS: Array<[string, string]> = [
  ['sl_sadlers_wells', 'sl_danehill'],
  ['sl_sadlers_wells', 'sl_danzig'],
  ['sl_dubawi', 'sl_sadlers_wells'],
  ['sl_storm_cat', 'sl_mr_prospector'],
  ['sl_ap_indy', 'sl_mr_prospector'],
];

describe('닉스 표 (data/breeding/nicks.json)', () => {
  it('모든 sireLineId·damsireLineId 는 sire_lines.json 의 id', () => {
    for (const n of nicks) {
      expect(lineIds.has(n.sireLineId), `sireLineId ${n.sireLineId}`).toBe(true);
      expect(lineIds.has(n.damsireLineId), `damsireLineId ${n.damsireLineId}`).toBe(true);
    }
  });

  it('(sireLineId, damsireLineId) 쌍 중복 없음', () => {
    const pairs = nicks.map((n) => `${n.sireLineId}|${n.damsireLineId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('value 는 -1 ~ +1 범위의 소수 2자리 숫자', () => {
    for (const n of nicks) {
      expect(typeof n.value, `${n.sireLineId}/${n.damsireLineId}`).toBe('number');
      expect(n.value).toBeGreaterThanOrEqual(-1);
      expect(n.value).toBeLessThanOrEqual(1);
      expect(Math.round(n.value * 100) / 100, `${n.sireLineId}/${n.damsireLineId}`).toBe(n.value);
    }
  });

  it('개수 40~60', () => {
    expect(nicks.length).toBeGreaterThanOrEqual(40);
    expect(nicks.length).toBeLessThanOrEqual(60);
  });

  it('knownAtStart 비율 20~40%', () => {
    const known = nicks.filter((n) => n.knownAtStart).length;
    const ratio = known / nicks.length;
    expect(ratio).toBeGreaterThanOrEqual(0.2);
    expect(ratio).toBeLessThanOrEqual(0.4);
  });

  it('명세의 유명 쌍 5개는 knownAtStart true 이고 value > 0', () => {
    for (const [sire, dam] of FAMOUS_NICKS) {
      const entry = nicks.find((n) => n.sireLineId === sire && n.damsireLineId === dam);
      expect(entry, `${sire} × ${dam} 항목 존재`).toBeDefined();
      expect(entry?.knownAtStart, `${sire} × ${dam} knownAtStart`).toBe(true);
      expect(entry?.value ?? 0, `${sire} × ${dam} value`).toBeGreaterThan(0);
    }
  });
});

describe('말 이름 단어장 (data/names/horse_words.json)', () => {
  it('adjectives 150개, nouns 200개', () => {
    expect(words.adjectives.length).toBe(150);
    expect(words.nouns.length).toBe(200);
  });

  it('중복 없음 (대소문자 무시, 두 목록 합산 포함)', () => {
    const all = [...words.adjectives, ...words.nouns].map((w) => w.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it('길이 2~10, 영문자만 (하이픈·아포스트로피 허용, 공백·숫자 없음)', () => {
    const pattern = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/;
    for (const w of [...words.adjectives, ...words.nouns]) {
      expect(w.length, w).toBeGreaterThanOrEqual(2);
      expect(w.length, w).toBeLessThanOrEqual(10);
      expect(pattern.test(w), w).toBe(true);
    }
  });
});

describe('코멘트 문장 (data/text/comments.ko.json)', () => {
  it('키 집합이 COMMENT_KEYS 와 정확히 일치', () => {
    const keys = Object.keys(comments).sort();
    const expected = [...COMMENT_KEYS].sort();
    expect(keys).toEqual(expected);
  });

  it('키마다 문장 2~3개, 각 40자 이하, 숫자(0-9) 없음', () => {
    for (const key of COMMENT_KEYS as readonly CommentKey[]) {
      const list = comments[key] ?? [];
      expect(list.length, `${key} 문장 수`).toBeGreaterThanOrEqual(2);
      expect(list.length, `${key} 문장 수`).toBeLessThanOrEqual(3);
      for (const sentence of list) {
        expect(sentence.length, `${key}: ${sentence}`).toBeLessThanOrEqual(40);
        expect(/[0-9]/.test(sentence), `${key}: ${sentence}`).toBe(false);
      }
    }
  });
});
