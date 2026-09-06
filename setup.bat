@echo off
cd /d %~dp0
echo === Hanriver Sales Bot - Setup (run once) ===
python --version
if errorlevel 1 (
  echo.
  echo [!] Python not found. Install Python 3.12 from python.org
  echo     and CHECK "Add python.exe to PATH" on the first screen, then run again.
  pause
  exit /b
)
echo.
echo Installing libraries...
python -m pip install pywebview playwright beautifulsoup4 requests
echo.
echo Installing browser (Chromium, one time, 1-2 min)...
python -m playwright install chromium
echo.
echo === Done! Now run: run_gui.bat ===
pause
