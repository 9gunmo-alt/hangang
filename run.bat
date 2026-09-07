@echo off
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo Hanriver Sales Bot (console). Keep this window open. Close to stop.
python scraper\run_local.py
pause
