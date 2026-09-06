@echo off
cd /d "%~dp0"
echo [run_gui] folder: %CD%
echo [run_gui] starting bot...
python scraper\app_gui.py
echo.
echo [run_gui] python exited. (code %errorlevel%)
pause
