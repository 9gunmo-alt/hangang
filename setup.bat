@echo off
chcp 65001 >nul
cd /d %~dp0
echo === 한강라면 봇 설치 (처음 한 번만) ===
python --version
if errorlevel 1 (
  echo.
  echo [!] 파이썬이 없어요. python.org 에서 설치하고, 설치 화면에서
  echo     "Add python.exe to PATH" 체크한 뒤 다시 실행하세요.
  pause
  exit /b
)
echo.
echo 라이브러리 설치 중...
pip install -r scraper\requirements.txt
echo.
echo 브라우저(크로미움) 설치 중... (묶음거래 상세용, 한 번만)
python -m playwright install chromium
echo.
echo === 설치 완료! 이제 run.bat 을 실행하세요. ===
pause
