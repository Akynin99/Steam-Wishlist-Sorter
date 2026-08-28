@echo off
rem Starts the local server and opens the application in the browser.
rem
rem ES modules do not load over file://, so the page needs an HTTP origin.
rem Node serves it with server.js; if Node is not installed, the built-in
rem server of Python does the same job, and if neither is there the script
rem says so instead of flashing a black window and disappearing.
rem
rem The code page is switched to UTF-8 so that a path with non-Latin letters
rem in it prints the same in a modern terminal and in the classic console
rem window.

setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem A second copy of this script, started by the branch below, waits for the
rem server to come up and only then opens the browser. Opening it right away
rem raced the server: the first tab showed a connection error and had to be
rem reloaded by hand.
if /i "%~1"=="--open-browser" goto :open_browser

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

where node >nul 2>nul
if %errorlevel%==0 (
    echo Starting through Node...
    start "" /b cmd /c ""%~f0" --open-browser %PORT%"
    node server.js %PORT%
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo Node was not found, starting through Python...
    echo   Open in the browser:  http://localhost:%PORT%/
    start "" /b cmd /c ""%~f0" --open-browser %PORT%"
    python -m http.server %PORT% --bind 127.0.0.1
    goto :end
)

echo.
echo Neither Node nor Python was found.
echo.
echo The application needs a local HTTP server: browsers do not load ES
echo modules over file://, so opening index.html on its own does not work.
echo.
echo Install Node.js 20 or newer: https://nodejs.org/
echo and run this file again.
echo.
pause
goto :end

rem Waits a couple of seconds for the port to start answering and opens the
rem browser. `timeout` needs a console of its own; when it does not get one,
rem the ping to the loopback address is the classic stand-in for a sleep.
:open_browser
timeout /t 2 /nobreak >nul 2>nul || ping -n 3 127.0.0.1 >nul
start "" "http://localhost:%~2/"
goto :end

:end
endlocal
