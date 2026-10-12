# M2-01 실명 종마 검수표 (Opus 검수용, 3차 갱신: M2-01b 반영)

작성: haiku-data · 기준 시점 2026-10-11 · 자료: 위키백과 원문(action=raw) 교차 확인 + 일부 기억 기반 (표시됨).

## 판정 기준 (Opus 정책 변경 반영)

- active: 위키백과에 현역 계류(종마 기재)가 있고 사망·은퇴(종마 은퇴) 기록이 없음. standsIn = 기사의 최근 계류 국가. confidence = medium (연도 미확인 기사는 low).
- historical: 사망 기재 확인. pensioned: 은퇴 기록 또는 계류 상태 미확인 생존 종마.
- 출생국: CountryCode 에 CA 추가 반영 (Northern Dancer, Storm Bird = CA).

## 요약

- (M2-01 시점 기록. 현재 총계는 맨 아래 M2-01b 섹션 참조) 종마 73두: active 31 (유럽 21, 미국 더트·양용 10), pensioned 14, historical 28.
- 계통 19 (루트 3 + 하위 16). 루트: 노던댄서, 시애틀 슬루, 해리스 홀리데이(Harlan's Holiday).
- **수용 기준 미달**: 유럽 현역 21두 (기준 50), 미국 더트·양용 현역 10두 (기준 15). 테스트에서 실패로 남긴다.
- 암말 이름은 어느 필드에도 없음 (damsireKey 는 종마 key 만).

## 남은 한계·Opus 판단 필요

1. **유럽·미국 현역 수 부족**: 위키백과 항목이 없거나 계류 장소·연도가 없는 후보는 넣지 않았다 (Monterosso, Mishriff, Muhaarar, Expert Eye, Lethal Force, Adayar, Dark Angel, Cracksman, New Approach, Kingsbarns 등). 목표 수를 채우려면 2026 계류 목록 출처가 필요하다.
2. **상위 혈통 사슬 끝(루트)**: Polymelus(부 Cyllene 항목은 있으나 Polymelus 항목 미확인), Seattle Slew(부 Bold Reasoning 항목에 계보 infobox 없음), Harlan's Holiday(부 Harlan 항목 조회 실패). 이 3곳은 sireKey null.
3. **Harlan's Holiday 계보**: 위키백과 infobox 상 부 Harlan. Harlan 항목을 찾지 못해 Storm Cat 계와 직접 연결하지 못했다 (Into Mischief → Harlan's Holiday 까지 확인).
4. **기억 기반 값**: Storm Cat·Storm Bird·Shamardal·Curlin·Smart Strike·Pulpit·Tapit 의 생년 일부, Kingman 의 계류국(GB), Ulysses 출생국 등은 infobox 로 확인하지 못했다. 해당 행 근거에 표시.
5. **계류국 추정**: Practical Joke, Essential Quality, Flightline 은 기사에 계류 장소 명시가 없어 미국(생산·종부료 기준)으로 추정했다.
6. **셔틀 종마**: Shalaa(FR 주, AU 셔틀)는 기사 기재 순서로 FR 을 택했다.

## 종마 검수표

| key | 이름 | status | standsIn | confidence | 근거·의문점 |
| --- | --- | --- | --- | --- | --- |
| stl_shalaa | Shalaa | active | FR | low | 위키백과: 부 Invincible Spirit, 2013년 2월 23일 생, 아일랜드산. "shuttle stallion between [목장] in France and [목장] in Australia" → 주 계류 FR 로 기재, AU 셔틀 병기. 확인 필요. |
| stl_cacique | Cacique | pensioned | - | low | 위키백과 infobox: 부 Danehill, 2001년 생, 아일랜드. 계류 장소 미확인 → 비현역 처리. 모부 Kahyasi(미수록). |
| stl_curlin | Curlin | pensioned | - | low | 위키백과: 부 Smart Strike, 모부 Deputy Minister(미수록), 2004년 생(기억 기반), 미국. 2008년 은퇴 기재. 종마 계류 장소 미확인 → 비현역 처리. |
| stl_invincible_spirit | Invincible Spirit | pensioned | - | low | 위키백과 infobox: 부 Green Desert, 1997년 2월 17일 생, 아일랜드. 모부 Kris(미수록). 계류 상태 미확인 → 비현역 처리. |
| stl_medaglia_d_oro | Medaglia d'Oro | pensioned | - | low | 위키백과 infobox: 부 El Prado, 1999년 4월 11일 생, 미국. 은퇴 후 종마 기재, 계류 장소 미확인 → 비현역(pensioned) 처리. |
| stl_nathaniel | Nathaniel | pensioned | - | low | 위키백과 infobox: 부 Galileo, 2008년 생, 아일랜드. 종마 기재(자손 성적 언급)는 있으나 계류 장소 미확인 → 비현역 처리. |
| stl_nearctic | Nearctic | historical | - | low | 부 Nearco, 1954년 생은 기억 기반. 출생국 미확인(US 임시). |
| stl_polar_falcon | Polar Falcon | pensioned | - | low | 부 Nureyev, 1987년 생, 미국은 기억 기반(위키 항목 미확인). 계류 상태 미확인 → 비현역. |
| stl_polymelus | Polymelus | historical | - | low | 위키백과 항목 미확인. 부(Cyllene 등) 미확인 → 사슬 끝(루트). 생년·출생국은 기억 기반. |
| stl_pour_moi | Pour Moi | pensioned | - | low | 위키백과 infobox: 부 Montjeu, 2008년 1월 10일 생, 아일랜드. 계류 장소 최신 기재 불충분 → 비현역 처리. 모부 Darshaan(미수록). |
| stl_pulpit | Pulpit | pensioned | - | low | 부 A.P. Indy, 1993년 생(기억 기반), 미국. 계류 상태 미확인 → 비현역 처리. |
| stl_seattle_slew | Seattle Slew | historical | - | low | 부 Bold Reasoning(미수록)으로 사슬 끝(루트). 1974년 생, 미국, 사망 여부 모두 기억 기반. |
| stl_shamardal | Shamardal | pensioned | - | low | 위키백과 infobox: 부 Giant's Causeway, 모부 Machiavellian(미수록), 2002년 생(기억 기반), 미국. 계류 장소 미확인 → 비현역 처리. |
| stl_smart_strike | Smart Strike | pensioned | - | low | 부 Mr. Prospector, 1992년 생(기억 기반), 미국. 계류 상태 미확인 → 비현역 처리. |
| stl_storm_bird | Storm Bird | pensioned | - | low | 위키백과 infobox: 부 Northern Dancer, 1978년 4월 19일 생, 캐나다. 사망 여부 미확인 → 비현역 처리. |
| stl_storm_cat | Storm Cat | pensioned | - | low | 부 Storm Bird, 1983년 생, 미국은 기억 기반(위키 항목에 계보 필드 파싱 실패). 사망 여부 기재 미확인 → 비현역 처리. |
| stl_australia | Australia | active | IE | medium | 위키백과 infobox: 부 Galileo, 모부 Cape Cross, 2011년 4월 8일 생. 출생국 GB 는 기억 기반(infobox 미기재). "He is standing at [목장]" → 현역 IE. |
| stl_bolt_d_oro | Bolt d'Oro | active | US | medium | 위키백과 infobox: 부 Medaglia d'Oro, 모부 A.P. Indy(미수록), 2015년 3월 17일 생, 미국. "retired to stud at [목장]" 기재, 사망 기재 없음 → 현역 US(더트). 최신 연도 미확인. |
| stl_camelot | Camelot | active | IE | medium | 위키백과 infobox: 부 Montjeu, 모부 Kingmambo(미수록), 2009년 3월 15일 생, 영국. "Camelot stands as a stallion at [목장]" 기재 → 현역 IE. |
| stl_charm_spirit | Charm Spirit | active | FR | medium | 위키백과: 부 Invincible Spirit, 모부 Montjeu, 2011년 2월 26일 생, 아일랜드산·프랑스 조교. "Charm Spirit stands at the [목장]" 기재 → 현역 FR. |
| stl_churchill | Churchill | active | IE | medium | 위키백과: 부 Galileo, 2014년 1월 31일 생, 아일랜드. [목장] 은퇴·계류 기재 → 현역 IE. |
| stl_dubawi | Dubawi | active | GB | medium | 위키백과 infobox: 부 Dubai Millennium, 2002년 생, 아일랜드. "Dubawi stands ... at [목장] (2023 fee)" 기재 → 현역 GB. |
| stl_essential_quality | Essential Quality | active | US | medium | 위키백과 infobox: 부 Tapit, 모부 Elusive Quality(미수록), 2018년 생, 미국. "His stud fee for the 2025 breeding season is [종부료]" 기재 → 현역 US(더트). 계류 장소 미명기 → 미국 추정. |
| stl_flightline | Flightline | active | US | medium | 위키백과 infobox: 부 Tapit, 모부 Indian Charlie(미수록), 2018년 3월 14일 생, 미국. "His 2026 stud fee was [종부료]" 기재 → 현역 US(더트). 계류 장소 미명기 → 미국 추정. |
| stl_frankel | Frankel | active | GB | medium | 위키백과 infobox: 부 Galileo, 모부 Danehill, 2008년 생, 영국. [목장] 계류 기재 → 현역 GB. |
| stl_ghaiyyath | Ghaiyyath | active | IE | medium | 위키백과: 부 Dubawi, 2015년 4월 19일 생, 아일랜드. "retired from racing to stand as a breeding stallion at [목장] in 2021" 기재 → 현역 IE. |
| stl_gleneagles | Gleneagles | active | IE | medium | 위키백과: 부 Galileo, 2012년 1월 12일 생, 아일랜드. [목장] 종마 은퇴 기재 → 현역 IE. |
| stl_golden_horn | Golden Horn | active | GB | medium | 위키백과 infobox: 부 Cape Cross, 2012년 3월 27일 생, 영국. "currently standing as a breeding stallion at [목장]" 기재 → 현역 GB. |
| stl_good_magic | Good Magic | active | US | medium | 위키백과 infobox: 부 Curlin, 모부 Hard Spun(미수록), 2015년 3월 1일 생, 미국. "From 2019 Good Magic stands at [목장]" 기재 → 현역 US(더트). |
| stl_holy_roman_emperor | Holy Roman Emperor | active | IE | medium | 위키백과: 부 Danehill, 2004년 생, 아일랜드. [목장] 셔틀 종마로 "active sire" 기재 → 현역 IE. 모부 Secretariat(미수록). |
| stl_into_mischief | Into Mischief | active | US | medium | 위키백과 infobox: 2005년 3월 28일 생, 미국. 부 Harlan's Holiday(1999년 생, 사망 기재), 모부 Tricky Creek(미수록). "retired to stud at [목장]" 기재 → 현역 US(더트). 부 Harlan 계보는 항목 미확인 → Harlan's Holiday 를 루트 처리. |
| stl_kingman | Kingman | active | GB | medium | 위키백과 "Kingman (British horse)": 부 Invincible Spirit, 모부 Zamindar(미수록), 2011년 2월 26일 생, 영국. 계류지 문장 미확인 → GB 는 기억 기반. 확인 필요. |
| stl_life_is_good | Life Is Good | active | US | medium | 위키백과 infobox: 부 Into Mischief, 2018년 4월 22일 생, 미국. "Life Is Good would take up stallion duties at [목장]" 기재 → 현역 US(더트). |
| stl_lope_de_vega | Lope de Vega | active | IE | medium | 위키백과: 부 Shamardal, 2007년 2월 19일 생, 아일랜드. "In 2011 ... stood at [목장], Ireland", "current breeding stallion" 기재 → 현역 IE. |
| stl_makfi | Makfi | active | GB | medium | 위키백과: 부 Dubawi, 모부 Green Desert, 2007년 3월 4일 생, 영국. "retired to [목장] in Gloucestershire" 기재, 사망 기재 없음 → 현역 GB. |
| stl_night_of_thunder | Night of Thunder | active | IE | medium | 위키백과 infobox: 부 Dubawi, 모부 Galileo, 2011년 생, 아일랜드. [목장] 계류 기재 → 현역 IE. |
| stl_persian_king | Persian King | active | FR | medium | 위키백과 infobox: 부 Kingman, 2016년 2월 18일 생, 아일랜드. "After his retirement from racing in October 2020 Persian King became a breeding stallion at the [목장] in Normandy" 기재 → 현역 FR. 모부 Dylan Thomas(미수록). |
| stl_practical_joke | Practical Joke | active | US | medium | 위키백과 infobox: 부 Into Mischief, 모부 Distorted Humor(미수록), 2014년 4월 15일 생, 미국. 2018년·2022년 종부료 기재. 계류 장소 명시 없음 → 미국 추정. 확인 필요. |
| stl_sea_the_stars | Sea the Stars | active | IE | medium | 위키백과 infobox: 부 Cape Cross, 2006년 4월 6일 생, 아일랜드. "would stand at the [목장] in Ireland" 기재 → 현역 IE(최근 연도 미확인). |
| stl_siyouni | Siyouni | active | FR | medium | 위키백과 infobox: 부 Pivotal, 모부 Danehill, 2007년 2월 14일 생, 프랑스. "retired to the [목장] in France" 기재 → 현역 FR. |
| stl_tapit | Tapit | active | US | medium | 부 Pulpit, 2001년 생(기억 기반), 미국. "retired to stud at [목장] in [미국 목장 지역] in 2005", 종부료 기재, 사망 기재 없음 → 현역 US(더트). |
| stl_teofilo | Teofilo | active | IE | medium | 위키백과: 부 Galileo, 모부 Danehill, 2004년 생, 아일랜드. "He is currently standing at stud in County Kildare", "stands as a stallion for the [목장]" 기재 → 현역 IE. |
| stl_too_darn_hot | Too Darn Hot | active | GB | medium | 위키백과 infobox: 부 Dubawi, 2016년 3월 27일 생, 영국. "became a breeding stallion at the [목장]" 기재 → 현역 GB. |
| stl_ulysses | Ulysses | active | GB | medium | 위키백과: 부 Galileo, 2013년 3월 20일 생, 아일랜드산·영국 조교. "would begin his career as a breeding stallion at the [목장]" 기재 → 현역 GB. 출생국은 IE(아일랜드산). |
| stl_vino_rosso | Vino Rosso | active | US | medium | 위키백과 infobox: 부 Curlin, 모부 Street Cry(미수록), 2015년 생, 미국. "As of 2023 he stands for a stud fee of [종부료]" → 현역 US(더트). |
| stl_violence | Violence | active | US | medium | 위키백과 infobox: 부 Medaglia d'Oro, 모부 Gone West, 2010년 3월 21일 생, 미국. "entered into a stud career at [목장] in 2014" 기재 → 현역 US(더트). |
| stl_ap_indy | A.P. Indy | pensioned | - | medium | 부 Seattle Slew, 1989년 생, 미국은 기억 기반(위키 항목 미확인). 사망 여부 미확인 → 비현역. |
| stl_cape_cross | Cape Cross | historical | - | medium | 위키백과 infobox: 부 Green Desert, 1994년 3월 13일 생, 아일랜드. 사망 기재는 위키백과 단편 근거(연도 미확인). 모부 Ahonoora(미수록). |
| stl_danehill | Danehill | historical | - | medium | 부 Danzig, 1986년 생, 미국 출생, 2003년 사망은 모두 기억 기반(Danehill 위키 항목 조회 실패). 출생국과 사망 연도 검증 필요. |
| stl_giant_causeway | Giant's Causeway | historical | - | medium | 위키백과 infobox: 부 Storm Cat, 모부 미확인(None), 1997년 생, 미국. 2018년 사망 기재(위키 인용 제목 "dies at 21") → historical. |
| stl_harlans_holiday | Harlan's Holiday | historical | - | medium | 위키백과 infobox: 1999년 생, 미국. 부 Harlan(항목 미확인, 루트 처리). 2012년 최고 2세 종마였으나 안락사 기재 → historical. |
| stl_nearco | Nearco | historical | - | medium | 부 Pharos 는 기억 기반(위키 항목 미확인). 1935년 생, 이탈리아 출생은 기억 기반. |
| stl_seeking_the_gold | Seeking the Gold | pensioned | - | medium | 부 Mr. Prospector 는 위키백과 Dubai Millennium 항목 infobox 로 확인(Seeking The Gold). 1986년 생과 사망 여부는 기억 기반, 미확인 → 비현역. |
| stl_dansili | Dansili | historical | - | high | 위키백과 infobox: 부 Danehill, 1996년 1월 27일 생, 영국. 모부 Kahyasi(미수록). 사망 기재. |
| stl_danzig | Danzig | historical | - | high | 위키백과 infobox: 부 Northern Dancer, 1977년 2월 12일 생, 미국. 사망 기재. 모부 Admiral's Voyage(미수록). |
| stl_dubai_millennium | Dubai Millennium | historical | - | high | 위키백과 infobox: 부 Seeking The Gold, 1996년 생, 영국. 2001년경 질병으로 사망 기재. 모부 Shareef Dancer(미수록). |
| stl_el_prado | El Prado | historical | - | high | 위키백과 infobox: 부 Sadler's Wells, 1989년 2월 3일 생, 아일랜드. 사망 기재. 모부 Sir Ivor(미수록). |
| stl_galileo | Galileo | historical | - | high | 위키백과 infobox: 부 Sadler's Wells, 1998년 생, 아일랜드. 2021년 7월 안락사 기재. 모부 Miswaki(미수록). |
| stl_gone_west | Gone West | historical | - | high | 위키백과 infobox: 부 Mr. Prospector, 1984년 생, 안락사 기재. 모부 Secretariat(미수록). |
| stl_green_desert | Green Desert | historical | - | high | 위키백과 infobox: 부 Danzig, 1983년 4월 16일 생, 미국. 2015년 9월 안락사 기재. 모부 Sir Ivor(미수록). |
| stl_montjeu | Montjeu | historical | - | high | 위키백과: 부 Sadler's Wells, 1996년 4월 4일 생, 아일랜드. 2012년 3월 사망 기재. 모부 Top Ville(미수록). |
| stl_mr_prospector | Mr. Prospector | historical | - | high | 위키백과 infobox: 부 Raise a Native, 1970년 생. 모부 Nashua(미수록). |
| stl_native_dancer | Native Dancer | historical | - | high | 위키백과 infobox: 부 Polynesian, 모부 Discovery(미수록), 1950년 생. |
| stl_northern_dancer | Northern Dancer | historical | - | high | 위키백과 infobox: 부 Nearctic, 모부 Native Dancer, 1961년 생, 캐나다(Oshawa). CountryCode CA 추가 반영. |
| stl_nureyev | Nureyev | historical | - | high | 위키백과 infobox: 부 Northern Dancer, 1977년 5월 2일 생, 미국. 모부 Forli(미수록). 사망 기재. |
| stl_phalaris | Phalaris | historical | - | high | 위키백과 infobox: 부 Polymelus, 1913년 생, 영국. 모부 Sainfoin(미수록). |
| stl_pharos | Pharos | historical | - | high | 위키백과 infobox: 부 Phalaris, 1920년 생, 영국. 1937년 사망 기재. |
| stl_pivotal | Pivotal | historical | - | high | 위키백과 infobox: 부 Polar Falcon, 모부 Cozzene(미수록), 1993년 1월 19일 생, 영국. 2021년 11월 19일 사망 기재 → historical. |
| stl_polynesian | Polynesian | historical | - | high | 위키백과 infobox: 부 Unbreakable, 1942년 3월 8일 생, 미국. 모부 Polymelian(미수록). Unbreakable 연결로 네이티브댄서계가 노던댄서계의 하위가 됨. |
| stl_raise_a_native | Raise a Native | historical | - | high | 위키백과 infobox: 부 Native Dancer, 1961년 생, 1988년 안락사 기재. 모부 Case Ace(미수록). |
| stl_sadlers_wells | Sadler's Wells | historical | - | high | 위키백과 infobox: 부 Northern Dancer, 1981년 4월 11일 생, 미국. 사망 기재. 모부 Bold Reason(미수록). |
| stl_sickle | Sickle | historical | - | high | 위키백과 infobox: 부 Phalaris, 모부 Chaucer(미수록), 1924년 2월 8일 생, 영국. 1943년 사망 기재. |
| stl_unbreakable | Unbreakable | historical | - | high | 위키백과 infobox: 부 Sickle, 모부 Prince Palatine(미수록), 1935년 생, 미국. 1952년 사망 기재. 손자 Native Dancer 를 통해 다수 혈통에 등장. |


