# 한강라면 무인매장 통합 매출

5대(슬림·라면1·라면2·냉동·냉장) 매출을 한 화면에서 보는 폰 대시보드 + 자동 수집 로봇.

- **대시보드**: `docs/index.html` — 폰 브라우저에서 열고 "홈 화면에 추가"하면 앱처럼 씀
- **수집 로봇**: `scraper/scrape.py` — 5대 기계 링크를 열어 거래내역을 긁어 `docs/data.json` 생성
- **자동 실행**: `.github/workflows/scrape.yml` — 매시간 알아서 돌림 (컴퓨터 안 켜도 됨)

> 기계 링크는 로그인 없이 열려서 **아이디·비번이 전혀 필요 없다.** 다만 페이지가
> JavaScript로 그려지기 때문에 로봇은 진짜 브라우저(Playwright)로 페이지를 실제로 연다.

## 처음 한 번만 하는 셋업

### 1. GitHub 저장소 만들기
이 폴더를 그대로 새 저장소에 올린다. (예: hanriver-sales) **반드시 Private 로.**

### 2. Pages 켜기
저장소 → Settings → Pages → Source: Deploy from a branch, 브랜치 main, 폴더 /docs → Save.
잠시 뒤 https://<아이디>.github.io/<저장소이름>/ 이 대시보드 주소가 된다. 폰에서 열고 홈 화면에 추가.

### 3. 로봇 처음 돌려보기
저장소 → Actions → 매출 수집 → Run workflow 로 수동 실행.
성공하면 docs/data.json 이 갱신되고, 대시보드 새로고침하면 5대 실데이터가 뜬다.
이후부턴 매시간 자동 갱신. (올리자마자도 docs/data.json 에 냉동·슬림 실데이터가 있어 화면은 바로 뜸.)

## 자주 만지는 것
- 기계 추가/이름 변경: scraper/scrape.py 맨 위 MACHINES 목록만 수정.
- 수집 주기: .github/workflows/scrape.yml 의 cron. "0 * * * *"=매시, "*/30 * * * *"=30분마다.
- 수집이 비면: Actions 로그에 기계별 건수가 나온다. 표가 늦게 그려지면 scrape.py 의
  collect_machine() 안 wait_for_timeout 값을 늘린다.

## 주의 (중요)
기계 링크는 로그인 없이 누구나 열리는 구조라, 링크를 아는 사람은 매출을 볼 수 있다.
- 저장소는 반드시 Private. (docs/data.json 에 거래내역 포함)
- 대시보드 주소와 기계 링크를 남에게 공유하지 않는다.
