import commentaryJson from '../../../data/text/commentary.ko.json';
import type { CommentaryLines } from '../commentary/render';

/** 실황 문장 표(data/text/commentary.ko.json). staticData.ts 와 분리해 둔 로더. */
const LINES: CommentaryLines = commentaryJson;

export function getCommentaryLines(): CommentaryLines {
  return LINES;
}
