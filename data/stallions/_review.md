# M2-01 실명 종마 검수표 (Opus 검수용, 2차 갱신)

작성: haiku-data · 기준 시점 2026-10-11 · 자료: 위키백과 원문(action=raw) 교차 확인 + 일부 기억 기반 (표시됨).

## 판정 기준 (Opus 정책 변경 반영)

- active: 위키백과에 현역 계류(종마 기재)가 있고 사망·은퇴(종마 은퇴) 기록이 없음. standsIn = 기사의 최근 계류 국가. confidence = medium (연도 미확인 기사는 low).
- historical: 사망 기재 확인. pensioned: 은퇴 기록 또는 계류 상태 미확인 생존 종마.
- 출생국: CountryCode 에 CA 추가 반영 (Northern Dancer, Storm Bird = CA).

## 요약

- 종마 73두: active 31 (유럽 21, 미국 더트·양용 10), pensioned 14, historical 28.
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
| stl_essential_quality | Essential Quality | active | US | medium | 위키백과 infobox: 부 Tapit, 모부 Elusive Quality(미수록), 2018년 생, 미국. "His stud fee for the 2025 breeding season is $50,000" 기재 → 현역 US(더트). 계류 장소 미명기 → 미국 추정. |
| stl_flightline | Flightline | active | US | medium | 위키백과 infobox: 부 Tapit, 모부 Indian Charlie(미수록), 2018년 3월 14일 생, 미국. "His 2026 stud fee was $125,000" 기재 → 현역 US(더트). 계류 장소 미명기 → 미국 추정. |
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
| stl_vino_rosso | Vino Rosso | active | US | medium | 위키백과 infobox: 부 Curlin, 모부 Street Cry(미수록), 2015년 생, 미국. "As of 2023 he stands for a stud fee of $15,000" → 현역 US(더트). |
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

## M2-01b 진행 상태 (2026-10-11, 중단 — Opus 확인 필요)

- 출처: 사용자 제공 2026 명단(그룹 A~H, 81두). 명단 출처 표기는 적지 않는다.
- 중단 사유: 위키백과 원문 조회가 권한 분류기에서 차단되어 신규 종마의 출생연도·출생국·부계·거리/주로 성향을 확인하지 못했다. 확인 없이 혈통을 채우지 않았다.
- 완료: 기존 레코드 15두 갱신 (status active, standsIn, marketTier 규칙, confidence high).
  Australia, Camelot, Churchill, Gleneagles, Holy Roman Emperor, Practical Joke, Dubawi, Too Darn Hot, Ghaiyyath, Night of Thunder, Teofilo, Essential Quality, Medaglia d'Oro, Frankel, Kingman.
- 미완료: 신규 66두 (아래 목록). stallions.json·names.json·sire_lines.json 은 변경하지 않았다 (키 집합 테스트 유지).
- 테스트 하한(유럽 50·미국 더트/양용 15)은 아직 되돌리지 않았다. 데이터 완성 후 변경한다.
- 부계 미확인 종마: 아직 없음 (확인 자체를 하지 못함). 확인 후 부계가 끝내 안 나오는 종마만 sireKey null 루트로 두고 여기에 적는다.
- 명단 표기 보정 적용: Territories, Cloth of Stars, Footstepsinthesand, Medaglia d'Oro.

### 신규 추가 대기 66두 (국가·계류국 기준, 전부 active / confidence high 예정)

- 그룹 A (IE, EUR, 16): Auguste Rodin, Blackbeard, Camille Pissarro, City of Troy, Delacroix, Footstepsinthesand, Henri Matisse, Henry Longfellow, Little Big Bear, No Nay Never, Paddington, Saxon Warrior, Sioux Nation, St Mark's Basilica, Starspangledbanner, The Antarctic
- 그룹 B (US, USD, 14): Citizen Bull, Corniche, Domestic Product, Echo Town, Epicenter, Fierceness, Golden Pal, Gunite, Jack Christopher, Justify, Mo Town, Munnings, Sierra Leone, Tiz The Law
- 그룹 C (GB, GBP, 11): Cracksman, Farhh, Harry Angel, Iffraaj, Masar, Modern Games, Palace Pier, Perfect Power, Pinatubo, Territories, Triple Time
- 그룹 D (FR, EUR, 2): Cloth of Stars, Victor Ludorum
- 그룹 E (IE, EUR, 6): Blue Point, Earthlight, Native Trail, Naval Crown, Raven's Pass, Space Blues
- 그룹 F (US, USD, 11): Cody's Wish, Enticed, Frosted, Hard Spun, Maxfield, Midshipman, Mystic Guide, Nyquist, Proxy, Speaker's Corner, Street Sense
- 그룹 G (GB, GBP, 4): Bated Breath, Chaldean, Lead Artist, Oasis Dream
- 그룹 H (US, USD, 2): Elite Power, Mandaloun

### 마켓 등급 규칙 (명단 교배료 → marketTier, 금액은 저장하지 않음)

100,000 이상 → 1 / 50,000~99,999 → 2 / 25,000~49,999 → 3 / 10,000~24,999 → 4 / 10,000 미만 → 5 / 비공개 → 4

### 그룹 I 추가 (사용자 제공 2026 명단, 2026-10-11 추가)

- 교배료 미기재 → marketTier 는 Opus 지정: Sea The Stars 1 · Siyouni 1 · Zarak 3 · Vadeni 3 · Daryz 4 · Erevann 4.
- 기존 레코드 갱신 (2두): Sea The Stars (IE, tier 1, high), Siyouni (FR, tier 1, high). 계류국은 기존 검수표(위키백과 확인분)와 일치.
- 신규 대기 4두 (위키백과 미확인, 기본값 계류국 사용 — 표시):
  - Zarak: FR (기본값, 미확인) · tier 3 · confidence high 예정
  - Vadeni: IE (기본값, 미확인) · tier 3 · confidence high 예정
  - Daryz: FR (기본값, 미확인) · tier 4 · confidence high 예정
  - Erevann: FR (기본값, 미확인) · tier 4 · confidence high 예정
- 명단 수: 87두 (기존 갱신 17두 + 신규 대기 70두). 추가 완료 0두, 신규 추가 대기 70두.
