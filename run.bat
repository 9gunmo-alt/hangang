@echo off
cd /d %~dp0
echo Hanriver Sales Bot (console). Keep this window open. Close to stop.
python scraper\run_local.py
pause
