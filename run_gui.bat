@echo off
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo [run_gui] starting bot...
python scraper\app_gui.py
echo.
echo [run_gui] python exited. (code %errorlevel%)
pause
