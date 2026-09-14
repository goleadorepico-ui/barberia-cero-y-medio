@echo off
title Cero y Medio - Barberia
cd /d "%~dp0"
echo =======================================================
echo          CERO Y MEDIO - SISTEMA DE BARBERIA
echo =======================================================
echo.
python iniciar_sistema.py
if %errorlevel% neq 0 (
    echo.
    echo Abriendo directamente en tu navegador...
    start "" "%~dp0index.html"
)
pause

