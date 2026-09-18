@echo off
setlocal enabledelayedexpansion

echo =======================================================================
echo         FACE RECOGNITION ATTENDANCE SYSTEM - LOCAL RUNNER FOR WINDOWS
echo =======================================================================
echo.

:: Check Python installation
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to your system PATH.
    echo Please download and install Python from https://www.python.org/
    pause
    exit /b 1
)

:: Get python version
for /f "tokens=2" %%i in ('python -V') do (
    set PY_VER=%%i
)
echo [INFO] Detected Python version: !PY_VER!

:: Set up virtual environment
if not exist venv (
    echo [INFO] Creating Python virtual environment ^(venv^)...
    python -m venv venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Virtual environment ^(venv^) already exists.
)

:: Activate environment
echo [INFO] Activating virtual environment...
call venv\Scripts\activate.bat

:: Upgrade pip
echo [INFO] Upgrading pip...
python -m pip install --upgrade pip

:: Install base requirements
echo [INFO] Installing base requirements...
pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install base requirements.
    pause
    exit /b 1
)

:: Try installing dlib via the Python 3.14 wheel
echo [INFO] Installing dlib for Python 3.14...
pip install https://github.com/sachadee/Dlib/raw/main/dlib-20.0.0-cp314-cp314-win_amd64.whl
if !errorlevel! neq 0 (
    echo.
    echo [WARNING] Direct wheel installation failed.
    echo [WARNING] Attempting standard dlib installation from source...
    echo [WARNING] Note: This requires CMake and Visual Studio C++ Build Tools to be installed!
    echo.
    pip install cmake
    pip install dlib
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install dlib. Please make sure Visual Studio Build Tools with C++ workload is installed.
        pause
        exit /b 1
    )
)

:: Install face_recognition
echo [INFO] Installing face_recognition...
pip install face_recognition
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install face_recognition.
    pause
    exit /b 1
)

:: Run sanity check
echo.
echo =======================================================================
echo                      RUNNING SANITY CHECK
echo =======================================================================
python test_recognition.py
if !errorlevel! neq 0 (
    echo [ERROR] Sanity check failed! Imports are not working properly.
    pause
    exit /b 1
)
echo [SUCCESS] All libraries imported successfully!
echo =======================================================================
echo.

:: Start Flask app
echo [INFO] Launching Face Recognition Attendance System Web Server...
echo [INFO] Server will run at: http://127.0.0.1:5000
echo.
python app.py
pause
