@echo off
setlocal
echo --- BTC Smart Money Backtester ---
echo.

:: 1. Try to find Python
echo Checking for Python...

:: Try standard 'python' command
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
    goto :FOUND
)

:: Try 'py' launcher (often works when PATH is missing)
py --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=py
    goto :FOUND
)

:: If we get here, neither worked
goto :NOT_FOUND

:FOUND
echo Found Python! Using command: %PYTHON_CMD%
%PYTHON_CMD% --version
echo.

:: Check for Python 3.14 (too new for some libraries)
%PYTHON_CMD% check_version.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [CRITICAL ERROR] Python 3.14 detected!
    echo.
    echo Please UNINSTALL Python 3.14 and install Python 3.11.
    echo.
    echo Opening Python 3.11 Download Page...
    start https://www.python.org/downloads/release/python-3119/
    pause
    exit /b
)


echo Installing requirements...
%PYTHON_CMD% -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Dependency installation failed.
    echo Ensure you have internet access and pip is installed.
    pause
    exit /b
)

echo.
echo 1. Running Backtest with Plots...
%PYTHON_CMD% backtest_runner.py --plot
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backtest execution failed.
    pause
    exit /b
)

echo.
echo 2. Running Advanced Analysis (Monte Carlo ^& Walk-Forward)...
echo This might take a minute...
%PYTHON_CMD% advanced_analysis.py

echo.
echo Done! Results are in the "results" folder.
echo Opening plot...
start results/backtest_plot.html

pause
exit /b

:NOT_FOUND
echo.
echo [ERROR] Python not found!
echo.
echo Troubleshooting steps:
echo 1. Did you check "Add Python to PATH" during installation?
echo    If not, please reinstall Python and check that box.
echo.
echo 2. "App Execution Aliases" issue?
echo    Go to Windows Settings ^> Apps ^> Advanced app settings ^> App execution aliases.
echo    Turn OFF the switches for "python.exe" and "python3.exe" (App Installer).
echo.
echo Opening Python Download Page again just in case...
start https://www.python.org/downloads/
pause
