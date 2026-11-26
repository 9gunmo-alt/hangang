# 한강라면 관리 (PC 프로그램)

노트북은 **매출 봇만** 켜두고, 이 프로그램은 **아무 PC에서나** exe 하나로 실행.

| 화면 | 하는 일 |
|---|---|
| 개요 | 이번 달 매출 · 지출 · 순이익(월말 예상), 일별 매출, 기계별 매출, 재고 부족 |
| 매출 | 하루 평균 · 오늘 · 최고 매출일, 일별 막대(누르면 그날 기계별·상품별), 날짜 × 기계 표 |
| 지출 | 쿠팡에서 가져온 주문 + 직접 입력한 지출을 한 장부로. 체크 끄면 손익에서 빠짐, 매달 반복 |
| 재고 현황 | 기계 4대 실제 재고. 수량 − / + / 직접 입력, 판매가격 → [기계에 반영] (노트북 봇이 처리) |
|  | 라면1·2: 벤딩페이 [현재 정보 저장] / [불러오기], 저장 아이콘 = 저장된 정보 보기 |
| 월별 손익 | 선택한 달 손익 + 전월 대비, 글자로 복사 · PDF · 엑셀 |

## 데이터가 있는 곳
- **매출·재고**: 노트북 봇이 올리는 `hangang/docs/data.json` (GitHub에서 바로 읽음)
- **장부** (지출·쿠팡 주문·체크·설정): 비공개 저장소 `hangang-data/ledger.json`
  → 어느 PC에서 열어도 똑같음. 바꿀 때마다 GitHub에 기록이 남아서 되돌릴 수 있음
- **재고 작업**: `hangang-data/jobs/` 로 요청 → 노트북 봇(`scraper/jobs.py`)이 처리 → `results/` 로 결과
- 이 PC에는 토큰과 빠른 시작용 캐시만: `%APPDATA%\HangangManager`
- 예전 쿠팡 발주 계산기에서 가져온 주문·체크는 장부를 처음 만들 때 자동으로 옮겨옴

## 처음 한 번
1. **GitHub에서 비공개 저장소 `hangang-data` 만들기** (Private, Add a README 체크)
2. **토큰 만들기**: Settings → Developer settings → Fine-grained tokens → Generate
   - Expiration: 길게 (1년)
   - Repository access: Only select → `hangang-data`, `hangang`
   - Permissions → Repository → **Contents: Read and write**
3. **exe 만들기** (메인 PC에서 한 번): `manager\build_exe.bat` → `manager\dist\HangangManager.exe`
4. exe 실행 → 연결 화면에 토큰 붙여넣기 → [연결]
5. **노트북**: GitHub Desktop으로 최신 코드 받기(Pull) → 매출 봇(run_gui.bat) 다시 켜기
   → 노트북에서도 HangangManager.exe 를 한 번 켜서 같은 토큰으로 연결해 두면
     봇이 그 설정으로 재고 작업을 받음 (또는 `scraper\github_token.json` 에
     `{"token": "토큰", "dataRepo": "9gunmo-alt/hangang-data"}` 저장)

다른 PC: `HangangManager.exe` 하나만 복사해서 실행 → 토큰 붙여넣기.

## 속도
- 켜면 지난번 데이터를 바로 띄우고 뒤에서 최신으로 갱신 (보통 1초 안쪽)
- 매출·재고는 1분마다, 바뀐 게 있을 때만 받음
- 재고 수정 등은 노트북 봇이 15초마다 확인 → 보통 30초~1분 안에 기계에 반영
  (노트북이 꺼져 있으면 켜질 때까지 대기, 6시간 넘은 요청은 건너뜀)

## 개발용
- `run_dev.bat` : 파이썬으로 바로 실행 (`python app.py --debug` 는 개발자 도구 열림)
- 오류 기록: `%APPDATA%\HangangManager\error.log`
