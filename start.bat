@echo off
title Social Saver - Instagram Story & HD Profil Indirici
cd /d "%~dp0"
echo ========================================================
echo   Social Saver - Instagram Story ve HD Profil Araci
echo ========================================================
echo.

if exist ".venv\Scripts\python.exe" (
    echo [OK] Sanal ortam algilandi (.venv)
    ".venv\Scripts\python.exe" run.py
) else (
    where uv >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo [OK] uv ile baslatiliyor...
        uv run python run.py
    ) else (
        echo [OK] Sistem Python'u ile baslatiliyor...
        python run.py
    )
)

pause
