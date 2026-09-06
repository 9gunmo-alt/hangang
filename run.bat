@echo off
chcp 65001 >nul
cd /d %~dp0
echo === 한강라면 실시간 매출 봇 ===
echo 이 창을 켜두면 1분마다 자동 수집됩니다. 끄려면 이 창을 닫으세요.
echo.
python scraper\run_local.py
pause