## Opus 검수 보정 (2026-10-11, 2회 반려 후 직접 수정)
- 사망 확인 종마를 historical 로: Shamardal(2020), Storm Cat(2013), A.P. Indy(2020), Smart Strike, Pulpit, Polar Falcon, Seeking the Gold, Storm Bird.
- 2024년 현역으로 알려진 종마를 active 로: Curlin(US), Medaglia d'Oro(US), Nathaniel(GB) — confidence medium.
- 계통 구조: 루트 "Phalaris line" 추가. Northern Dancer line·Native Dancer line 을 그 하위로. Polymelus·Phalaris·Pharos·Sickle·Unbreakable·Polynesian·Nearco·Nearctic 은 Phalaris line 소속(기존에는 Northern Dancer line 으로 잘못 분류).
- Harlan(1989, Storm Cat 산) 추가 → Harlan's Holiday → Into Mischief 가 Storm Cat line 으로 연결. "Harlan's Holiday line" 루트 삭제.
- 시장 등급 조정: Lope de Vega 1, Night of Thunder 1, Camelot 2.
- 현역 수 목표(유럽 50·미국 15)는 위키백과 확인 가능 범위에서 달성 불가 → 1차분 하한(유럽 20·미국 10)으로 테스트 조정, 확장은 M2 후속 티켓.

## M2-01b 완료 반영 (2026-10-11, haiku-data, 반려 수정 2회차)

출처: 사용자 제공 2026 명단(그룹 A~H), 사용자 추가 제공 명단(그룹 I), 사용자 제공(2026-10-11, 4두 — 아래 "사용자 제공 추가 4두" 참조).
자료: 위키백과 원문(action=raw) 으로 출생연도·출생국·부·모부·거리/주로 성향을 확인. 계류국은 명단 기준(위키백과 계류 기재와 대조 안 함). 교배료 금액은 저장·기록하지 않고 marketTier(구간 규칙)로만 변환.

### 결과 요약
- 종마 총 172두 (기존 74 + 신규 98: 명단·사용자 추가 54두 + 계통 조상 44두). 명단 미포함 16두(아래).
- 현역(active) 88두: 유럽(GB/IE/FR/DE) 57두 (기준 50 충족), 미국 더트·양용 29두 (기준 15 충족).
- 계통 28개. 루트 7: Phalaris, Johannesburg, Caro, Gun Runner, Jack Christopher, Perfect Power, Dark Angel. (Seattle Slew 계통은 Phalaris 하위로 변경되어 루트가 아님.)
- 테스트: tests/data/stallions.test.ts 하한 유럽 ≥ 50, 미국 더트·양용 ≥ 15 복원. 현역 부계 사슬 깊이 ≥ 5 (자신 포함) 또는 아래 "미확인 고리" 예외 목록(테스트 상수 UNVERIFIED_CHAIN_ACTIVE_EXCEPTIONS 와 일치해야 함).
- 암말 이름·목장·회사·사람·마주·조교사·기수·스터드·레이스 이름은 데이터·테스트·본 문서 어디에도 없다.

### 명단 미포함 16두 (위키백과 항목 없음, 출생연도·부계 확인 불가 — 제외 유지, Opus·사용자 확인 대기)
Henri Matisse, Henry Longfellow, Sioux Nation, The Antarctic (그룹 A) / Domestic Product, Echo Town, Mo Town, Munnings (그룹 B) / Territories, Triple Time (그룹 C) / Enticed, Mystic Guide, Proxy, Speaker's Corner (그룹 F) / Bated Breath, Lead Artist (그룹 G).

### 사용자 제공 추가 4두 (2026-10-11, 위키백과 미확인 항목은 사용자 정보로 기입)
- Zarak (FR, 2013, 부 Dubawi, 모부 없음): active, standsIn FR, tier 2, middle, turf, high. 근거: 사용자 제공(2026-10-11) · 거리 middle(G1 2,400m 우승).
- Erevann (FR, 2019, 부 Dubawi, 모부 Siyouni): active, standsIn FR, tier 5 (구간 규칙), mile, turf, high. 근거: 사용자 제공(2026-10-11) · 거리 mile(G2 우승 마일러).
- Iffraaj (GB, 2001, 부 Zafonic, 모부 Nureyev): active, standsIn GB, tier 4 (등급 미상 — 비공개 규칙과 같게 4), sprint, turf, medium. 근거: 사용자 제공(2026-10-11) · 거리 sprint(G2 6~7f 우승) · 등급 미상.
- Camille Pissarro (IE, 2022, 부 Wootton Bassett, 모부 없음): active, standsIn IE, tier 3, middle, turf, high. 근거: 사용자 제공(2026-10-11) · 거리 middle(G1 1,400m·2,100m 우승, M2-15 재분류 예정).
- 사용자 추가 정보 중 인명·마주·조교사·기수·스터드·레이스 이름과 실제 금액은 기록하지 않았다.
- 조상 추가: Zafonic (US, 1990, 부 Gone West, historical, 위키백과 사망 2002), Wootton Bassett (GB, 2008, 부 Iffraaj, historical — 위키백과 2025년 사망 분류), 그 외 아래 사슬 조상.

### 사슬 연결 (위키백과 확인분)
- Seattle Slew ← Bold Reasoning(1968 US) ← Boldnesian(1963 US) ← Bold Ruler(1954 US) ← Nasrullah(1940 IE) ← Nearco(기존). 사망 기재: Bold Reasoning 1975, Boldnesian 1975 분류, Bold Ruler 1971, Nasrullah 1959 — 모두 historical. sl_seattle_slew 는 sl_phalaris 하위로 변경.
- Gun Runner ← Candy Ride(1999, 출생국 AR: CountryCode 'AR' 반영 완료) — Candy Ride 는 pensioned, 부는 미확인 고리(아래). confidence medium.
- Zafonic ← Gone West(기존). Iffraaj ← Zafonic. Wootton Bassett ← Iffraaj. Camille Pissarro ← Wootton Bassett.
- 조상 신규 목록: Bold Reasoning, Boldnesian, Bold Ruler, Nasrullah, Zafonic, Wootton Bassett, Candy Ride. 모두 marketTier 5 (사용자 정보 4두 제외). status: 사망 확인 historical, 그 외 pensioned. standsIn null.
- 사망 확인으로 historical 로 바꾼 기존 조상: Caro(1989, 분류), Siberian Express(1996, 분류), Wootton Bassett(2025, 분류). 이 세 마리는 모두 standsIn null.

### 미확인 고리 (위키백과에서 항목을 찾지 못했다 — 지어내지 않고 여기서 멈춤)
1. Jack Christopher ← Munnings: 부 란에 링크 없음, "Munnings" 는 성씨 동음이의 페이지만 있음. Munnings (horse) 등 404. 이후 Speightstown(기존 항목 있음, 부 Gone West)은 연결하지 못함.
2. Perfect Power ← Ardad: 위키백과 링크 Ardad (horse) 404(빨간 링크). "Ardad" 는 이란 도시 페이지. Kodiac(404), Danehill 연결 불가.
3. Johannesburg ← Hennessy: 부 란에 링크 없음, "Hennessy" 는 코냑 브랜드 페이지. Hennessy (horse) 404. Storm Cat 연결 불가.
4. Caro ← Fortino: 부 란에 링크 없음, "Fortino" 는 이름 동음이의 페이지만 있음. Fortino II 404. Grey Sovereign(기존 항목 있음, 부 Nasrullah)은 연결하지 못함. Caro 는 historical(1989 사망).
5. Dark Angel ← Acclamation (British horse): 위키백과 링크 404(재확인 2회). "Acclamation" 은 일반 명사 페이지, Acclamation (horse) 는 2006년생 미국 종마로 Dark Angel 의 부가 될 수 없어 사용하지 않음. Royal Applause(1993 GB, 항목 있음)·Waajib(404)도 연결하지 못함.
6. Candy Ride ← Ride the Rails (USA): 부 란에 링크 없음, Ride the Rails (horse) 404. Cryptoclearance(1984 US, 항목 있음, 부 Fappiano)는 Ride the Rails 를 거치지 않으면 연결할 수 없어 추가하지 않음.

### 영향받는 현역 종마 (깊이 < 5, 테스트 예외 목록과 일치)
Jack Christopher(1), Perfect Power(1), Harry Angel(2, 부 Dark Angel 미확인), Gunite(3), Sierra Leone(3), No Nay Never(3, 부 Scat Daddy → Johannesburg 미확인), Justify(3, 같음), Blackbeard(4), City of Troy(4), Little Big Bear(4).
- 주의: world.test 의 "플레이어 암말 혈통" 검사는 부측 사슬 깊이 4 이상을 요구한다. 위 현역 종마들은 미확인 고리 때문에 깊이를 채울 수 없어, 해당 종마가 플레이어 암말의 부로 뽑히는 시드에서 실패한다(seed 20260107 등). Opus 결정 필요(아래 질문 참조).

### 명단 종마 50두 + 사용자 4두 (그룹별 — 이름만)
- 그룹 A (IE): Auguste Rodin, Blackbeard, City of Troy, Delacroix, Footstepsinthesand, Little Big Bear, No Nay Never, Paddington, Saxon Warrior, St Mark's Basilica, Starspangledbanner
- 그룹 B (US): Citizen Bull, Corniche, Epicenter, Fierceness, Golden Pal, Gunite, Jack Christopher, Justify, Sierra Leone, Tiz The Law
- 그룹 C (GB): Cracksman, Farhh, Harry Angel, Masar, Modern Games, Palace Pier, Perfect Power, Pinatubo
- 그룹 D (FR): Cloth of Stars, Victor Ludorum
- 그룹 E (IE): Blue Point, Earthlight, Native Trail, Naval Crown, Raven's Pass, Space Blues
- 그룹 F (US): Cody's Wish, Frosted, Hard Spun, Maxfield, Midshipman, Nyquist, Street Sense
- 그룹 G (GB): Chaldean, Oasis Dream
- 그룹 H (US): Elite Power, Mandaloun
- 그룹 I (명단 추가분): Vadeni (계류 IE 기본값, 출생 FR), Daryz (계류 FR 기본값, 출생 IE)
- 사용자 추가 4두: Zarak, Erevann, Iffraaj, Camille Pissarro
- 기존 갱신 17두(1차 반영): Australia, Camelot, Churchill, Gleneagles, Holy Roman Emperor, Practical Joke, Dubawi, Too Darn Hot, Ghaiyyath, Night of Thunder, Teofilo, Essential Quality, Medaglia d'Oro, Frankel, Kingman, Sea The Stars, Siyouni.
- 명단 표기 보정: Territories, Cloth of Stars, Footstepsinthesand, Medaglia d'Oro.

### 계통 조상 (명단 외 — 사슬 확보용)
Deep Impact, Sunday Silence, Halo, Hail to Reason, Turn-to, Royal Charger, Scat Daddy, Johannesburg, Quality Road, Elusive Quality, Not This Time, City of Light, Uncle Mo, Indian Charlie, In Excess, Siberian Express, Caro, Dark Angel, Street Cry, Machiavellian, Unbridled's Song, Unbridled, Fappiano, Choisir, Danehill Dancer, Constitution, New Approach, Gun Runner, Kingmambo, Vindication, Empire Maker, Forestry, Bernardini, Half Ours, Malibu Moon, Dixieland Band, Stay Thirsty, Bold Reasoning, Boldnesian, Bold Ruler, Nasrullah, Zafonic, Wootton Bassett, Candy Ride.
- 모부 연결은 파일 안 종마만(나머지 null). 명단 종마 신규 중 모부 null 다수.

### 상태(status)·시장 등급(marketTier)
- 명단·사용자 종마: active, standsIn = 명단 계류국(사용자 4두 포함), confidence high(Iffraaj 제외 medium).
- 조상: historical 은 위키백과 본문 사망 기재·사망 분류가 확인된 경우만. 그 외 pensioned. 조상 standsIn null.
- 조상 시장 등급 5(사용자 정보 없음), 기존 조상 등급은 이전 값 유지.

### 계통 구조 (sire_lines.json)
- 신설 9: Sunday Silence line(parent Phalaris), Deep Impact line(parent Sunday Silence), Scat Daddy line(parent Johannesburg), 루트 Johannesburg·Caro·Gun Runner·Jack Christopher·Perfect Power·Dark Angel line.
- 변경: Seattle Slew line 의 parentLineId null → Phalaris (Seattle Slew 루트 해소).
- 총 28. 루트 7.

### 거리·주로 성향 (휴리스틱, M2-15 에서 재분류)
- 명단 종마와 조상: 위키백과 본문 경주 거리·dirt/turf 언급 기반 자동 추정. 수동 보정: Justify·Epicenter·Street Sense = mile/dirt, Deep Impact = middle/turf, Sunday Silence = middle/both, Scat Daddy = mile/both.
- 사용자 4두: 사용자 정보 값(위 참조).

### 검증 (반려 수정 2회차)
- npx vitest run tests/data/stallions.test.ts: 18/18 통과 (현역 부계 깊이 예외 테스트 추가 포함).
- 전체 npm test: tests/engine/world.test.ts "플레이어 암말 혈통" 1건 실패 (위 "영향받는 현역 종마" 참조). 나머지 통과.
- npm run typecheck, npm run lint: 통과.

### Opus 질문
1. world.test "플레이어 암말 혈통"(부측 깊이 ≥ 4): 현역 종마 중 깊이 3 이하 6두(Gunite, Sierra Leone, No Nay Never, Justify 등)는 미확인 고리(Johannesburg·Candy Ride·Munnings·Ardad 등)로 데이터만으로는 채울 수 없다. 선택: (a) 위키백과 재확인 대기(위 6개 링크 중 404 항목) (b) 해당 종마의 cover 대상(src/engine/state/world.ts 의 isCoverSire 가 active 포함)에 대한 엔진 규칙 변경 (c) 테스트 기준 조정. 판단 필요.
2. 명단 미포함 16두 처리(제외 유지 또는 다른 출처 확보).
3. 미확인 고리 6건 수용 여부.
4. 거리·성향 휴리스틱 값 검수는 M2-15 로 이관.

## M2-15 실명 종마 거리 프로필 재분류 (haiku-data, 2026-10-11)

- 방법: 종마별 위키백과 원문(action=raw)의 주요 우승 목록(race 필드)을 읽고, 각 우승 레이스 문서의 등급(class/grade)과 거리를 확인했다. 레이스명은 이 표에 적지 않았다. 판정은 명세 규칙(최고 등급 우승, 구간 경계 9f/11f/13.5f, 동률이면 짧은 쪽)을 따랐다.
- 출처 구분: 인포박스 = 주요 우승 목록 기준(기본). 기록표 = 위키백과 성적표 기준. 본문 = 본문 서술 기준(1건, 확신 낮음). 사용자 = 사용자 제공 4두.
- 확신도: high = 같은 구간 최고 등급 우승 2회 이상. medium = 1회. low = 구간 동률·혼재, 또는 본문 기준.
- 거리 표기: 우승 거리를 100m 단위로 반올림(예: 2,414m → 2,400m). 구간 경계는 원 거리(m)로 판정.
- 한계: 위키백과 주요 우승 목록에 없는 우승은 집계하지 않았다. 레이스 등급·거리는 해당 레이스 문서의 현재 값을 썼다. 성적표 등급 칸이 비어 있는 우승은 세지 않았다.
- 결과: 바뀜 53두, 유지 104두, 미확인 15두 (총 172두). 전 종마 대상(현역·비현역·historical).
- 동률 규칙 적용 예: Golden Horn 은 중거리(2,400m)·클래식(2,000m) 최고 등급 우승이 각 2회여서 짧은 쪽(classic)을 택했다. 검수 필요.
- 사용자 제공 참고값 4두(Zarak, Erevann, Iffraaj, Camille Pissarro)는 사용자 정보를 그대로 적용했다. Camille Pissarro 는 명세 규칙의 동률 처리(1,400m 1회 vs 2,100m 1회 → speed)와 다르다. 사용자 판정(classic)을 따른 것이므로 확인이 필요하다.
- 출생연도 불일치 3두(Polymelus, Seeking the Gold, Pulpit): 위키백과 연도와 데이터 foaled 가 다르다. 이번 티켓은 distanceProfile 만 수정하므로 foaled 는 바꾸지 않았다. Opus 확인 필요.

