@echo off
cd /d "%~dp0"
echo === Hangang Manager - build exe (once) ===
python --version
if errorlevel 1 (
  echo [!] Python not found. Install Python 3.12 from python.org and check "Add python.exe to PATH".
  pause
  exit /b
)
python -m pip install --upgrade pywebview requests pyinstaller
python -m PyInstaller --noconfirm --onefile --windowed --name HangangManager --add-data "web;web" --add-data "coupang.js;." app.py
if errorlevel 1 (
  echo.
  echo [!] Build failed. If you use a very new Python, install Python 3.12 and run again.
  pause
  exit /b
)
echo.
echo Done: dist\HangangManager.exe  -- copy this one file to any PC and run it.
pause
