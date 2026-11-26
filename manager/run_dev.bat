@echo off
cd /d "%~dp0"
set PYTHONUTF8=1
python -m pip install -q pywebview requests
python app.py
if errorlevel 1 pause