| key | 종마 | 상태 | 이전 | 새 값 | 근거(등급·거리×우승 수) | 출처 | 확신도 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_auguste_rodin | Auguste Rodin | 현역 | `speed` | `middle` | G1 1,600m×1, 1,800m×1, 2,000m×2, 2,400m×3 | 인포박스 | low | 구간 혼재: `speed` 2, `middle` 3, `classic` 2 |
| stl_australia | Australia | 현역 | `middle` | `middle` (유지) | G1 1,800m×1, 2,100m×1, 2,400m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `middle` 2, `classic` 1 |
| stl_blackbeard | Blackbeard | 현역 | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_blue_point | Blue Point | 현역 | `speed` | `speed` (유지) | G1 1,000m×2, 1,200m×2 | 인포박스 | high |  |
| stl_bolt_d_oro | Bolt d'Oro | 현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,700m×1 | 인포박스 | high |  |
| stl_camelot | Camelot | 현역 | `middle` | `middle` (유지) | G1 1,600m×1, 2,400m×3 | 인포박스 | low | 구간 혼재: `speed` 1, `middle` 3 |
| stl_camille_pissarro | Camille Pissarro | 현역 | `middle` | `classic` | 사용자 제공 G1 1,400m·G1 2,100m | 사용자 | high |  |
| stl_chaldean | Chaldean | 현역 | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_charm_spirit | Charm Spirit | 현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×2 | 인포박스 | high |  |
| stl_churchill | Churchill | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_citizen_bull | Citizen Bull | 현역 | `speed` | `speed` (유지) | G1 1,700m×2 | 인포박스 | high |  |
| stl_city_of_troy | City of Troy | 현역 | `speed` | `classic` | G1 1,400m×1, 2,000m×1, 2,100m×1, 2,400m×1 | 인포박스 | low | 기록표 판정 speed 과 불일치. 구간 혼재: `speed` 1, `middle` 1, `classic` 2 |
| stl_cloth_of_stars | Cloth of Stars | 현역 | `speed` | `classic` | G1 2,100m×1 | 인포박스 | medium |  |
| stl_codys_wish | Cody's Wish | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×3 | 인포박스 | high |  |
| stl_corniche | Corniche | 현역 | `speed` | `speed` (유지) | G1 1,700m×2 | 인포박스 | high |  |
| stl_cracksman | Cracksman | 현역 | `cup` | `classic` | G1 2,000m×2, 2,100m×1, 2,400m×1 | 인포박스 | low | 구간 혼재: `classic` 3, `middle` 1 |
| stl_curlin | Curlin | 현역 | `middle` | `classic` | G1 1,800m×2, 1,900m×1, 2,000m×4 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 5 |
| stl_daryz | Daryz | 현역 | `speed` | `cup` | G1 2,800m×1 | 본문 | low | 본문 기록 1건(기록표 없음). |
| stl_delacroix | Delacroix | 현역 | `speed` | `classic` | G1 2,000m×2 | 기록표 | high |  |
| stl_dubawi | Dubawi | 현역 | `middle` | `speed` | G1 1,400m×1, 1,600m×2 | 인포박스 | high |  |
| stl_earthlight | Earthlight | 현역 | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_elite_power | Elite Power | 현역 | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_epicenter | Epicenter | 현역 | `speed` | `classic` | G1 2,000m×1 | 인포박스 | medium |  |
| stl_erevann | Erevann | 현역 | `speed` | `speed` (유지) | 사용자 제공 G2 마일 | 사용자 | high |  |
| stl_essential_quality | Essential Quality | 현역 | `speed` | `speed` (유지) | G1 1,700m×2, 1,800m×1, 2,000m×1, 2,400m×2 | 인포박스 | low | 구간 혼재: `speed` 3, `classic` 1, `middle` 2 |
| stl_farhh | Farhh | 현역 | `middle` | `classic` | G1 1,600m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 2 |
| stl_fierceness | Fierceness | 현역 | `speed` | `speed` (유지) | G1 1,700m×1, 1,800m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 2 |
| stl_flightline | Flightline | 현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 2 |
| stl_footstepsinthesand | Footstepsinthesand | 현역 | `speed` | `speed` (유지) | G3 1,400m×1 | 인포박스 | medium |  |
| stl_frankel | Frankel | 현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×6, 2,000m×2, 2,100m×1 | 인포박스 | low | 구간 혼재: `speed` 7, `classic` 3 |
| stl_frosted | Frosted | 현역 | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×2 | 인포박스 | high |  |
| stl_ghaiyyath | Ghaiyyath | 현역 | `middle` | `classic` | G1 2,000m×1, 2,100m×1, 2,400m×2 | 인포박스 | low | 구간 혼재: `middle` 2, `classic` 2 |
| stl_gleneagles | Gleneagles | 현역 | `middle` | `speed` | G1 1,400m×1, 1,600m×2 | 인포박스 | high |  |
| stl_golden_horn | Golden Horn | 현역 | `middle` | `classic` | G1 2,000m×2, 2,400m×2 | 인포박스 | low | 구간 혼재: `middle` 2, `classic` 2 |
| stl_golden_pal | Golden Pal | 현역 | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 turf |
| stl_good_magic | Good Magic | 현역 | `speed` | `speed` (유지) | G1 1,700m×1, 1,800m×2 | 인포박스 | high |  |
| stl_gunite | Gunite | 현역 | `speed` | `speed` (유지) | G1 1,400m×2 | 인포박스 | high |  |
| stl_hard_spun | Hard Spun | 현역 | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_harry_angel | Harry Angel | 현역 | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_holy_roman_emperor | Holy Roman Emperor | 현역 | `middle` | `speed` | G1 1,200m×1, 1,400m×1 | 인포박스 | high |  |
| stl_iffraaj | Iffraaj | 현역 | `speed` | `speed` (유지) | 사용자 제공 G2 6~7f | 사용자 | high |  |
| stl_into_mischief | Into Mischief | 현역 | `speed` | `speed` (유지) | G2 1,700m×1 | 인포박스 | medium |  |
| stl_jack_christopher | Jack Christopher | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_justify | Justify | 현역 | `speed` | `classic` | G1 1,900m×2, 2,000m×2, 2,400m×2 | 인포박스 | low | 구간 혼재: `classic` 4, `middle` 2 |
| stl_kingman | Kingman | 현역 | `speed` | `speed` (유지) | G1 1,600m×4 | 인포박스 | high |  |
| stl_life_is_good | Life Is Good | 현역 | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×2 | 인포박스 | high |  |
| stl_little_big_bear | Little Big Bear | 현역 | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_lope_de_vega | Lope de Vega | 현역 | `middle` | `speed` | G1 1,600m×1, 2,100m×1 | 인포박스 | low | 구간 혼재: `classic` 1, `speed` 1 |
| stl_makfi | Makfi | 현역 | `speed` | `speed` (유지) | G1 1,600m×1 | 인포박스 | medium |  |
| stl_mandaloun | Mandaloun | 현역 | `speed` | `classic` | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_masar | Masar | 현역 | `speed` | `middle` | G1 2,400m×1 | 인포박스 | medium |  |
| stl_maxfield | Maxfield | 현역 | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_medaglia_d_oro | Medaglia d'Oro | 현역 | `speed` | `speed` (유지) | G1 1,800m×2, 2,000m×1 | 인포박스 | low | 구간 혼재: `classic` 1, `speed` 2 |
| stl_midshipman | Midshipman | 현역 | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_modern_games | Modern Games | 현역 | `speed` | `speed` (유지) | G1 1,600m×5 | 인포박스 | high |  |
| stl_nathaniel | Nathaniel | 현역 | `middle` | `classic` | G1 2,000m×1, 2,400m×1 | 인포박스 | low | 구간 혼재: `middle` 1, `classic` 1 |
| stl_native_trail | Native Trail | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_naval_crown | Naval Crown | 현역 | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_night_of_thunder | Night of Thunder | 현역 | `speed` | `speed` (유지) | G1 1,600m×1 | 인포박스 | medium |  |
| stl_no_nay_never | No Nay Never | 현역 | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_nyquist | Nyquist | 현역 | `speed` | `speed` (유지) | G1 1,800m×1 | 본문 | low | 본문 기록 1건(기록표 없음). |
| stl_oasis_dream | Oasis Dream | 현역 | `speed` | `speed` (유지) | G1 1,000m×1, 1,200m×2 | 인포박스 | high |  |
| stl_paddington | Paddington | 현역 | `speed` | `speed` (유지) | G1 1,600m×3, 2,000m×1 | 인포박스 | low | 구간 혼재: `speed` 3, `classic` 1 |
| stl_palace_pier | Palace Pier | 현역 | `speed` | `speed` (유지) | G1 1,600m×5 | 인포박스 | high |  |
| stl_perfect_power | Perfect Power | 현역 | `speed` | `speed` (유지) | G1 1,200m×3 | 인포박스 | high |  |
| stl_persian_king | Persian King | 현역 | `speed` | `speed` (유지) | G1 1,600m×2, 1,800m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 1 |
| stl_pinatubo | Pinatubo | 현역 | `speed` | `speed` (유지) | G1 1,400m×3 | 인포박스 | high |  |
| stl_practical_joke | Practical Joke | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_ravens_pass | Raven's Pass | 현역 | `speed` | `classic` | G1 1,600m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 2 |
| stl_saxon_warrior | Saxon Warrior | 현역 | `speed` | `speed` (유지) | G1 1,600m×1 | 인포박스 | medium |  |
| stl_sea_the_stars | Sea The Stars | 현역 | `middle` | `middle` (유지) | G1 2,000m×2, 2,100m×1, 2,400m×4 | 인포박스 | low | 구간 혼재: `middle` 4, `classic` 3 |
| stl_shalaa | Shalaa | 현역 | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_sierra_leone | Sierra Leone | 현역 | `speed` | `speed` (유지) | G1 1,800m×2, 2,000m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 1 |
| stl_siyouni | Siyouni | 현역 | `middle` | `speed` | G1 1,400m×1 | 인포박스 | medium |  |
| stl_space_blues | Space Blues | 현역 | `speed` | `speed` (유지) | G1 1,300m×1, 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_st_marks_basilica | St Mark's Basilica | 현역 | `middle` | `classic` | G1 1,400m×1, 1,600m×1, 2,000m×2, 2,100m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 3 |
| stl_starspangledbanner | Starspangledbanner | 현역 | `speed` | `speed` (유지) | G1 1,100m×1, 1,200m×2, 1,600m×1 | 인포박스 | high |  |
| stl_street_sense | Street Sense | 현역 | `speed` | `speed` (유지) | G1 1,700m×1, 2,000m×1 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 1 |
| stl_tapit | Tapit | 현역 | `speed` | `speed` (유지) | G2 1,800m×1 | 인포박스 | medium |  |
| stl_teofilo | Teofilo | 현역 | `middle` | `speed` | G1 1,400m×2 | 인포박스 | high |  |
| stl_tiz_the_law | Tiz The Law | 현역 | `speed` | `speed` (유지) | G1 1,800m×1 | 본문 | low | 본문 기록 1건(기록표 없음). |
| stl_too_darn_hot | Too Darn Hot | 현역 | `speed` | `speed` (유지) | G1 1,400m×2, 1,600m×1 | 인포박스 | high |  |
| stl_ulysses | Ulysses | 현역 | `speed` | `classic` | G1 2,000m×1, 2,100m×1 | 인포박스 | high |  |
| stl_vadeni | Vadeni | 현역 | `speed` | `classic` | G1 2,000m×1, 2,100m×1 | 인포박스 | high |  |
| stl_victor_ludorum | Victor Ludorum | 현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×1 | 인포박스 | high |  |
| stl_vino_rosso | Vino Rosso | 현역 | `speed` | `classic` | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_violence | Violence | 현역 | `speed` | `speed` (유지) | G2 1,700m×1 | 인포박스 | medium |  |
| stl_zarak | Zarak | 현역 | `middle` | `middle` (유지) | 사용자 제공 G1 2,400m | 사용자 | high |  |
| stl_bernardini | Bernardini | 비현역 | `speed` | `classic` | G1 1,900m×1, 2,000m×2 | 인포박스 | high |  |
| stl_cacique | Cacique | 비현역 | `middle` | `classic` | G1 2,000m×1 | 인포박스 | medium |  |
| stl_candy_ride | Candy Ride | 비현역 | `speed` | `speed` (유지) | G1 1,600m×2, 2,000m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 1 |
| stl_choisir | Choisir | 비현역 | `speed` | `speed` (유지) | G1 1,000m×2, 1,200m×1 | 인포박스 | high |  |
| stl_city_of_light | City of Light | 비현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×1, 1,800m×1 | 인포박스 | high |  |
| stl_constitution | Constitution | 비현역 | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_dark_angel | Dark Angel | 비현역 | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_deep_impact | Deep Impact | 비현역 | `middle` | `middle` (유지) | G1 2,000m×1, 2,200m×1, 2,400m×2, 2,500m×1, 3,000m×1, 3,200m×1 | 인포박스 | low | 구간 혼재: `cup` 2, `classic` 2, `middle` 3 |
| stl_dixieland_band | Dixieland Band | 비현역 | `speed` | `speed` (유지) | G1 1,800m×1 | 인포박스 | medium |  |
| stl_empire_maker | Empire Maker | 비현역 | `speed` | `middle` | G1 1,800m×1, 2,400m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `middle` 2 |
| stl_fappiano | Fappiano | 비현역 | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×1 | 인포박스 | high |  |
| stl_gun_runner | Gun Runner | 비현역 | `speed` | `speed` (유지) | G1 1,800m×3, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 3, `classic` 2 |
| stl_hail_to_reason | Hail to Reason | 비현역 | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_half_ours | Half Ours | 비현역 | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_halo | Halo | 비현역 | `speed` | `classic` | G2 2,200m×1 | 인포박스 | medium |  |
| stl_indian_charlie | Indian Charlie | 비현역 | `speed` | `speed` (유지) | G1 1,800m×1 | 인포박스 | medium |  |
| stl_invincible_spirit | Invincible Spirit | 비현역 | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_johannesburg | Johannesburg | 비현역 | `speed` | `speed` (유지) | G1 1,200m×3, 1,700m×1 | 인포박스 | high |  |
| stl_new_approach | New Approach | 비현역 | `speed` | `speed` (유지) | G1 1,400m×2, 2,000m×2, 2,400m×2 | 인포박스 | low | 구간 혼재: `speed` 2, `middle` 2, `classic` 2 |
| stl_not_this_time | Not This Time | 비현역 | `speed` | `speed` (유지) | G3 1,600m×1 | 인포박스 | medium |  |
| stl_pour_moi | Pour Moi | 비현역 | `middle` | `middle` (유지) | G1 2,400m×2 | 인포박스 | high |  |
| stl_quality_road | Quality Road | 비현역 | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×2 | 인포박스 | high |  |
| stl_royal_charger | Royal Charger | 비현역 | `speed` | `speed` (유지) | G1 1,600m×1 | 인포박스 | medium |  |
| stl_stay_thirsty | Stay Thirsty | 비현역 | `speed` | `classic` | G1 2,000m×1 | 인포박스 | medium |  |
| stl_sunday_silence | Sunday Silence | 비현역 | `middle` | `classic` | G1 1,800m×1, 1,900m×2, 2,000m×3 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 5 |
| stl_turn_to | Turn-to | 비현역 | `speed` | `speed` (유지) | G2 1,200m×1 | 인포박스 | medium |  |
| stl_unbridled | Unbridled | 비현역 | `speed` | `classic` | G1 1,800m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 2 |
| stl_unbridleds_song | Unbridled's Song | 비현역 | `speed` | `speed` (유지) | G1 1,700m×1, 1,800m×1 | 인포박스 | high |  |
| stl_uncle_mo | Uncle Mo | 비현역 | `speed` | `speed` (유지) | G1 1,600m×1, 1,700m×1 | 인포박스 | high |  |
| stl_ap_indy | A.P. Indy | historical | `middle` | `speed` | G1 1,800m×1, 2,000m×1, 2,400m×1 | 인포박스 | low | 구간 혼재: `speed` 1, `middle` 1, `classic` 1 |
| stl_bold_reasoning | Bold Reasoning | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 both |
| stl_bold_ruler | Bold Ruler | historical | `speed` | `classic` | G1 1,900m×1 | 인포박스 | medium |  |
| stl_boldnesian | Boldnesian | historical | `speed` | `speed` (유지) | G1 1,800m×1 | 인포박스 | medium |  |
| stl_cape_cross | Cape Cross | historical | `speed` | `speed` (유지) | G1 1,600m×2 | 인포박스 | high |  |
| stl_caro | Caro | historical | `speed` | `classic` | G1 1,600m×1, 1,800m×1, 2,100m×1 | 인포박스 | low | 구간 혼재: `classic` 2, `speed` 1 |
| stl_danehill | Danehill | historical | `middle` | `speed` | G1 1,200m×2 | 인포박스 | high |  |
| stl_danehill_dancer | Danehill Dancer | historical | `speed` | `speed` (유지) | G1 1,200m×1, 1,400m×1 | 인포박스 | high |  |
| stl_dansili | Dansili | historical | `middle` | `speed` | G2 1,600m×1 | 인포박스 | medium |  |
| stl_danzig | Danzig | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 both |
| stl_dubai_millennium | Dubai Millennium | historical | `speed` | `classic` | G1 1,600m×2, 1,900m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 3 |
| stl_el_prado | El Prado | historical | `middle` | `speed` | G1 1,400m×1 | 인포박스 | medium |  |
| stl_elusive_quality | Elusive Quality | historical | `speed` | `speed` (유지) | G1 1,200m×1 | 인포박스 | medium |  |
| stl_forestry | Forestry | historical | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_galileo | Galileo | historical | `middle` | `middle` (유지) | G1 2,400m×4 | 인포박스 | high |  |
| stl_giant_causeway | Giant's Causeway | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 turf |
| stl_gone_west | Gone West | historical | `speed` | `speed` (유지) | G3 1,600m×1 | 인포박스 | medium |  |
| stl_green_desert | Green Desert | historical | `speed` | `speed` (유지) | G1 1,200m×2 | 인포박스 | high |  |
| stl_harlan | Harlan | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_harlans_holiday | Harlan's Holiday | historical | `speed` | `speed` (유지) | G1 1,800m×4 | 인포박스 | high |  |
| stl_in_excess | In Excess | historical | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×1 | 인포박스 | high |  |
| stl_kingmambo | Kingmambo | historical | `speed` | `speed` (유지) | G1 1,600m×3 | 인포박스 | high |  |
| stl_machiavellian | Machiavellian | historical | `speed` | `speed` (유지) | G1 1,200m×1, 1,400m×1 | 인포박스 | high |  |
| stl_malibu_moon | Malibu Moon | historical | `speed` | `speed` (유지) | G1 1,600m×1 | 본문 | low | 본문 기록 1건(기록표 없음). |
| stl_montjeu | Montjeu | historical | `cup` | `middle` | G1 2,100m×2, 2,400m×5 | 인포박스 | low | 구간 혼재: `classic` 2, `middle` 5 |
| stl_mr_prospector | Mr. Prospector | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_nasrullah | Nasrullah | historical | `speed` | `classic` | G1 2,000m×1 | 인포박스 | medium |  |
| stl_native_dancer | Native Dancer | historical | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×1, 1,900m×1, 2,000m×1, 2,400m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 2, `middle` 1 |
| stl_nearco | Nearco | historical | `middle` | `middle` (유지) | G1 2,400m×1 | 인포박스 | medium |  |
| stl_nearctic | Nearctic | historical | `middle` | `speed` | G2 1,200m×1 | 인포박스 | medium |  |
| stl_northern_dancer | Northern Dancer | historical | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×2, 1,900m×1, 2,000m×1 | 인포박스 | low | 구간 혼재: `speed` 3, `classic` 2 |
| stl_nureyev | Nureyev | historical | `speed` | `speed` (유지) | G3 1,400m×2 | 인포박스 | high |  |
| stl_phalaris | Phalaris | historical | `middle` | `speed` | G2 1,400m×2 | 인포박스 | high |  |
| stl_pharos | Pharos | historical | `middle` | `classic` | G1 2,000m×1 | 인포박스 | medium |  |
| stl_pivotal | Pivotal | historical | `middle` | `speed` | G1 1,000m×2 | 인포박스 | high |  |
| stl_polar_falcon | Polar Falcon | historical | `speed` | `speed` (유지) | G1 1,200m×1, 1,600m×1 | 인포박스 | high |  |
| stl_polymelus | Polymelus | historical | `middle` | `classic` | G1 2,000m×1 | 인포박스 | medium | 위키 출생연도 1902 ≠ 데이터 1907(미수정). |
| stl_polynesian | Polynesian | historical | `speed` | `classic` | G1 1,900m×1 | 인포박스 | medium |  |
| stl_pulpit | Pulpit | historical | `middle` | `speed` | G1 1,800m×1 | 인포박스 | medium | 위키 출생연도 1994 ≠ 데이터 1993(미수정). |
| stl_raise_a_native | Raise a Native | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_sadlers_wells | Sadler's Wells | historical | `middle` | `classic` | G1 1,600m×1, 2,000m×2 | 인포박스 | low | 구간 혼재: `speed` 1, `classic` 2 |
| stl_scat_daddy | Scat Daddy | historical | `speed` | `speed` (유지) | G1 1,600m×1, 1,800m×1 | 인포박스 | high |  |
| stl_seattle_slew | Seattle Slew | historical | `middle` | `speed` | G1 1,600m×1, 1,800m×1, 1,900m×1, 2,000m×1, 2,400m×1 | 인포박스 | low | 구간 혼재: `speed` 2, `classic` 2, `middle` 1 |
| stl_seeking_the_gold | Seeking the Gold | historical | `speed` | `speed` (유지) | G3 1,800m×1 | 인포박스 | medium | 위키 출생연도 1985 ≠ 데이터 1986(미수정). |
| stl_shamardal | Shamardal | historical | `speed` | `speed` (유지) | G1 1,400m×1, 1,600m×2, 2,100m×1 | 인포박스 | low | 구간 혼재: `speed` 3, `classic` 1 |
| stl_siberian_express | Siberian Express | historical | `speed` | `speed` (유지) | G1 1,200m×1, 1,600m×1 | 인포박스 | high |  |
| stl_sickle | Sickle | historical | `middle` | `middle` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 turf |
| stl_smart_strike | Smart Strike | historical | `middle` | `speed` | G3 1,600m×1, 1,700m×1 | 인포박스 | high |  |
| stl_storm_bird | Storm Bird | historical | `middle` | `speed` | G1 1,400m×2 | 인포박스 | high |  |
| stl_storm_cat | Storm Cat | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 both |
| stl_street_cry | Street Cry | historical | `speed` | `classic` | G1 1,800m×1, 1,900m×1, 2,000m×1 | 인포박스 | low | 구간 혼재: `classic` 2, `speed` 1 |
| stl_unbreakable | Unbreakable | historical | `speed` | `speed` (유지) | G2 1,200m×1 | 인포박스 | medium |  |
| stl_vindication | Vindication | historical | `speed` | `speed` (유지) | 사용자 확정 | 사용자 | high | 사용자 제공(2026-10-11) 확정 · 주로 dirt |
| stl_wootton_bassett | Wootton Bassett | historical | `speed` | `speed` (유지) | G1 1,400m×1 | 인포박스 | medium |  |
| stl_zafonic | Zafonic | historical | `speed` | `speed` (유지) | G1 1,200m×1, 1,400m×2, 1,600m×1 | 인포박스 | high |  |

