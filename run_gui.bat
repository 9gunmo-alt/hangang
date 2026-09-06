@echo off
cd /d %~dp0
REM VBS trick: run python (not pythonw) but hide the console window
echo Set s=CreateObject("WScript.Shell") > "%TEMP%\hanriver_run.vbs"
echo s.CurrentDirectory = "%~dp0" >> "%TEMP%\hanriver_run.vbs"
echo s.Run "python scraper\app_gui.py", 0, False >> "%TEMP%\hanriver_run.vbs"
cscript //nologo "%TEMP%\hanriver_run.vbs"
del "%TEMP%\hanriver_run.vbs"
