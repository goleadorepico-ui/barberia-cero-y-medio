@echo off
title Barberia Cero y Medio - Configurar Turso Cloud (24/7)
chcp 65001 > nul
cls

cd /d "%~dp0"

echo ===============================================================
echo   BARBERIA CERO Y MEDIO - BLINDAJE CON TURSO CLOUD (24/7)
echo ===============================================================
echo.
echo Este asistente conectara la barberia a tu base de datos en la
echo nube de Turso Cloud para que NUNCA mas se pierda ningun dato.
echo Cada corte, deuda, cliente y cierre se guardara en la nube.
echo.
echo ===============================================================
echo.

set /p TURSO_URL="1. Pega la URL de tu base de datos Turso (ej. libsql://...): "
echo.
set /p TURSO_TOKEN="2. Pega el Token secreto de Turso: "
echo.

if "%TURSO_URL%"=="" (
    echo [ERROR] La URL no puede estar vacia.
    pause
    exit /b 1
)

if "%TURSO_TOKEN%"=="" (
    echo [ERROR] El Token no puede estar vacio.
    pause
    exit /b 1
)

echo [*] Conectando y subiendo datos actuales a Turso Cloud...
echo.

python migrate_to_turso.py "%TURSO_URL%" "%TURSO_TOKEN%"

echo.
pause
