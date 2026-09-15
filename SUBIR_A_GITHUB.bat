@echo off
title Barberia Cero y Medio - Subir a GitHub
chcp 65001 > nul
cls

cd /d "%~dp0"

echo ===============================================================
echo        BARBERIA CERO Y MEDIO - SINCRONIZACION CON GITHUB
echo ===============================================================
echo.
echo Repositorio destino: https://github.com/goleadorepico-ui/barberia-cero-y-medio.git
echo Rama: main
echo.

echo [*] Agregando archivos actualizados...
git add .

echo [*] Creando commit de sincronizacion...
git commit -m "Sincronizacion nube 24/7 con Render y Turso Cloud" 2>nul
if %errorlevel% neq 0 (
    echo [*] No hay cambios pendientes de commit, continuando con el push...
)

echo.
echo [*] Subiendo a GitHub (origin main)...
echo.

git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ===============================================================
    echo      SUBIDA A GITHUB COMPLETADA CON EXITO!
    echo ===============================================================
    echo Render desplegara la version actualizada en unos instantes.
) else (
    echo.
    echo ===============================================================
    echo  [AVISO] Hubo un error al sincronizar con GitHub.
    echo  Verifica tu conexion a internet o tus credenciales de GitHub.
    echo ===============================================================
)

echo.
pause