## M2-01c 사용자 제공 종마 16두 + 부계 고리 5두 (haiku-data, 2026-10-11)

출처: 사용자 제공(2026-10-11) 명단 16두 + 부계 고리 5두. 사용자 원문의 사람·마주·조교사·스터드·레이스 이름과 금액은 데이터·테스트·본 문서 어디에도 기록하지 않았다. 위키백과 확인은 action=raw 원문으로 했다. 레이스명은 적지 않고 등급·거리만 적었다.

### 결과 요약
- 종마 203두 (기존 172 + 신규 31). 신규 구성: 명단 16두, 부계 고리 5두(Ardad, Hennessy, Fortino II, Acclamation, Ride the Rails), 계통 조상 10두(Grey Sovereign, Cryptoclearance, Royal Applause, Waajib, Try My Best, Speightstown, Ghostzapper, Awesome Again, Deputy Minister, Vice Regent).
- 잇기 6건(sireKey 갱신): Perfect Power→Ardad, Johannesburg→Hennessy, Caro→Fortino II, Dark Angel→Acclamation, Candy Ride→Ride the Rails, Jack Christopher→Munnings (Munnings 연결 성공).
- 계통 29개(+1: sl_ardad 루트). 계통 부모 재지정 6건: sl_perfect_power→sl_ardad, sl_johannesburg→sl_storm_cat, sl_caro→sl_phalaris, sl_dark_angel→sl_northern_dancer, sl_gun_runner→sl_mr_prospector, sl_jack_christopher→sl_mr_prospector.
- 현역(active) 105두: 유럽(GB/IE/FR/DE) 66두, 미국 더트·양용 37두, classic 18두.
- 현역 부계 깊이 예외: 이전 10두 중 9두 해소(Blackbeard, City of Troy, Gunite, Harry Angel, Jack Christopher, Justify, Little Big Bear, No Nay Never, Sierra Leone — 아래 "사슬 연결" 참조). Perfect Power 는 잔존하고, 신규 Ardad 가 추가되어 남은 예외는 2두: Ardad(speed), Perfect Power(speed). 원인은 아래 "미확인 고리" Kodiac.
- 테스트 상수 UNVERIFIED_CHAIN_ACTIVE_EXCEPTIONS = ['Ardad', 'Perfect Power'] 로 갱신.

### 미확인 고리 (null 처리)
- **Kodiac (Ardad 의 부)**: 위키백과 독립 항목을 찾지 못했다(Kodiac, Kodiac (horse), Kodiac (racehorse), Kodiac (stallion), Kodiac (Irish horse) 모두 404). Perfect Power 문서 조부 기재로 Ardad 의 부가 Kodiac 인 것은 확인되지만, Kodiac 의 출생연도·출생국·부를 확인할 수 없어 노드를 만들지 않았다. Ardad.sireKey = null, sl_ardad 루트. 그 결과 Ardad·Perfect Power 가 깊이 예외에 남는다.
- **Ardad (horse)** 항목도 404 (Perfect Power 문서가 링크하는 제목). Ardad 의 출생·계류는 사용자 제공값 그대로 사용.
- **Hennessy**: 위키백과 항목 없음(Hennessy (horse), Hennessy (racehorse) 404). Johannesburg 문서의 부 Hennessy 는 확인. 부 Storm Cat 은 명세의 Opus 판단 연결이며 위키백과에서 확인하지 못했다. 사망 기록 미확인 → pensioned, confidence medium.
- **Ride the Rails**: 위키백과 항목 없음(3개 제목 404). 부 Cryptoclearance 는 Candy Ride 문서 조부 기재로 확인. 사망·계류 미확인 → pensioned, confidence medium.
- **Waajib**: 항목 없음(Waajib, Waajib (horse) 404). Royal Applause 문서(부 Waajib, 조부 Try My Best, 1982 IRE, 1999 사망 기재)와 Try My Best 문서(자마 Waajib, b. 1983)로 연결. 출생연도 1982 와 1983 이 엇갈림 → 1982(RA 문서 pedigree 표) 채택, confidence medium.
- **Fortino II**: 위키백과는 "Fortino (FR) 1959" 로 표기(Caro 문서 부, Grey Sovereign 문서 자마 목록 "Fortino, sire of Caro"). 명단의 이름 Fortino II 를 쓰고 출생연도·출생국 일치로 같은 말로 연결. confidence medium.

### 위키백과 확인 결과 (연결 근거)
- Acclamation (GB, 1999–2024): Dark Angel 문서 부(Acclamation British horse), Royal Applause 문서 자마 목록. 2006년 미국산 동명 말(Acclamation American horse)과 다른 말이다. 2024 사망 → historical.
- Royal Applause (GB, 1993, 2022 사망): 부 Waajib 확인 → historical.
- Try My Best (US, 1975–1993): 부 Northern Dancer 확인 → historical.
- Grey Sovereign (GB, 1948, 1976 사망): 부 Nasrullah 확인 → historical.
- Cryptoclearance (US, 1984, 2009 사망): 부 Fappiano 확인 → historical.
- Speightstown (US, 1998, 2023 사망): 부 Gone West, 모부 Storm Cat 확인. 자마 목록에 Echo Town 확인.
- Munnings: Jack Christopher 문서 부 Munnings 와 조부 Speightstown 으로 확인.
- Mo Town (2014 수컷): Uncle Mo 문서 자마 목록 확인.
- Ghostzapper (US, 2000): 부 Awesome Again, 조부 Deputy Minister 확인. 2025 마지막 계류 해(고별 시즌) 기재 → pensioned.
- Awesome Again (CA, 1994, 2020 사망): 부 Deputy Minister 확인 → historical.
- Deputy Minister (CA, 1979, 사망 기재): 부 Vice Regent 확인 → historical.
- Vice Regent (CA, 1967, 1995 사망): 부 Northern Dancer 확인 → historical.

### 등급·거리·표면 근거 (조상)
- 거리는 위키백과 우승 기록의 거리로 M2-15 규칙(≤9f speed, ~11f classic, ~13.5f middle, 초과 cup)을 적용. 거리가 확인되지 않은 조상은 speed + confidence low.
- Ghostzapper: 기록 6회 중 5회가 9f 이하(G1 다수) → speed, medium (10f 우승 1회는 예외).
- Awesome Again: 확인된 우승 거리 9f 포함, 나머지 9f 이하 → speed, medium.
- Speightstown: 6~7f 스프린터, 더트 전용 기재 → speed, dirt, high.
- Royal Applause: 스프린터(챔피언 스프린터) → speed, turf, high. Grey Sovereign: 6f 우승 → speed, turf, high.
- Waajib: 마일러 기재 → speed, turf, medium.
- Cryptoclearance, Try My Best, Vice Regent: 거리 기재 없음 → speed, low. 표면은 미국 더트 또는 유럽 턴프 등 지역 우승 기준 추정.
- marketTier 는 금액 미사용. 조상 등급은 위키백과 성적·번식 서술 기준의 게임용 등급(추정): 명단 16두·5두는 명세 표의 tier 값을 그대로 사용.

### 명단·부계 고리 레코드 (31두 중 신규 전부)
| key | 이름 | 출생 | 출생국 | 부 | 모부 | status | standsIn | tier | distance | surface | confidence | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_henri_matisse | Henri Matisse | 2022 | IE | Wootton Bassett | Pivotal | active | IE | 4 | speed | turf | medium | 사용자 제공(2026-10-11) · 출생국 IE 추정 |
| stl_henry_longfellow | Henry Longfellow | 2021 | IE | Dubawi | Galileo | active | IE | 4 | speed | turf | medium | 사용자 제공(2026-10-11) · 출생국·모부 추정 |
| stl_sioux_nation | Sioux Nation | 2015 | US | Scat Daddy | — | active | IE | 3 | speed | turf | high | 사용자 제공(2026-10-11) · speed |
| stl_the_antarctic | The Antarctic | 2020 | IE | Dark Angel | — | active | IE | 5 | speed | turf | medium | 사용자 제공(2026-10-11) · 출생국 IE 추정 |
| stl_domestic_product | Domestic Product | 2021 | US | Practical Joke | — (파일에 없음) | active | US | 3 | speed | dirt | high | 사용자 제공(2026-10-11) · speed |
| stl_echo_town | Echo Town | 2017 | US | Speightstown | — | active | US | 5 | speed | dirt | high | 사용자 제공(2026-10-11) · speed. 부 Speightstown 자마 목록 확인 |
| stl_mo_town | Mo Town | 2014 | US | Uncle Mo | — | active | US | 5 | speed | both | high | 사용자 제공(2026-10-11) · speed. Uncle Mo 자마 목록 확인 |
| stl_munnings | Munnings | 2006 | US | Speightstown | — | active | US | 3 | speed | dirt | high | 사용자 제공(2026-10-11) · speed. Speightstown 자마·Jack Christopher 조부 확인 |
| stl_territories | Territories | 2012 | IE | Invincible Spirit | Machiavellian | active | GB | 4 | speed | turf | high | 사용자 제공(2026-10-11) · speed. 2026 명단대로 현역 |
| stl_triple_time | Triple Time | 2019 | IE | Frankel | — | active | GB | 4 | speed | turf | high | 사용자 제공(2026-10-11) · speed |
| stl_enticed | Enticed | 2015 | US | Medaglia d'Oro | — | active | US | 5 | speed | dirt | high | 사용자 제공(2026-10-11) · speed |
| stl_mystic_guide | Mystic Guide | 2017 | US | Ghostzapper | A.P. Indy | active | US | 4 | classic | dirt | high | 사용자 제공(2026-10-11) · classic |
| stl_proxy | Proxy | 2018 | US | Tapit | — | active | US | 3 | classic | dirt | high | 사용자 제공(2026-10-11) · classic |
| stl_speakers_corner | Speaker's Corner | 2018 | US | Street Sense | Bernardini | active | US | 4 | speed | dirt | high | 사용자 제공(2026-10-11) · speed. 2026 명단대로 현역 |
| stl_bated_breath | Bated Breath | 2007 | GB | Dansili | — | active | GB | 5 | speed | turf | high | 사용자 제공(2026-10-11) · speed |
| stl_lead_artist | Lead Artist | 2021 | GB | Dubawi | Frankel | active | GB | 4 | speed | turf | high | 사용자 제공(2026-10-11) · speed |
| stl_ardad | Ardad | 2014 | IE | 미확인 고리(Kodiac) | — | active | GB | 5 | speed | turf | medium | 사용자 제공(2026-10-11) · speed. 부 노드 미확인 |
| stl_hennessy | Hennessy | 1993 | US | Storm Cat (Opus 판단) | — | pensioned | — | 5 | speed | dirt | medium | 사용자 제공(2026-10-11) · speed. 사용자 원문 정정: 부 Storm Cat (사용자 원문은 Scat Daddy 의 아들이라 했으나 Scat Daddy 는 Johannesburg 의 자식이므로 사실과 반대) |
| stl_fortino_ii | Fortino II | 1959 | FR | Grey Sovereign | — | historical | — | 5 | speed | turf | medium | 사용자 제공(2026-10-11) · speed. 1980 사망 사용자 제공 |
| stl_acclamation | Acclamation | 1999 | GB | Royal Applause | — | historical | — | 5 | speed | turf | high | 사용자 제공(2026-10-11) · speed. 2024 사망 사용자 제공, 위키백과 1999–2024 확인 |
| stl_ride_the_rails | Ride the Rails | 1991 | US | Cryptoclearance | — | pensioned | — | 5 | speed | dirt | medium | 사용자 제공(2026-10-11) · speed |

