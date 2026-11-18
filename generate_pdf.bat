@echo off
set SCRIPT_DIR=%~dp0
echo Generating Weekly Report PDF...
start /wait "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="%SCRIPT_DIR%Weekly_Report_Pavel_Dinesh.pdf" "%SCRIPT_DIR%report.html"
echo Done! PDF created: %SCRIPT_DIR%Weekly_Report_Pavel_Dinesh.pdf
pause
