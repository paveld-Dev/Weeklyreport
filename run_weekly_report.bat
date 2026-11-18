@echo off
cd /d "%~dp0"
echo ====================================================
echo Starting Weekly Report Generator Automation
echo ====================================================
node weekly_report.mjs
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Weekly Report generation failed.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo [SUCCESS] Report generated and draft created.
pause