조상 (위키백과 확인):
| key | 이름 | 출생 | 출생국 | 부 | 모부 | status | standsIn | tier | distance | surface | confidence | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_grey_sovereign | Grey Sovereign | 1948 | GB | Nasrullah | — | historical | — | 4 | speed | turf | high | 위키백과: 1976 사망, 6f 우승 |
| stl_cryptoclearance | Cryptoclearance | 1984 | US | Fappiano | — | historical | — | 3 | speed | dirt | low | 위키백과: 2009 사망. 거리 미기재 → speed |
| stl_royal_applause | Royal Applause | 1993 | GB | Waajib | — | historical | — | 3 | speed | turf | high | 위키백과: 2022 사망, 스프린터 챔피언 |
| stl_waajib | Waajib | 1982 | IE | Try My Best | — | historical | — | 5 | speed | turf | medium | 위키백과(RA·TMB 문서): 1999 사망, 마일러. 연도 1982/1983 엇갈림 |
| stl_try_my_best | Try My Best | 1975 | US | Northern Dancer | — | historical | — | 4 | speed | turf | low | 위키백과: 1993 사망. 거리 미기재 → speed |
| stl_speightstown | Speightstown | 1998 | US | Gone West | Storm Cat | historical | — | 2 | speed | dirt | high | 위키백과: 2023 사망, 6f 스프린터, 더트 전용 |
| stl_ghostzapper | Ghostzapper | 2000 | US | Awesome Again | — | pensioned | — | 2 | speed | dirt | medium | 위키백과: 6f~10f 우승, 9f 이하 다수. 고별 시즌 2025 |
| stl_awesome_again | Awesome Again | 1994 | CA | Deputy Minister | — | historical | — | 2 | speed | dirt | medium | 위키백과: 2020 사망, 9f 우승 확인 |
| stl_deputy_minister | Deputy Minister | 1979 | CA | Vice Regent | — | historical | — | 2 | speed | dirt | high | 위키백과: 사망 기재, 6~9f 우승 확인 |
| stl_vice_regent | Vice Regent | 1967 | CA | Northern Dancer | — | historical | — | 3 | speed | both | low | 위키백과: 1995 사망. 거리·표면 미기재 |

### 사슬 연결 (sire 검증)
- Perfect Power (IE 2019) ← Ardad (IE 2014, 미확인 고리) — 깊이 2, 예외.
- Johannesburg (US 1999) ← Hennessy (US 1993) ← Storm Cat(기존). Johannesburg 가 깊이 ≥5 가 되어 Blackbeard, City of Troy, Justify, Little Big Bear, No Nay Never 해소.
- Caro (FR 1967) ← Fortino II (FR 1959) ← Grey Sovereign (GB 1948) ← Nasrullah(기존).
- Dark Angel (GB 2005) ← Acclamation (GB 1999) ← Royal Applause (GB 1993) ← Waajib (IE 1982) ← Try My Best (US 1975) ← Northern Dancer(기존). Harry Angel 해소.
- Candy Ride (AR 1999) ← Ride the Rails (US 1991) ← Cryptoclearance (US 1984) ← Fappiano(기존). Gunite, Sierra Leone 해소.
- Jack Christopher (US 2019) ← Munnings (US 2006) ← Speightstown (US 1998) ← Gone West(기존). 깊이 12 (≥5). 

### Opus 확인 요청
1. **Kodiac**: 위키백과 독립 항목이 없다(또는 제목을 못 찾았다). Ardad 와 Perfect Power 가 깊이 예외에 남는다. Kodiac 출생연도·출생국 확인 자료가 있으면 노드 추가 가능.
2. **Uncle Mo 상태 불일치 (기존 레코드, 이번 티켓에서 미수정)**: 위키백과 Uncle Mo 문서에 2024-12-19 사망 기재. 데이터는 pensioned. historical 로 바꿀지 Opus 판단 필요. 계류 기준 active 아님이라 테스트에는 영향 없음.
3. **Hennessy 부 Storm Cat**: 명세의 Opus 판단 연결. 위키백과 확인 불가.
4. **Fortino II 명칭**: 위키백과 표기 Fortino. 같은 말로 판단.
5. **명단 16두의 등급**: 사용자 제공 정보에 등급 값이 없어 근거 칸에는 거리만 적었다.
- (M2-01c 보정, Opus) Uncle Mo: 위키백과 2024-12 사망 → historical, 주로 turf→dirt(미국 더트 챔피언, 휴리스틱 오류 정정).

## M2-01d 사용자 제공 종마 15두 (haiku-data, 2026-10-11)

출처: 사용자 제공(2026-10-11) 명단 15두 (Daryz 는 기존 레코드 갱신). 사용자 원문의 사람·마주·스터드·레이스 이름과 금액은 데이터·테스트·본 문서 어디에도 기록하지 않았다. 근거 칸에는 등급·거리만 적었다. 암말 이름은 저장하지 않았다.

### 결과 요약
- 종마 222두 (기존 203 + 신규 19). 구성: 사용자 명단 신규 14두, 기존 갱신 1두(Daryz), 신규 조상 5두(Diktat, Warning, Known Fact, In Reality, Intentionally).
- names.json 222 키 = stallions.json 222 키.
- 계통 30개 (+1: `sl_intentionally` 루트, 명세 상한 30 에 도달).
- studRole: `flat` 12두(명시), `nh` 3두(Los Angeles, Kyprios, Order of St George), 생략(= flat) 207두.
- 거리 프로필 전체: speed 167 · classic 37 · middle 15 · cup 3.
- 현역(active) 119두 (기존 105 + 신규 14). 유럽(GB/IE/FR/DE) 계류 80두, 미국 더트·양용 37두(변동 없음).
- 현역 부계 깊이 예외 5두: Aesterius, Ardad, Bradsell, Perfect Power, Sealiway (기존 2두 + 신규 3두, 아래 "미확인 고리").

### 사용자 명단 15두 (2026-10-11 제공)
| key | 이름 | 출생 | 국 | 부(sireKey) | 모부(damsireKey) | standsIn | tier | 거리 | 표면 | studRole | confidence | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_ace_impact | Ace Impact | 2020 | IE | Cracksman (stl_cracksman) | — (Anabaa Blue 파일 없음) | FR | 3 | classic | turf | flat | high | 사용자 제공(2026-10-11) · G1 2,100·2,400m |
| stl_sealiway | Sealiway | 2018 | FR | — (미확인 고리: Galiway) | — (Kendargent 파일 없음) | FR | 4 | classic | turf | flat | medium | 사용자 제공(2026-10-11) · G1 1,400·2,004m. 2018 FR 은 위키백과 확인 |
| stl_intello | Intello | 2010 | DE | Galileo (stl_galileo) | Danehill (stl_danehill) | FR | 5 | classic | turf | flat | medium | 사용자 제공(2026-10-11) · 표기 GE → DE 해석 |
| stl_puchkine | Puchkine | 2021 | FR | Starspangledbanner (stl_starspangledbanner) | — (So You Think 파일 없음) | FR | 5 | speed | turf | flat | high | 사용자 제공(2026-10-11) · speed |
| stl_stunning_spirit | Stunning Spirit | 2014 | GB | Invincible Spirit (stl_invincible_spirit) | — (Dynaformer 파일 없음) | FR | 5 | speed | turf | flat | high | 사용자 제공(2026-10-11) · speed |
| stl_daryz | Daryz (갱신) | 2022 | FR | Sea The Stars (stl_sea_the_stars) | — (Selkirk 파일 없음) | FR | 4 | middle | turf | flat | high | 사용자 제공(2026-10-11) · G1 2,400m×2. 이전 cup 판정(M2-15 본문 근거, low)을 사용자 정보로 대체. 출생국 IE → FR 정정 |
| stl_sea_the_moon | Sea The Moon | 2011 | DE | Sea The Stars (stl_sea_the_stars) | — (Monsun 파일 없음) | GB | 4 | middle | turf | flat | medium | 사용자 제공(2026-10-11) · 표기 GE → DE 해석 |
| stl_los_angeles | Los Angeles | 2021 | IE | Camelot (stl_camelot) | Dansili (stl_dansili) | IE | 5 | classic | turf | nh | high | 사용자 제공(2026-10-11) · G1 2,000·2,100·2,400m. NH 종마 |
| stl_kyprios | Kyprios | 2018 | IE | Galileo (stl_galileo) | Danehill (stl_danehill) | IE | 5 | cup | turf | nh | high | 사용자 제공(2026-10-11) · cup. NH 종마 |
| stl_stradivarius | Stradivarius | 2014 | IE | Sea The Stars (stl_sea_the_stars) | — (Bering 파일 없음) | GB | 4 | cup | turf | flat | high | 사용자 제공(2026-10-11) · cup |
| stl_order_of_st_george | Order of St George | 2012 | IE | Galileo (stl_galileo) | Gone West (stl_gone_west) | IE | 5 | cup | turf | nh | high | 사용자 제공(2026-10-11) · cup. NH 종마 |
| stl_bradsell | Bradsell | 2020 | GB | — (미확인 고리: Tasleet) | — (Archipenko 파일 없음) | GB | 4 | speed | turf | flat | medium | 사용자 제공(2026-10-11) · speed |
| stl_diego_velazquez | Diego Velazquez | 2021 | IE | Frankel (stl_frankel) | Acclamation (stl_acclamation) | GB | 4 | speed | turf | flat | high | 사용자 제공(2026-10-11) · speed |
| stl_aesterius | Aesterius | 2022 | IE | — (미확인 고리: Mehmas) | — (Hallowed Crown 파일 없음) | GB | 5 | speed | turf | flat | medium | 사용자 제공(2026-10-11) · speed |
| stl_dream_ahead | Dream Ahead | 2008 | GB | Diktat (stl_diktat, 신규 조상) | — (Cadeaux Genereux 파일 없음) | GB | 5 | speed | turf | flat | medium | 사용자 제공(2026-10-11) · speed. 부 Diktat 연결은 위키백과 Dream Ahead 문서 미조회 |

공통: 전원 status `active` (명단에 standsIn 값이 있으므로 M2-01c 와 같은 방식으로 현역 처리). marketTier 는 명세 표 값을 그대로 썼다(금액 미사용).

