# M2-10b 이탈리아 계류 종마 + 독일 2두 추가

담당: haiku-data · 선행: M2-10(독일 23두) 커밋 후 · 규칙은 M2-10 과 같다(스키마·key·marketTier 로그 거리·조상 레코드·_review.md·테스트)

## 사용자 제공 값 (바꾸지 말 것)
### 독일(standsIn 'DE') 2두
| 이름 | 부 | 외조부 | 종부료 |
|---|---|---|---|
| Neatico | Medicean | Sadler's Wells | €3,000 |
| Accon | Camelot | Dubawi | €2,500 |

### 이탈리아(standsIn 'IT')
| 이름 | 생년 | 부 | 외조부 | 종부료 | 비고 |
|---|---|---|---|---|---|
| Ulysses | 2013 | Galileo | Kingmambo | 비공개 | **이미 데이터에 있음** → standsIn 'GB' → 'IT', marketTier 2 → 4(Opus 결정), 나머지 필드 유지 |
| Arcano | 2007 | Oasis Dream | Daylami | €4,000 | 사용자 메모: 2009 2세 G1(프랑스 8월 2세 G1) 우승, 2세 3전 3승 |
| Cantocorale | 2018 | Helmet | Street Cry | €3,000 | 이탈리아 1,600~2,000m |
| Inns of Court | — | Invincible Spirit | Seeking the Gold | €7,0xx(이미지 잘림 — 등급 5) | |
| Chemical Charge | — | Sea The Stars | Kingmambo | €2,5xx(잘림 — 등급 5) | |
| Markaz | — | Dark Angel | Atraf | 문의 | |
| Dragon Pulse | — | Kyllachy | Croco Rouge | 미공개 | |
| Albert Dock | — | Deep Impact | Unbridled's Song | 미확인 | |
| Havana Cigar | — | Havana Grey | Invincible Spirit | 미확인 | |
| War Command | — | War Front | Red Ransom | 미확인 | |

- 종부료가 비공개·문의·미확인인 이탈리아 종마의 marketTier = 5(Opus 결정, Ulysses 만 4).
- 생년이 비어 있는 말은 위키백과로 채운다.
- 조상: Kyllachy, Havana Grey, Helmet, Atraf, Croco Rouge, Daylami, Street Cry 등 데이터에 없는 부·외조부를 M2-10 규칙대로 추가(부계 사슬 연결).
- 테스트: IT 계류 active ≥ 10두, DE 계류 active ≥ 25두, 표의 부·외조부 일치.

## 금지
src/ 수정 금지. 표 값 변경 금지. git commit 금지.
