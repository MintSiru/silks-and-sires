import type { SilksBodyPattern, SilksCapPattern, SilksSleevePattern } from '../../engine/types';

export const BODY_PATTERN_KO: Record<SilksBodyPattern, string> = {
  plain: '단색', hoop: '가로띠 한 줄', hoops: '가로띠 여러 줄', stripes: '세로줄',
  braces: '멜빵', cross_belts: 'X띠', sash: '어깨띠', diamond: '다이아몬드 하나',
  diamonds: '다이아몬드 여러 개', triple_diamond: '트리플 다이아몬드',
  chevron: '셰브런 하나', chevrons: '셰브런 여러 개', epaulets: '견장',
  halves_vertical: '반반(세로)', halves_horizontal: '반반(가로)',
  inverted_triangle: '역삼각형', triangle: '삼각형', large_spots: '큰 점', small_spots: '작은 점',
  quartered: '4분할', seams: '이음선', star: '별 하나', stars: '별 여러 개', check: '체크',
  disc: '원판', cross_of_lorraine: '로렌 십자', diabolo: '디아볼로', collar: '칼라색', border: '테두리',
};
export const SLEEVE_PATTERN_KO: Record<SilksSleevePattern, string> = {
  plain: '단색', hoops: '가로띠 여러 줄', stripes: '세로줄', armlet: '팔띠 하나',
  armlets: '팔띠 두 줄', chevrons: '셰브런', diamonds: '다이아몬드', spots: '점',
  stars: '별', seams: '이음선', halves: '반반', check: '체크', cuffs: '커프스',
};
export const CAP_PATTERN_KO: Record<SilksCapPattern, string> = {
  plain: '단색', hooped: '가로띠', striped: '세로줄', quartered: '4분할', spots: '점',
  star: '별 하나', stars: '별 여러 개', diamonds: '다이아몬드', check: '체크',
  peak: '챙색', pompon: '방울색',
};
export const SILKS_ERROR_KO = {
  too_many_layers: '무늬 층은 두 개까지 넣을 수 있습니다.',
  invalid_colour: '색은 #rrggbb 형식의 소문자 여섯 자리로 입력하세요.',
  invalid_pattern: '목록에 있는 무늬를 골라 주세요.',
  player_not_found: '플레이어 마주를 찾을 수 없습니다.',
};