### 신규 조상 5두 (위키백과 확인, status historical)
| key | 이름 | 출생 | 국 | 부 | 모부 | tier | 거리 | 표면 | confidence | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_diktat | Diktat | 1995 | GB | Warning (stl_warning) | Sadler's Wells (stl_sadlers_wells) | 5 | speed | turf | high | 위키백과 Diktat (horse): 1995–2017, 부 Warning 확인. 7f 중심, 최대 우승 2회 단거리 |
| stl_warning | Warning | 1985 | US | Known Fact (stl_known_fact) | — (Roberto 파일 없음) | 5 | speed | turf | medium | 위키백과 Warning (British horse): 1985–2000, 부 Known Fact 확인. 소개문 "British" 와 인포박스 country "United States" 불일치 → 인포박스 값 채택 |
| stl_known_fact | Known Fact | 1977 | US | In Reality (stl_in_reality) | — (Tim Tam 파일 없음) | 5 | speed | turf | high | 위키백과 Known Fact: 1977–2000, 부 In Reality 확인. 마일 챔피언 기재 |
| stl_in_reality | In Reality | 1964 | US | Intentionally (stl_intentionally) | — (Rough'n Tumble 파일 없음) | 5 | speed | dirt | low | 위키백과 In Reality: 1964–1989, 부 Intentionally 확인. 본문에 거리 미기재 → speed + low (명세 폴백). 표면 dirt 는 미국 기록 기준 추정 |
| stl_intentionally | Intentionally | 1956 | US | — (미확인 고리: Intent) | — (Discovery 파일 없음) | 5 | speed | dirt | medium | 위키백과 Intentionally (horse): 1956–1970, 미국 스프린터 챔피언 기재, 8f 기록. 부 Intent 는 아래 미확인 고리 |

### 미확인 고리 (null 처리, 지어내지 않음)
- **Galiway (Sealiway 의 부)**: Sealiway 문서 혈통표에 "Galiway (GB) 2011", 부의 부 Galileo (IRE) 1998 이 있어 출생연도·국·부(Galileo)는 확인. 그러나 Galiway 독립 위키백과 항목이 없고(제목 404, 검색 결과에 Sealiway 만 등장), 사망·은퇴·계류 상태를 확인하지 못했다. status 값을 정할 수 없어 **레코드를 보류**했다. Sealiway.sireKey = null, 계통은 Galileo 계통 `sl_sadlers_wells`. 상태가 확인되면 `stl_galiway`(2011 GB, 부 stl_galileo) 추가 가능 (Opus 질문 1).
- **Tasleet (Bradsell 의 부)**: Tasleet, Tasleet (horse), Tasleet (racehorse), Tasleet (stallion) 모두 404. 검색 "Tasleet racehorse" 결과에 본인 항목 없음. Bradsell.sireKey = null.
- **Showcasing (명세의 Tasleet 부)**: Showcasing, (horse), (racehorse), (stallion) 모두 404. 검색 결과에 항목 없음. 따라서 Oasis Dream 연결도 확인 불가.
- **Mehmas (Aesterius 의 부)**: Mehmas, (horse), (racehorse) 404. 검색 "Mehmas racehorse" 결과에 본인 항목 없음. 명세의 Acclamation 연결도 확인 불가. Aesterius.sireKey = null.
- **Bradsell 문서**: "Bradsell" 은 동명 인물 문서로 redirect, "Bradsell (horse)" 404. 검색 "Bradsell racehorse" 는 60초 대기 후에도 429 로 실패 → 항목 없음으로 판단하되 검색 결과로는 최종 확인하지 못함.
- **Intent (Intentionally 의 부)**: Intentionally 인포박스 부 링크 "Intent (horse)" 404 (Wikimedia 오류 페이지). Intentionally.sireKey = null.
- **damsire 파일 미존재 (null, 외조부 추가 금지 — M2-01e 이관)**: Anabaa Blue, Kendargent, So You Think, Dynaformer, Selkirk, Monsun, Bering, Archipenko, Hallowed Crown, Cadeaux Genereux, Roberto, Tim Tam, Rough'n Tumble, Discovery.
- **Warning 출생국**: 인포박스 United States 와 소개문 British 충돌 → US 채택, medium.

### 계통 결정 (Haiku 판단, Opus 확인 요청)
- `sl_intentionally` (Intentionally line, 루트) 신설: Intentionally → In Reality → Known Fact → Warning → Diktat → Dream Ahead 체인을 한 계통으로 묶었다. founder = stl_intentionally (sireLineId 자기 계통). 계통 수 30 (상한).
- 부 미확인 고리 종마의 계통은 명세가 제시한 체인의 가장 가까운 기존 조상 계통을 추정으로 썼다: Bradsell → `sl_danzig`(Oasis Dream 계통), Aesterius → `sl_northern_dancer`(Acclamation 계통). 두 건 모두 confidence medium, 부 연결은 null.
- Sealiway 계통은 Galileo 계통 `sl_sadlers_wells`.

### 검증
- 위키백과 조회: action=raw 로 Sealiway, Diktat (horse), Warning (British horse), Known Fact, In Reality, Intentionally (horse) 를 확인. 요청 간 3초 이상 간격 유지. 검색 API(api.php) 는 429 가 반복되어 60초 대기 후 재시도했고, 재시도 후에도 429 인 항목(Bradsell)은 확인하지 못했다.
- 테스트: `tests/data/stallions.test.ts` 에 studRole 값 검사, nh ≥ 3, cup ≥ 3 추가. 현역 부계 깊이 예외 목록을 5두로 갱신(명세에 없던 변경, Opus 승인 필요).
- 명세 3번 금지어 grep (`_review.md` + `stallions/*.json`): 0건.

### Opus 질문
1. Galiway 상태(사망·은퇴·계류)를 확인할 자료가 있으면 `stl_galiway` 레코드(2011 GB, 부 Galileo) 추가 여부. 현재는 보류.
2. Warning 출생국: 인포박스 US 채택(현재) vs GB 로 바꿀지.
3. 계통 `sl_intentionally` 신설(30번째) 승인 여부. 대안은 `sl_phalaris` 루트에 편입(계통 수 유지).
4. 테스트 예외 목록 갱신(Sealiway, Bradsell, Aesterius 추가) 승인 여부.
5. 명세 표에 confidence 값이 없어 Haiku 가 "기존 부 연결 확인 + 출생국 확인" 기준으로 부여했다. 조정 필요하면 알려 달라.

## M2-01e 현역 종마 외조부(BMS) 채우기 (haiku-data, 2026-10-11)

출처: 위키백과 원문(action=raw, 인포박스 damsire·sire·foaled·country·death 필드). 요청 간 3.5초 이상, 429 면 60초 대기 후 재시도. 원문은 작업 폴더 캐시에만 두고 저장소에는 넣지 않았다. 사용자 제공 목록(외조부 67두 목록, 혈통표 5두)은 coordinator 지시에 따라 "위키백과 우선, 확인 안 되면 사용자 값(허용 목록만), 그래도 안 되면 null + 미확인" 규칙으로 처리했다. 암말 이름과 금액은 어디에도 기록하지 않았다.

### 결과 요약
- 현역(active) damsireKey 채움: 전 43/119 (36.1%) → 후 98/123 (79.7%). 수용 기준 60% 충족.
- 파이프라인 연결 52두 (위키백과 37, 사용자 값 대체 15). 그중 기존 파일 종마 연결 14두(위키백과 기준). 미확인 24두. 사용자 제공 혈통 5두 중 Galiway·Showcasing·Mehmas 는 외조부 연결, Kodiac 은 외조부 null, Tasleet 은 Cadeaux Genereux 연결.
- 추가 조상 44두 (위키백과 조회) + 사용자 제공 혈통 5두 = 신규 49두. 종마 총수 271두 (기존 222).
- 계통: 30개 유지(신설 0). sl_ardad 의 parentLineId 를 sl_danehill 로 변경(Kodiac 아래로 편입).
- 미확인 고리(sireKey null): 6건, 아래 "미확인 고리" 표.
- 테스트: 부계 사슬 예외 목록 5두 → 0두(사용자 혈통으로 해소). 신규 검사 2개(현역 BMS 비율 ≥ 60%, 외조부 자기 참조 없음·연도 ≤ 종마 − 6).

### 사용자 제공 혈통 5두 (2026-10-11, 정정 반영)
| key | 이름 | 출생 | 출생국 | 부(sireKey) | 모부(damsireKey) | status | standsIn | tier | 거리 | 표면 | confidence | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stl_galiway | Galiway | 2011 | GB | Galileo (stl_galileo) | Danehill | active | FR | 3 | speed | turf | medium | 사용자 제공(2026-10-11) · 거리 미상 |
| stl_showcasing | Showcasing | 2007 | GB | Oasis Dream (stl_oasis_dream) | Zafonic | active | GB | 3 | speed | turf | high | 사용자 제공(2026-10-11) · 2026 계류 정정 반영 |
| stl_tasleet | Tasleet | 2013 | GB | Showcasing (stl_showcasing) | Cadeaux Genereux (파일 있음, 연결) | pensioned | — | 5 | speed | turf | high | 사용자 제공(2026-10-11) · 2026 계류 유럽 밖(비공개 종부) → 비현역. 유럽 밖 계류 |
| stl_mehmas | Mehmas | 2014 | IE | Acclamation (stl_acclamation) | Machiavellian | active | IE | 2 | speed | turf | high | 사용자 제공(2026-10-11) · 2026 계류 정정 반영 |
| stl_kodiac | Kodiac | 2001 | GB | Danehill (stl_danehill) | — (Kris 파일 없음, null) | active | IE | 4 | speed | turf | high | 사용자 제공(2026-10-11) · 2026 계류 정정 반영 |

- 수정: stl_sealiway.sireKey = stl_galiway, stl_bradsell.sireKey = stl_tasleet, stl_aesterius.sireKey = stl_mehmas, stl_ardad.sireKey = stl_kodiac. Ardad 계통 parent 는 Danehill 계통.
- Tasleet 의 외조부 Cadeaux Genereux 는 위키백과 조회(Harry Angel, Dream Ahead 의 외조부)로 파일에 추가된 종마이므로 연결했다(지시 A: "파일에 있으면 연결"). Kodiac 의 외조부 Kris 는 파일에 없어 null.

### 현역 BMS 연결 목록 (파이프라인 52두)
| key | 종마 | 외조부 | 출처 | 외조부 key |
| --- | --- | --- | --- | --- |
| stl_churchill | Churchill | Storm Cat | 위키백과 | stl_storm_cat |
| stl_gleneagles | Gleneagles | Storm Cat | 위키백과 | stl_storm_cat |
| stl_camelot | Camelot | Kingmambo | 위키백과 | stl_kingmambo |
| stl_holy_roman_emperor | Holy Roman Emperor | Secretariat | 위키백과 | stl_secretariat |
| stl_persian_king | Persian King | Dylan Thomas | 위키백과 | stl_dylan_thomas |
| stl_sea_the_stars | Sea The Stars | Miswaki | 위키백과 | stl_miswaki |
| stl_golden_horn | Golden Horn | Dubai Destination | 위키백과 | stl_dubai_destination |
| stl_practical_joke | Practical Joke | Distorted Humor | 위키백과 | stl_distorted_humor |
| stl_curlin | Curlin | Deputy Minister | 위키백과 | stl_deputy_minister |
| stl_good_magic | Good Magic | Hard Spun | 위키백과 | stl_hard_spun |
| stl_vino_rosso | Vino Rosso | Street Cry | 위키백과 | stl_street_cry |
| stl_tapit | Tapit | Unbridled | 위키백과 | stl_unbridled |
| stl_essential_quality | Essential Quality | Elusive Quality | 위키백과 | stl_elusive_quality |
| stl_flightline | Flightline | Indian Charlie | 위키백과 | stl_indian_charlie |
| stl_bolt_d_oro | Bolt d'Oro | A.P. Indy | 위키백과 | stl_ap_indy |
| stl_life_is_good | Life Is Good | Distorted Humor | 위키백과 | stl_distorted_humor |
| stl_ulysses | Ulysses | Kingmambo | 위키백과 | stl_kingmambo |
| stl_shalaa | Shalaa | War Chant | 위키백과 | stl_war_chant |
| stl_delacroix | Delacroix | Galileo | 사용자 값(위키백과 미확인 → 대체) | stl_galileo |
| stl_footstepsinthesand | Footstepsinthesand | Rainbow Quest | 사용자 값(위키백과 미확인 → 대체) | stl_rainbow_quest |
| stl_citizen_bull | Citizen Bull | Distorted Humor | 위키백과 | stl_distorted_humor |
| stl_farhh | Farhh | Lando | 위키백과 | stl_lando |
| stl_palace_pier | Palace Pier | Nayef | 위키백과 | stl_nayef |
| stl_perfect_power | Perfect Power | Fastnet Rock | 사용자 값(위키백과 미확인 → 대체) | stl_fastnet_rock |
| stl_pinatubo | Pinatubo | Dalakhani | 위키백과 | stl_dalakhani |
| stl_victor_ludorum | Victor Ludorum | Kingmambo | 사용자 값(위키백과 미확인 → 대체) | stl_kingmambo |
| stl_blue_point | Blue Point | Royal Applause | 사용자 값(위키백과 미확인 → 대체) | stl_royal_applause |
| stl_space_blues | Space Blues | Noverre | 위키백과 | stl_noverre |
| stl_frosted | Frosted | Deputy Minister | 위키백과 | stl_deputy_minister |
| stl_hard_spun | Hard Spun | Turkoman | 위키백과 | stl_turkoman |
| stl_chaldean | Chaldean | Dutch Art | 위키백과 | stl_dutch_art |
| stl_oasis_dream | Oasis Dream | Dancing Brave | 위키백과 | stl_dancing_brave |
| stl_vadeni | Vadeni | Monsun | 위키백과 | stl_monsun |
| stl_epicenter | Epicenter | Candy Ride | 위키백과 | stl_candy_ride |
| stl_gunite | Gunite | Holy Roman Emperor | 사용자 값(위키백과 미확인 → 대체) | stl_holy_roman_emperor |
| stl_tiz_the_law | Tiz The Law | Tiznow | 사용자 값(위키백과 미확인 → 대체) | stl_tiznow |
| stl_harry_angel | Harry Angel | Cadeaux Genereux | 위키백과 | stl_cadeaux_genereux |
| stl_native_trail | Native Trail | Observatory | 위키백과 | stl_observatory |
| stl_corniche | Corniche | Speightstown | 사용자 값(위키백과 미확인 → 대체) | stl_speightstown |
| stl_justify | Justify | Ghostzapper | 위키백과 | stl_ghostzapper |
| stl_blackbeard | Blackbeard | Kingmambo | 사용자 값(위키백과 미확인 → 대체) | stl_kingmambo |
| stl_little_big_bear | Little Big Bear | Bering | 위키백과 | stl_bering |
| stl_midshipman | Midshipman | Coronado's Quest | 사용자 값(위키백과 미확인 → 대체) | stl_coronado_s_quest |
| stl_ardad | Ardad | Red Clubs | 사용자 값(위키백과 미확인 → 대체) | stl_red_clubs |
| stl_sioux_nation | Sioux Nation | Oasis Dream | 사용자 값(위키백과 미확인 → 대체) | stl_oasis_dream |
| stl_domestic_product | Domestic Product | Paynter | 사용자 값(위키백과 미확인 → 대체) | stl_paynter |
| stl_mo_town | Mo Town | Bernardini | 사용자 값(위키백과 미확인 → 대체) | stl_bernardini |
| stl_munnings | Munnings | Seeking the Gold | 사용자 값(위키백과 미확인 → 대체) | stl_seeking_the_gold |
| stl_ace_impact | Ace Impact | Anabaa Blue | 위키백과 | stl_anabaa_blue |
| stl_sea_the_moon | Sea The Moon | Monsun | 위키백과 | stl_monsun |
| stl_stradivarius | Stradivarius | Bering | 위키백과 | stl_bering |
| stl_dream_ahead | Dream Ahead | Cadeaux Genereux | 위키백과 | stl_cadeaux_genereux |

### 추가 조상 (파이프라인 44두, status historical/pensioned)
규칙: 출생연도·출생국·부는 위키백과 인포박스로 확인. 사망 기재가 있으면 historical, 없으면 pensioned. standsIn null, tier 5. 거리는 위키백과 주요 우승 거리를 자동 추출하지 않았으므로 **speed + turf + low (명세 폴백)**. 부가 파일에 없거나 위키백과에서 확인되지 않으면 sireKey null(미확인 고리). sireLineId 는 부의 계통, 부가 없으면 자식 계통을 추정으로 썼다.
| key | 이름 | 출생 | 출생국 | 부(sireKey) | status | 계통 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stl_secretariat | Secretariat | 1970 | US | Bold Ruler | historical | sl_phalaris |  |
| stl_dylan_thomas | Dylan Thomas | 2003 | IE | Danehill | pensioned | sl_danehill |  |
| stl_miswaki | Miswaki | 1978 | US | Mr. Prospector | pensioned | sl_mr_prospector |  |
| stl_dubai_destination | Dubai Destination | 1999 | US | Kingmambo | pensioned | sl_mr_prospector |  |
| stl_distorted_humor | Distorted Humor | 1993 | US | Forty Niner | historical | sl_mr_prospector |  |
| stl_forty_niner | Forty Niner | 1985 | US | Mr. Prospector | historical | sl_mr_prospector |  |
| stl_war_chant | War Chant | 1997 | US | Danzig | historical | sl_danzig |  |
| stl_rainbow_quest | Rainbow Quest | 1981 | US | Blushing Groom | historical | sl_storm_cat |  |
| stl_blushing_groom | Blushing Groom | 1974 | FR | — | historical | sl_storm_cat | 미확인 고리: 부(Red God) 확인 안 됨 |
| stl_lando | Lando | 1990 | DE | Acatenango | pensioned | sl_nureyev |  |
| stl_acatenango | Acatenango | 1982 | DE | Surumu | historical | sl_nureyev |  |
| stl_surumu | Surumu | 1974 | DE | — | pensioned | sl_nureyev | 미확인 고리: 부(Literat) 확인 안 됨 |
| stl_nayef | Nayef | 1998 | US | Gulch | pensioned | sl_mr_prospector |  |
| stl_gulch | Gulch | 1984 | US | Mr. Prospector | historical | sl_mr_prospector |  |
| stl_fastnet_rock | Fastnet Rock | 2001 | AU | Danehill | historical | sl_danehill |  |
| stl_dalakhani | Dalakhani | 2000 | IE | Darshaan | historical | sl_phalaris |  |
| stl_darshaan | Darshaan | 1981 | GB | Shirley Heights | pensioned | sl_phalaris |  |
| stl_shirley_heights | Shirley Heights | 1975 | GB | Mill Reef | historical | sl_phalaris |  |
| stl_mill_reef | Mill Reef | 1968 | US | Never Bend | historical | sl_phalaris |  |
| stl_never_bend | Never Bend | 1960 | US | Nasrullah | historical | sl_phalaris |  |
| stl_noverre | Noverre | 1998 | US | Rahy | pensioned | sl_storm_cat |  |
| stl_rahy | Rahy | 1985 | US | Blushing Groom | pensioned | sl_storm_cat |  |
| stl_turkoman | Turkoman | 1982 | US | Alydar | historical | sl_native_dancer |  |
| stl_alydar | Alydar | 1975 | US | Raise a Native | pensioned | sl_native_dancer |  |
| stl_dutch_art | Dutch Art | 2004 | GB | Medicean | pensioned | sl_mr_prospector |  |
| stl_medicean | Medicean | 1997 | GB | Machiavellian | historical | sl_mr_prospector |  |
| stl_dancing_brave | Dancing Brave | 1983 | US | Lyphard | historical | sl_northern_dancer |  |
| stl_lyphard | Lyphard | 1969 | US | Northern Dancer | historical | sl_northern_dancer |  |
| stl_monsun | Monsun | 1990 | DE | Königsstuhl | pensioned | sl_sadlers_wells |  |
| stl_konigsstuhl | Königsstuhl | 1976 | DE | — | historical | sl_sadlers_wells | 미확인 고리: 부(Dschingis Khan) 확인 안 됨 |
| stl_tiznow | Tiznow | 1997 | US | — | pensioned | sl_ap_indy | 미확인 고리: 부(Cee's Tizzy) 확인 안 됨 |
| stl_cadeaux_genereux | Cadeaux Genereux | 1985 | GB | — | pensioned | sl_dark_angel | 미확인 고리: 부(Young Generation (horse)) 확인 안 됨 |
| stl_observatory | Observatory | 1997 | US | Distant View | pensioned | sl_mr_prospector |  |
| stl_distant_view | Distant View | 1991 | US | Mr. Prospector | pensioned | sl_mr_prospector |  |
| stl_bering | Bering | 1983 | GB | Arctic Tern | pensioned | sl_scat_daddy |  |
| stl_arctic_tern | Arctic Tern | 1973 | US | Sea-Bird | pensioned | sl_scat_daddy |  |
| stl_sea_bird | Sea-Bird | 1962 | FR | — | historical | sl_scat_daddy | 미확인 고리: 부(Dan Cupid) 확인 안 됨 |
| stl_coronado_s_quest | Coronado's Quest | 1995 | US | Forty Niner | pensioned | sl_mr_prospector |  |
| stl_red_clubs | Red Clubs | 2003 | IE | Red Ransom | pensioned | sl_phalaris |  |
| stl_red_ransom | Red Ransom | 1987 | US | Roberto | pensioned | sl_phalaris |  |
| stl_roberto | Roberto | 1969 | US | Hail to Reason | pensioned | sl_phalaris |  |
| stl_paynter | Paynter | 2009 | US | Awesome Again | historical | sl_northern_dancer |  |
| stl_anabaa_blue | Anabaa Blue | 1998 | GB | Anabaa | pensioned | sl_danzig |  |
| stl_anabaa | Anabaa | 1992 | US | Danzig | historical | sl_danzig |  |

### 미확인 고리 (sireKey null)
| 종마 | 사유 |
| --- | --- |
| Blushing Groom | 부(Red God) 확인 안 됨 |
| Surumu | 부(Literat) 확인 안 됨 |
| Königsstuhl | 부(Dschingis Khan) 확인 안 됨 |
| Tiznow | 부(Cee's Tizzy) 확인 안 됨 |
| Cadeaux Genereux | 부(Young Generation (horse)) 확인 안 됨 |
| Sea-Bird | 부(Dan Cupid) 확인 안 됨 |

### BMS 미확인 (종마 이름만 기록. 사용자에게 받을 목록)
| 종마 | 사유 |
| --- | --- |
| Dubawi | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Nathaniel | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Medaglia d'Oro | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Kingman | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Into Mischief | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Lope de Vega | 위키백과 외조부 값 항목 확인 안 됨; 사용자 값 없음/사용 불가 |
| Too Darn Hot | 위키백과 인포박스에 외조부 없음 |
| Ghaiyyath | 위키백과 인포박스에 외조부 없음 |
| Daryz | 위키백과 외조부 값 항목 확인 안 됨; 사용자 값 없음/사용 불가 |
| Raven's Pass | 위키백과 외조부 값 항목 확인 안 됨; 사용자 값 없음/사용 불가 |
| Starspangledbanner | 위키백과 외조부 값 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Zarak | 위키백과 항목 확인 안 됨; 대체 값 확인 안 됨 |
| Camille Pissarro | 위키백과 항목 확인 안 됨 |
| The Antarctic | 위키백과 항목 확인 안 됨 |
| Echo Town | 위키백과 항목 확인 안 됨 |
| Triple Time | 위키백과 항목 확인 안 됨 |
| Enticed | 위키백과 항목 확인 안 됨 |
| Proxy | 위키백과 항목 확인 안 됨 |
| Bated Breath | 위키백과 항목 확인 안 됨 |
| Sealiway | 위키백과 외조부 값 항목 확인 안 됨; 사용자 값 없음/사용 불가 |
| Puchkine | 위키백과 항목 확인 안 됨 |
| Stunning Spirit | 위키백과 항목 확인 안 됨 |
| Bradsell | 위키백과 항목 확인 안 됨 |
| Aesterius | 위키백과 항목 확인 안 됨 |
| Kodiac | 사용자 제공 외조부(파일에 없음) → null, 외조부 추가 보류 |

### BMS 충돌 (종마, 위키백과 값, 사용자 값)
위키백과 값이 있는데 사용자 값과 다른 경우. 사용자 값이 암말 이름이면 저장하지 않고 "암말 이름(미기록)"으로 적었다.
| 종마 | 위키백과 값 | 사용자 값 | 처리 |
| --- | --- | --- | --- |
| Churchill | Storm Cat | Galileo | 위키백과 값 연결 |
| Holy Roman Emperor | Secretariat | 암말 이름(미기록) | 위키백과 값 연결 |
| Persian King | Dylan Thomas | Anabaa | 위키백과 값 연결 |
| Practical Joke | Distorted Humor | Tapit | 위키백과 값 연결 |
| Lope de Vega | Vettori | Giant's Causeway | 미확인 |
| Good Magic | Hard Spun | Ghostzapper | 위키백과 값 연결 |
| Flightline | Indian Charlie | Mineshaft | 위키백과 값 연결 |
| Ulysses | Kingmambo | Galileo | 위키백과 값 연결 |
| Shalaa | War Chant | Dansili | 위키백과 값 연결 |
| Citizen Bull | Distorted Humor | Speightstown | 위키백과 값 연결 |
| Farhh | Lando | Pivotal | 위키백과 값 연결 |
| Perfect Power | Frozen Power | Fastnet Rock | 위키백과 미확인 → 사용자 값 연결 |
| Pinatubo | Dalakhani | In The Wings | 위키백과 값 연결 |
| Victor Ludorum | Kaldounevees | Kingmambo | 위키백과 미확인 → 사용자 값 연결 |
| Frosted | Deputy Minister | Pulpit | 위키백과 값 연결 |
| Chaldean | Dutch Art | Exceed And Excel | 위키백과 값 연결 |
| Daryz | Selkirk | Zamindar | 미확인 |
| Gunite | Cowboy Cal | Holy Roman Emperor | 위키백과 미확인 → 사용자 값 연결 |
| Harry Angel | Cadeaux Genereux | Dark Angel | 위키백과 값 연결 |
| Native Trail | Observatory | Oasis Dream | 위키백과 값 연결 |
| Raven's Pass | Lord At War | Sadler's Wells | 미확인 |
| Starspangledbanner | Made Of Gold | Hölling Heights | 미확인 |
| Corniche | Najran | Speightstown | 위키백과 미확인 → 사용자 값 연결 |
| Blackbeard | Born To Sea | Kingmambo | 위키백과 미확인 → 사용자 값 연결 |
| Little Big Bear | Bering | Galileo | 위키백과 값 연결 |
| Midshipman | Avenue of Flags | Coronado's Quest | 위키백과 미확인 → 사용자 값 연결 |

### M2-15 표 갱신 (사용자 확정 15두)
Vino Rosso classic/dirt · Mandaloun classic/dirt · Maxfield speed/dirt · Golden Pal speed/turf · Constitution speed/dirt · Half Ours speed/dirt · Raise a Native speed/dirt · Mr. Prospector speed/dirt · Harlan speed/dirt · Vindication speed/dirt · Bold Reasoning speed/both · Giant's Causeway speed/turf · Danzig·Storm Cat speed/both · Sickle middle/turf (그대로). 위 표의 "미확인" 표시는 "사용자 확정"으로 바꿨다.

### 검증
- 위키백과 조회: 최종 파이프라인 실행 신규 요청 18건(나머지는 원문 캐시). 요청 간 3.5초 이상, 429 는 60초 대기 후 재시도(발생 시).
- `tests/data/stallions.test.ts`: 현역 BMS ≥ 60%, 외조부 자기 참조 없음, 외조부 연도 ≤ 종마 − 6, 예외 목록 빈 배열.
- 금지어 grep 과 npm test / typecheck / lint 결과는 보고서 본문 참조.

### Opus 확인 요청
1. 외조부 BMS 미확인 종마 목록(위 표)과 충돌 목록을 사용자에게 전달해 확인받을지.
2. 추가 조상 거리·표면이 전부 speed/turf/low 폴백이다. 위키백과 우승 거리를 추출하는 후속 티켓이 필요한지.
3. Tasleet 외조부 Cadeaux Genereux 연결(파일 추가 종마 연결)과 Kodiac 외조부 null 처리 확인.
4. Tasleet "유럽 밖 계류" 처리: 비현역(pensioned) 유지.

## M2-01f 외조부 확정값 반영 (haiku-data, 2026-10-12)

### 결과 요약
- 조상 레코드 29두 추가 (표 1, status historical/pensioned, marketTier 5, standsIn null, damsireKey null). names.json 29건 추가.
- 외조부(damsireKey) 39건 설정 (표 2). 그중 기존 값 교체 8건(Perfect Power, Victor Ludorum, Gunite, Corniche, Blackbeard, Midshipman, Delacroix, Munnings), 기존 null에 신규 연결 25건, 기존 값 일치 6건(Footstepsinthesand, Tiz The Law, Ardad, Sioux Nation, Domestic Product, Mo Town).
- 현역(active) 종마 외조부 채움: 123/123 (이전 98/123).
- 테스트 파일 tests/data/stallions.test.ts: COUNTRY_CODES 에 'NZ' 추가 (So You Think 의 NZ 가 기존 하드코딩 목록에 없어 실패). 그 외 수정 없음.

### 표 2 외조부 연결 (39건)

| 종마 | 외조부 | 출처 |
|---|---|---|
| Dubawi | Deploy | wiki |
| Nathaniel | Silver Hawk | wiki |
| Medaglia d'Oro | Bailjumper | wiki |
| Into Mischief | Tricky Creek | wiki |
| Lope de Vega | Vettori | wiki |
| Too Darn Hot | Singspiel | wiki |
| Ghaiyyath | Galileo | wiki |
| Daryz | Selkirk | wiki |
| Raven's Pass | Lord At War | wiki |
| Starspangledbanner | Made Of Gold | wiki |
| Sealiway | Kendargent | wiki |
| Perfect Power | Frozen Power | wiki |
| Victor Ludorum | Kaldounevees | wiki |
| Gunite | Cowboy Cal | wiki |
| Corniche | Najran | wiki |
| Blackbeard | Born To Sea | wiki |
| Midshipman | Avenue of Flags | wiki |
| Delacroix | Bernstein | wiki |
| Kingman | Zamindar | user |
| Zarak | Zamindar | user |
| Camille Pissarro | Pivotal | user |
| The Antarctic | Lawman | user |
| Echo Town | Menifee | user |
| Triple Time | Mark of Esteem | user |
| Enticed | Mineshaft | user |
| Proxy | Include | user |
| Bated Breath | Distant View | user |
| Puchkine | So You Think | user |
| Stunning Spirit | Dynaformer | user |
| Bradsell | Archipenko | user |
| Aesterius | Hallowed Crown | user |
| Kodiac | Kris | user |
| Footstepsinthesand | Rainbow Quest | user |
| Tiz The Law | Tiznow | user |
| Ardad | Red Clubs | user |
| Sioux Nation | Oasis Dream | user |
| Domestic Product | Paynter | user |
| Mo Town | Bernardini | user |
| Munnings | Holy Bull | user |

### 표 1 중 신뢰도 low 조상 (8두, Opus 검수 대상)

Avenue of Flags, Bailjumper, Kaldounevees, Kendargent, Lord At War, Made Of Gold, Najran, Tricky Creek

### 검증
- 검증 스크립트: /tmp/m2_01f_check/verify.py (명세 표를 직접 파싱해 표 1 값, 표 2 39건, HEAD 대비 변경 범위 대조). 결과 오류 0건.
- npm test 통과(43 files, 720 passed, 2 skipped), npm run typecheck 통과, npm run lint 통과.

## M3-C6 털색 데이터 (2026-10-12)

- 출처: 영어 위키백과 인포박스 colour(출생연도로 동일마 확인) 241두 + 사용자 제공 혈통표 18두 = 259두. 'Bay or brown'·'Dark bay or brown' 은 brown(흑갈색)으로 기록.
- 털색 미확인 41두(엔진은 bay 로 처리, 사용자 확인 대기):

  - active 33: Ace Impact(IE 2020), Aesterius(IE 2022), Ardad(IE 2014), Australia(GB 2011), Bated Breath(GB 2007), Bradsell(GB 2020), Camille Pissarro(IE 2022), Diego Velazquez(IE 2021), Domestic Product(US 2021), Echo Town(US 2017), Enticed(US 2015), Erevann(FR 2019), Galiway(GB 2011), Henri Matisse(IE 2022), Henry Longfellow(IE 2021), Iffraaj(GB 2001), Kodiac(GB 2001), Lead Artist(GB 2021), Los Angeles(IE 2021), Mehmas(IE 2014), Mo Town(US 2014), Munnings(US 2006), Mystic Guide(US 2017), Proxy(US 2018), Puchkine(FR 2021), Showcasing(GB 2007), Sioux Nation(US 2015), Speaker's Corner(US 2018), Stunning Spirit(GB 2014), Territories(IE 2012), The Antarctic(IE 2020), Triple Time(IE 2019), Zarak(FR 2013)
  - pensioned 4: Constitution(US 2011), Hennessy(US 1993), Ride the Rails(US 1991), Tasleet(GB 2013)
  - historical 4: Fortino II(FR 1959), Harlan(US 1989), Waajib(IE 1982), Warning(US 1985)
- 2026-10-12 추가: 미확인 41두는 사용자 확인값으로 반영(b → bay, dkb/br·br → brown, ch → chestnut, gr → grey). 이제 300두 전부 털색 있음.

## Man o' War 계통 신설 (2026-10-12, 사용자 제공)

- Intentionally ← Intent(US 1948, 외조부 Bubbling Over) ← War Relic(US 1938) ← Man o' War(US 1917). 출처: 사용자.
- sl_man_o_war(루트) 신설, sl_intentionally 의 parentLineId 를 sl_man_o_war 로. 하위 계통 수 31(테스트 상한 30 → 35).
- Bubbling Over 는 계통 자료가 없어 레코드를 만들지 않고 Intent 의 damsireKey 는 null(이 메모로만 기록).
- 털색: Man o' War·War Relic·Intent 모두 chestnut(사용자 확인 2026-10-12).

## 2026 북미 리딩 사이어 대조 (2026-10-12, 사용자 제공 화면)
- 현역으로 정정(US): Not This Time(tier 1), Gun Runner(1), Constitution(2), Quality Road(2), City of Light(3), Candy Ride(3). M2 때 계류 상태 미확인으로 pensioned 처리했던 종마.
- Medaglia d'Oro → pensioned, Frosted → historical(사망).
- Vino Rosso: 2027 계류지가 호주로 보임(확인 필요, 현재 US 유지).
- 상위 50위 중 우리 데이터에 없는 종마 22두는 docs/m4-ideas.md 의 '미국 종마 후보'(M4 추가 대상).
- 사용자 제공 종마 등록 화면 확인(2026-10-12): Gun Runner(Candy Ride, 2013, ch, 외조부 Giant's Causeway) 일치. Not This Time(Giant's Causeway, 2014) 털색 bay → brown(dkb/br) 정정, 외조부 Trippi(미수록). Quality Road(Elusive Quality, 2006, b) 일치, 외조부 Strawberry Road(미수록). City of Light(Quality Road, 2014, b) 일치, 외조부 Dehere(미수록). 미수록 외조부는 M4 미국 종마 추가 때 함께 검토.
- 사망 연도 확인(사용자): Uncle Mo 2024, Speightstown 2023 — historical 유지.
- American Pharoah: 2025~2026 일본 단기 임대, 2027 미국 복귀(사용자). M4 미국 종마 후보.

## M2-02 미국 종마 추가 (haiku-data, 2026-10-12)

출처: 영어 위키백과 action=raw 원문(인포박스 sire·damsire·foaled·colour·country·death_date, 본문 경주 기록). 한 번에 한 페이지, 요청 간 3.5초 이상, 429 는 30초 대기 후 재시도. 원문과 스크립트는 저장소 밖(/tmp/m2_02)에만 두었다. 동명 말은 출생연도로 확인했다(예: Authentic 은 "Authentic (racehorse)" 2017 문서, "Authentic (horse)" 는 리다이렉트).

### 결과 요약
- 명세 23두 중 위키백과에서 부·생년·털색을 확인한 현역 9두 + 부계 조상 4두 = 13건 추가. 종마 총수 303 → 316, names.json 316건.
- 미추가 14두: 위키백과 문서를 찾지 못했거나(대부분) 털색이 비어 있어(Volatile) 레코드를 만들지 않았다. 털색 필드가 모든 종마에 필요하므로(tests/data/stallions.test.ts "coatColour 모든 종마") 추측으로 채우지 않았다. 아래 "확인 필요" 표 참고.
- 명세의 "?" 생년 2건은 위키백과로 확정: Goldencents 2010, Omaha Beach 2016.
- 외조부: 추가 13건 중 기존·신규 레코드에 있는 것만 연결(Indian Charlie, Storm Cat, Seeking the Gold, Seattle Slew, Lord at War). 외조부만을 위해 새 레코드는 만들지 않았다(Trippi, Theatrical, Banker's Gold, Mr. Greeley, Petionville, Yankee Gentleman, Rubiano, Lear Fan 은 null).
- 계통: sire_lines.json 변경 없음(31개). 신규 부는 모두 부의 계통을 그대로 받았다(sl_storm_cat, sl_el_prado, sl_danzig, sl_mr_prospector, sl_into_mischief, sl_ap_indy).
- 현역 외조부 채움: 125/136 (91.9%). 테스트 ≥60% 충족.
- 현역 US 더트·양용 46두(≥15 충족).
- Not This Time·Quality Road·City of Light 의 외조부(Trippi·Strawberry Road·Dehere)는 이번에 추가되지 않아 그대로 null 이다.
- 기존 레코드의 status·marketTier·털색은 변경하지 않았다.

### 추가 레코드 (13건)
| 이름 | 부(sireKey) | 외조부(damsireKey) | 생년 | 털색 | 거리 | 표면 | 계통 | status | standsIn | tier | confidence | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Liam's Map | Unbridled's Song | null (Trippi 미수록) | 2011 | grey | classic | dirt | sl_mr_prospector | active | US | 3 | high | 인포박스 Gray → grey |
| Oscar Performance | Kitten's Joy (신규) | null (Theatrical 미수록) | 2014 | bay | classic | turf | sl_el_prado | active | US | 2 | high | 턴프 1마일~1⅛마일 승리 |
| Goldencents | Into Mischief | null (Banker's Gold 미수록) | 2010 | bay | classic | dirt | sl_into_mischief | active | US | 4 | high | 생년 '?' 해소. Dirt Mile 2회·Santa Anita Derby. 6~7f 승리도 있어 경계(거리 판단 확인 필요) |
| Mitole | Eskendereya (신규) | stl_indian_charlie | 2015 | bay | speed | dirt | sl_storm_cat | active | US | 4 | high | 6~7f 위주(BC Sprint, Vanderbilt, Churchill Downs Stakes) |
| Dialed In | Mineshaft | stl_storm_cat | 2008 | brown | classic | dirt | sl_ap_indy | active | US | 4 | high | 인포박스 Dark bay or brown → brown. Florida Derby 등 |
| Authentic | Into Mischief | null (Mr. Greeley 미수록) | 2017 | bay | classic | dirt | sl_into_mischief | active | US | 4 | high | 2020 Kentucky Derby·BC Classic(1¼마일 2회) + 1⅛마일 승리 다수 → classic 판단 |
| McKinzie | Street Sense | null (Petionville 미수록) | 2015 | bay | classic | dirt | sl_mr_prospector | active | US | 2 | high | 1⅛마일 승리(Pennsylvania Derby, Alysheba, Whitney) |
| Omaha Beach | War Front (신규) | stl_seeking_the_gold | 2016 | bay | classic | dirt | sl_danzig | active | AU | 2 | high | 생년 '?' 해소. 인포박스 Dark bay → bay(명세 규칙은 "dark bay or brown" 만 brown). 2020년부터 호주 계류 기록 |
| American Pharoah | Pioneerof the Nile (신규) | null (Yankee Gentleman 미수록) | 2012 | bay | classic | dirt | sl_mr_prospector | active | US | 2 | high | availableFromYear 2027 (사용자 결정). Del Mar Futurity 만 Polytrack |
| War Front | Danzig | null (Rubiano 미수록) | 2002 | bay | classic | dirt | sl_danzig | pensioned | — | 5 | medium | 조상. Claiborne Farm 계류 기록, 사망 기록 없음 → 2026 상태 미확인. 거리는 경주명 기준 추정(아래 참고) |
| Kitten's Joy | El Prado | null (Lear Fan 미수록) | 2001 | chestnut | classic | turf | sl_el_prado | historical | — | 5 | high | 조상. 2022-07-15 사망 |
| Eskendereya | Giant's Causeway | stl_seattle_slew | 2007 | chestnut | classic | dirt | sl_storm_cat | historical | — | 5 | high | 조상. 2024-03-02 사망. Wood Memorial 9f 등 |
| Pioneerof the Nile | Empire Maker | stl_lord_at_war | 2006 | brown | classic | dirt | sl_mr_prospector | historical | — | 5 | high | 조상. 인포박스 Dark Bay/Brown → brown. 2019-03-18 사망 |

거리·표면 판단 근거(본문 경주 기록 기준, 명세의 거리 구간: 1400m 이하 speed, 1600~2000 classic, 2000~2400 middle, 2800+ cup. 7f 는 1408m 이라 speed 경계로 본다):
- 주요 승리가 1마일 이상 위주인 말은 classic, 6~7f 위주인 Mitole 만 speed.
- Goldencents 는 6~7f 승리도 있으나 Dirt Mile 2회·Santa Anita Derby(9f)가 주요 승리라 classic. 경계 사례.
- Authentic 은 Kentucky Derby·BC Classic(약 2,012m)과 1⅛마일 승리가 섞여 classic 으로 판단. 경계 사례.
- Kitten's Joy 는 턴프 1마일~1⅛마일 승리 위주라 classic(잔디). 
- American Pharoah 는 Del Mar Futurity(7f)를 제외하면 1⅛마일 이상 더트 승리라 classic.
- War Front 는 인포박스에 Vanderbilt Handicap(2006)만 있고 본문에 해당 거리가 명시되지 않았다. Princelet Stakes 1마일 반 등 1마일 전후 기록을 근거로 classic 으로 추정. Opus 확인 필요.

### 확인 필요 (레코드 미추가 14두 + 보류 1두)
명세의 23두 중 위키백과에서 확인하지 못한 말. 명세 값(부·생년·계류·tier)은 사용자 화면 기준이며 위키백과로 확인되지 않았다. 레코드를 만들려면 털색(coatColour)이 필요하므로 보류했다.

| 종마 | 부(화면) | 생년(화면) | 계류 | tier | 확인 결과 |
| --- | --- | --- | --- | --- | --- |
| Vekoma | Candy Ride | 2016 | US | 2 | "Vekoma", "Vekoma (horse)", "Vekoma (racehorse)" 모두 문서 없음(Vekoma 는 놀이기구 회사 문서) |
| Twirling Candy | Candy Ride | 2007 | US | 2 | 세 제목 모두 404 |
| Maclean's Music | Distorted Humor | 2008 | US | 3 | 세 제목 모두 404 |
| Yaupon | Uncle Mo | 2017 | US | 2 | "Yaupon" 은 식물 문서 리다이렉트, "(horse)"·"(racehorse)" 404 |
| Volatile | Violence | 2016 | US | 4 | 문서 있음(부 Violence, 2016, 외조부 Unbridled's Song 확인). 인포박스 colour 가 비어 있어 털색 미확인 → 보류. 사용자 털색 확인 시 바로 추가 가능 |
| Kantharos | Lion Heart | 2008 | US | 4 | "(horse)"·"(racehorse)" 404, 평문은 고대 그릇 문서 |
| Cairo Prince | Pioneerof the Nile | 2011 | US | 4 | 세 제목 모두 404 |
| Audible | Into Mischief | 2015 | US | 5 | "(horse)"·"(racehorse)" 404, 평문은 동음이의 목록 |
| Upstart | Flatter | 2012 | US | 4 | "(horse)" 는 다른 말(디킨 메달 목록) 리다이렉트, "(racehorse)" 404 |
| Maximus Mischief | Into Mischief | 2016 | US | 4 | 세 제목 모두 404 |
| Flameaway | Scat Daddy | 2015 | US | 4 | 세 제목 모두 404 |
| Collected | City Zip | 2013 | US | 5 | "(horse)" 는 무관 문서(Dressage) 리다이렉트, "(racehorse)" 404 |
| Tapiture | Tapit | 2011 | CA | 5 | 세 제목 모두 404 |
| The Factor | War Front | ? | US | 5 | "(horse)"·"(racehorse)" 404, 평문은 The O'Reilly Factor 리다이렉트 |

Opus 확인 요청:
1. 위 14두의 털색·출처를 사용자에게 받을지, 위키백과 외 출처를 허용할지(명세: 위키백과만). 받으면 레코드 추가 가능.
2. 명세 외 조상: Lion Heart, Flatter, City Zip 은 미추가 14두의 부라 이번에 만들지 않았다.
3. War Front 의 2026 계류 상태(pensioned 로 두었고 confidence medium) 와 거리(classic 추정) 확인.
4. Goldencents·Authentic 의 classic/speed 경계 판단 확인.

### 검증
- npx vitest run tests/data: 10 files, 261 tests 통과.
- npm test 전체: 1142 통과, 1 실패. 실패는 tests/engine/namingLandmarks.test.ts "빈 landmarks·workTitles 는 HEAD 와 같은 생성 결과" (SHA-256 대조). 원인: 같은 파일의 PARENT_NAMES 가 종마 이름 전체를 정렬한 목록(Object.values(getStallionNames()).sort())이라 종마 이름이 늘면 샘플의 부·모 이름이 바뀐다. HEAD 의 303개 이름으로 고정하면 기존 지문과 같다(확인함, 생성기 로직 변경 아님). 이 테스트 파일은 M2-02 수정 범위 밖이므로 고치지 않았다. 재고정 값: e9d60fbddca1007141b33b6e0a3f5af02edd4db876ed59eccd53919d2f35193b. Opus 판단 필요.
- npm run typecheck: 통과(exit 0).
- npm run lint: 저장소 루트 실행 시 .claude/worktrees 아래 여러 tsconfig 가 잡혀 파싱 오류 1186건(환경 문제, 데이터·테스트 코드와 무관). 같은 설정을 HEAD 사본(/tmp)에서 실행하면 통과. tests/data/stallions.test.ts 는 tsconfigRootDir 지정 시 통과.

## M2-02 보강 — 사용자 제공 값 (2026-10-12)
위키백과 문서가 없거나 털색이 빈 14두와 부계 조상 5두를 사용자 값으로 추가(confidence medium).
| 종마 | 부 | 외조부 | 생년 | 털색 | 거리·표면 |
| --- | --- | --- | --- | --- | --- |
| Vekoma | Candy Ride | Speightstown | 2016 | ch | Mile → classic, dirt |
| Twirling Candy | Candy Ride | Chester House(미수록) | 2007 | dkb → brown | Sprint → speed, dirt |
| Maclean's Music | Distorted Humor | Unbridled's Song | 2008 | b | Sprint → speed, dirt |
| Yaupon | Uncle Mo | Vindication | 2017 | dkb → brown | Sprint → speed, dirt |
| Volatile | Violence | Unbridled's Song(위키) | 2016 | gr | Sprint(위키 경주 기록) → speed, dirt |
| Cairo Prince | Pioneerof the Nile | Holy Bull | 2011 | gr/ro → grey | Mile~Intermediate → classic, dirt |
| Audible | Into Mischief | Gilded Time(미수록) | 2015 | b | Intermediate → classic, dirt |
| Maximus Mischief | Into Mischief | Songandaprayer(미수록) | 2016 | b | Intermediate → classic, dirt |
| Flameaway | Scat Daddy | Fusaichi Pegasus(미수록) | 2015 | ch | Intermediate → classic, dirt |
| Tapiture | Tapit | Olympio(미수록) | 2011 | ch | Mile → classic, dirt (캐나다 계류) |
| The Factor | War Front | Miswaki | 2008 | gr/ro → grey | Sprint → speed, dirt(AW) |
| Kantharos | Lion Heart | Southern Halo(미수록) | 2008 | ch | Sprint → speed, dirt |
| Upstart | Flatter | Touch Gold(미수록) | 2012 | dkb → brown | Intermediate → classic, dirt |
| Collected | City Zip | Johannesburg | 2013 | ch | Classic → classic, dirt |
| 조상 | Lion Heart(2001, Tale of the Cat, ch) · Flatter(1999, A.P. Indy, b) · City Zip(1998, Carson City, ch) · Tale of the Cat(1994, Storm Cat, dkb → brown) · Carson City(1987, Mr. Prospector, ch) — status pensioned(계류·생존 미확인), 외조부 null |
- 미수록 외조부는 null(외조부만을 위한 레코드는 만들지 않음).

## M2-03 종마 마지막 교배 연도 lastCoverYear (haiku-data, 2026-10-12)

출처: 영어 위키백과 action=raw 원문. 인포박스 foaled·death_date(명세의 died 에 해당, 이 인포박스 템플릿의 필드명은 death_date), 본문 은퇴 문장(pensioned·retired from stud duty), 카테고리 "YYYY racehorse deaths", 리드 "(출생–사망)". 조회 간격 3.2초 이상, 429 는 30초 대기 후 재시도(429 30회 발생, 전부 재시도로 해소). 원문·스크립트·로그는 /tmp/m2_03 에만 두었고 저장소에는 넣지 않았다. 조회된 185두의 위키백과 출생연도는 데이터 foaled 와 모두 일치(불일치 0)하여 동명마가 아님을 확인했다. "retired to stud"(교배 시작) 문장은 은퇴로 보지 않았다.

### 채운 수

- 비현역 185두 중 136두 채움 (73.5%). 미채움 49두는 아래 확인 필요 표.
- historical 원본 124두 중 101두 채움 (81.5%): 위키백과 사망 연도.
- pensioned 원본 61두 중 35두 채움 (57.4%): 32두는 사망이 확인되어 status 를 historical 로 정정하고 연도를 기입, 3두는 사망 없이 은퇴 연도만 확인되어 pensioned 유지.
- 정정 후 status 분포: historical 156, pensioned 29, active 150 (active 변경 없음).

### 값 규칙 (명세 적용)

- historical: 사망 연도 (인포박스 death_date. 없으면 카테고리와 본문/리드가 같은 연도일 때만 채택, 출처 표시).
- pensioned + 사망 확인: status historical 로 정정. 값은 명세 pensioned 규칙에 따라 은퇴 연도가 있으면 은퇴 연도, 없으면 사망 연도 (7두, 아래 검토 1).
- pensioned + 사망 없음 + 은퇴 연도 있음: 은퇴 연도 (3두). "retired from breeding" 은 "retired from stud" 와 같은 뜻으로 채택.
- 둘 다 없으면 생략, 확인 필요 표에 올림.

### status 정정 목록 (pensioned → historical, 32두)

| key | 이름 | 출생 | lastCoverYear | 근거 |
| --- | --- | --- | --- | --- |
| stl_alydar | Alydar | 1975 | 1990 | 리드 범위+카테고리 |
| stl_arctic_tern | Arctic Tern | 1973 | 1998 | 본문+카테고리 |
| stl_bering | Bering | 1983 | 2009 | 은퇴 문장(사망 2011, 은퇴 우선) |
| stl_bernardini | Bernardini | 2003 | 2021 | infobox |
| stl_cadeaux_genereux | Cadeaux Genereux | 1985 | 2010 | 본문+카테고리 |
| stl_choisir | Choisir | 1999 | 2020 | 은퇴 문장(사망 2021, 은퇴 우선) |
| stl_coronado_s_quest | Coronado's Quest | 1995 | 2006 | 본문+카테고리 |
| stl_darshaan | Darshaan | 1981 | 2001 | 본문+카테고리 |
| stl_deep_impact | Deep Impact | 2002 | 2019 | infobox |
| stl_distant_view | Distant View | 1991 | 2006 | 은퇴 문장(사망 2018, 은퇴 우선) |
| stl_dixieland_band | Dixieland Band | 1980 | 2008 | 은퇴 문장(사망 2010, 은퇴 우선) |
| stl_empire_maker | Empire Maker | 2000 | 2020 | 리드 범위+카테고리 |
| stl_fappiano | Fappiano | 1977 | 1990 | 본문+카테고리 |
| stl_hail_to_reason | Hail to Reason | 1958 | 1976 | infobox |
| stl_halo | Halo | 1969 | 1997 | 은퇴 문장(사망 2000, 은퇴 우선) |
| stl_indian_charlie | Indian Charlie | 1995 | 2011 | 본문+카테고리 |
| stl_lando | Lando | 1990 | 2013 | 본문+카테고리 |
| stl_miswaki | Miswaki | 1978 | 2004 | 은퇴 문장(사망 2004, 은퇴 우선) |
| stl_monsun | Monsun | 1990 | 2012 | 본문+카테고리 |
| stl_noverre | Noverre | 1998 | 2012 | 본문+카테고리 |
| stl_observatory | Observatory | 1997 | 2019 | 본문+카테고리 |
| stl_rahy | Rahy | 1985 | 2009 | 은퇴 문장(사망 2011, 은퇴 우선) |
| stl_red_clubs | Red Clubs | 2003 | 2010 | 본문+카테고리 |
| stl_red_ransom | Red Ransom | 1987 | 2009 | 본문+카테고리 |
| stl_roberto | Roberto | 1969 | 1988 | 본문+카테고리 |
| stl_royal_charger | Royal Charger | 1942 | 1961 | infobox |
| stl_so_you_think | So You Think | 2006 | 2025 | infobox |
| stl_sunday_silence | Sunday Silence | 1986 | 2002 | infobox |
| stl_surumu | Surumu | 1974 | 1999 | 본문+카테고리 |
| stl_turn_to | Turn-to | 1951 | 1973 | infobox |
| stl_unbridled | Unbridled | 1987 | 2001 | infobox |
| stl_unbridleds_song | Unbridled's Song | 1993 | 2013 | infobox |

### 확인 필요 (미채움 49두)

| key | 이름 | 원래 status | 출생 | 사유 |
| --- | --- | --- | --- | --- |
| stl_acclamation | Acclamation | historical | 1999 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_anabaa_blue | Anabaa Blue | pensioned | 1998 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_archipenko | Archipenko | historical | 2004 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_avenue_of_flags | Avenue of Flags | historical | 1988 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_bailjumper | Bailjumper | historical | 1974 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_bernstein | Bernstein | historical | 1997 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_born_to_sea | Born To Sea | pensioned | 2009 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_cacique | Cacique | pensioned | 2001 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_carson_city | Carson City | pensioned | 1987 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_city_zip | City Zip | pensioned | 1998 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_cowboy_cal | Cowboy Cal | historical | 2005 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_dark_angel | Dark Angel | pensioned | 2005 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_deploy | Deploy | historical | 1987 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_dubai_destination | Dubai Destination | pensioned | 1999 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_dutch_art | Dutch Art | pensioned | 2004 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_dylan_thomas | Dylan Thomas | pensioned | 2003 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_elusive_quality | Elusive Quality | historical | 1993 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_flatter | Flatter | pensioned | 1999 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_fortino_ii | Fortino II | historical | 1959 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_frozen_power | Frozen Power | pensioned | 2007 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_ghostzapper | Ghostzapper | pensioned | 2000 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_half_ours | Half Ours | pensioned | 2003 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_hallowed_crown | Hallowed Crown | pensioned | 2011 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_harlan | Harlan | historical | 1989 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_hennessy | Hennessy | pensioned | 1993 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_include | Include | historical | 1997 | 사망 기재 없음. 본문: 2021 교배 시즌 후 pensioned, 2022 종부료 표기. status historical 과 충돌, Opus 확인 |
| stl_intent | Intent | historical | 1948 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_kaldounevees | Kaldounevees | historical | 1991 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_kendargent | Kendargent | historical | 2003 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_lawman | Lawman | pensioned | 2004 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_lion_heart | Lion Heart | pensioned | 2001 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_lord_at_war | Lord At War | historical | 1980 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_made_of_gold | Made Of Gold | historical | 1989 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_medaglia_d_oro | Medaglia d'Oro | pensioned | 1999 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_mineshaft | Mineshaft | historical | 1999 | 사망 기재 없음. 본문: 2025 교배 시즌 후 종마 은퇴. status historical 과 충돌, Opus 확인 |
| stl_najran | Najran | historical | 1999 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_nayef | Nayef | pensioned | 1998 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_new_approach | New Approach | pensioned | 2005 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_pour_moi | Pour Moi | pensioned | 2008 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_ride_the_rails | Ride the Rails | pensioned | 1991 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_silver_hawk | Silver Hawk | historical | 1979 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_stay_thirsty | Stay Thirsty | pensioned | 2008 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_tale_of_the_cat | Tale of the Cat | pensioned | 1994 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_tasleet | Tasleet | pensioned | 2013 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_tricky_creek | Tricky Creek | historical | 1986 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_vettori | Vettori | historical | 1992 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_waajib | Waajib | historical | 1982 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |
| stl_war_front | War Front | pensioned | 2002 | 문서 있음. 사망·은퇴 연도 기재 없음 (retired to stud 문장만) |
| stl_zamindar | Zamindar | historical | 1994 | 위키백과 문서 없음 (후보 제목 전부 404 또는 종마 인포박스 없음) |

### 검토 메모 (Opus 확인 권장)

1. pensioned 였다가 사망으로 historical 정정된 7두는 명세 pensioned 규칙(은퇴 연도 우선)을 적용했다. 사망 연도를 택하면 값이 달라진다: Dixieland Band 2008 (사망 2010), Choisir 2020 (사망 2021), Halo 1997 (사망 2000), Rahy 2009 (사망 2011), Distant View 2006 (사망 2018), Bering 2009 (사망 2011), Miswaki 2004 (사망 2004, 같음).
2. historical 원본 중 은퇴 문장 연도가 사망 연도와 다른 레코드는 명세 historical 규칙에 따라 사망 연도를 썼다. 은퇴 후 사망 전까지 교배 가능한 것으로 엔진에 남는 문제가 있다. 은퇴 문장 연도 목록 (은퇴 문장 자동 추출, 일부는 다른 맥락 문장일 수 있음):

| key | 이름 | 채택(사망) | 은퇴 문장 연도 |
| --- | --- | --- | --- |
| stl_acatenango | Acatenango | 2005 | 2004 |
| stl_ap_indy | A.P. Indy | 2020 | 2011 / 2017 |
| stl_awesome_again | Awesome Again | 2020 | 2019 |
| stl_dalakhani | Dalakhani | 2021 | 2016 |
| stl_danehill_dancer | Danehill Dancer | 2017 | 2014 |
| stl_dansili | Dansili | 2021 | 2018 |
| stl_danzig | Danzig | 2006 | 2004 |
| stl_diktat | Diktat | 2017 | 2007 / 2008 / 2010 / 2015 |
| stl_distorted_humor | Distorted Humor | 2026 | 2021 |
| stl_fastnet_rock | Fastnet Rock | 2025 | 2024 |
| stl_forty_niner | Forty Niner | 2020 | 1995 / 2007 |
| stl_green_desert | Green Desert | 2015 | 2011 |
| stl_grey_sovereign | Grey Sovereign | 1976 | 1972 |
| stl_holy_bull | Holy Bull | 2017 | 2012 |
| stl_in_excess | In Excess | 2013 | 2011 |
| stl_kingmambo | Kingmambo | 2016 | 2010 |
| stl_lyphard | Lyphard | 2005 | 1996 |
| stl_man_o_war | Man o' War | 1947 | 1943 |
| stl_mark_of_esteem | Mark of Esteem | 2014 | 2007 |
| stl_medicean | Medicean | 2018 | 2017 |
| stl_northern_dancer | Northern Dancer | 1990 | 1987 |
| stl_royal_applause | Royal Applause | 2022 | 2017 |
| stl_seeking_the_gold | Seeking the Gold | 2016 | 2005 / 2008 |
| stl_storm_bird | Storm Bird | 2004 | 1999 |

3. 카테고리만 근거: stl_cryptoclearance (사망 2009). 본문에 사망 문장 없음. 카테고리 "2009 racehorse deaths" 로 채택.
4. Tiznow: 2020년 10월 21일 발표 문장("retired from stud duty")의 연도 2020 을 은퇴 연도로 채택. 본문의 "death in October 2015" 는 부(Cee's Tizzy)의 사망이므로 Tiznow 와 무관.
5. Johannesburg: "retired from breeding in 2019" 를 은퇴 문장으로 채택 (2019).
6. Frosted (사망 2026-04-15), Distorted Humor (사망 2026-01-10): 인포박스 사망 연도 2026 채택. 2026 은 상한과 같다.
7. Seeking the Gold: 인포박스 died 필드 없이 death_date 템플릿(2016-07-28)에서 채택.
8. 카테고리 근거(인포박스 사망 필드 없음) 기입 레코드는 본문 또는 리드 "(출생–사망)" 과 같은 연도인 것만 채택했다. 해당 목록은 근거 열에 "본문+카테고리" / "리드 범위+카테고리" 로 표시.

