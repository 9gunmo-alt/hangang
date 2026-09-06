# 매장 노트북 실시간 봇 (GUI · 라이센스 봇과 같은 방식)

노트북이 켜져 있는 동안 1분마다 5대 매출을 긁어 GitHub에 올린다.
폰 대시보드는 이걸 바로 받아 "거의 실시간"으로 보여준다.

## 역할 분담
- 메인 컴퓨터: 화면(docs/index.html) 수정 후 GitHub push (대시보드 관리)
- 노트북: 봇만 켜두기 (매출을 실시간으로 push)
- 둘 다 같은 저장소를 Clone 하면 충돌 없이 굴러감(봇은 push 전 자동 pull).

## 노트북 설치 (처음 한 번)
1. GitHub Desktop 설치 → 같은 저장소(hangang) Clone  (봇 push 위해 .git 연결 필요)
2. 파이썬 설치(3.12 권장, "Add python.exe to PATH" 체크)
3. 폴더에서 setup.bat 더블클릭  → 라이브러리(pywebview 등) + 브라우저 설치
   (라이센스 봇을 이미 쓰는 PC면 pywebview는 이미 있음)

## 실행
- run_gui.bat 더블클릭  → 라이센스 봇 같은 창이 뜨고 자동으로 수집 시작
  - 상단: 제목 + 🟢수집 중/⚫정지
  - 버튼: ▶ 시작 / ■ 정지 / ⟳ 지금 수집
  - 탭: 상태(오늘 매출·거래수·마지막 갱신 + 기계별 표) / 로그
  - 최소화(_): 작업표시줄 / X: 트레이(시계 옆)로 숨겨 계속 실행 → 트레이 우클릭 종료
- 바탕화면에서 쓰려면 run_gui.bat 우클릭 → 바로가기 만들기.

## 참고
- 매출이 바뀔 때만 올림 → 조용한 시간엔 "변화 없음"이 정상.
- 노트북 꺼지면 멈춤(다시 run_gui 실행하면 재개). 급하면 GitHub Actions 수동 Run.
- 창이 안 뜨면 (디버그용) 폴더에서:  python scraper\app_gui.py  로 실행해 오류 확인.
- GUI 없이 검은 창으로 돌리려면 run.bat (run_local.py) 도 있음.
- 저장소 이름이 hangang 이 아니면 docs/index.html 의 DATA_URLS 와 알려주세요.
