@echo off
rem Starts the local server and opens the application in the browser.
rem
rem ES modules do not load over file://, so the page needs an HTTP origin.
rem Node serves it with server.js; if Node is not installed, the built-in
rem server of Python does the same job, and if neither is there the script
rem says so instead of flashing a black window and disappearing.
rem
rem The code page is switched to UTF-8 so that the messages below read the
rem same in a modern terminal and in the classic console window.

setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

where node >nul 2>nul
if %errorlevel%==0 (
    echo Запуск через Node...
    start "" "http://localhost:%PORT%/"
    node server.js %PORT%
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo Node не найден, запуск через Python...
    echo   Откройте в браузере:  http://localhost:%PORT%/
    start "" "http://localhost:%PORT%/"
    python -m http.server %PORT% --bind 127.0.0.1
    goto :end
)

echo.
echo Не найдено ни Node, ни Python.
echo.
echo Приложению нужен локальный HTTP-сервер: браузеры не загружают
echo ES-модули со схемы file://, поэтому просто открыть index.html нельзя.
echo.
echo Установите Node.js 20 или новее: https://nodejs.org/
echo и запустите этот файл снова.
echo.
pause

:end
endlocal
