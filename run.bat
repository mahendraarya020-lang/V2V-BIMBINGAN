@echo off
setlocal

set ROOT_DIR=%~dp0
set FRONTEND_DIR=%ROOT_DIR%frontend
set BACKEND_DIR=%ROOT_DIR%backend

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Folder frontend tidak ditemukan.
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Folder backend tidak ditemukan.
  pause
  exit /b 1
)

echo Menghentikan proses yang memakai port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000.*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo =========================================
echo Membangun Aplikasi (Production Build)
echo =========================================
echo.
echo [1/2] Membangun Backend...
cd /d "%BACKEND_DIR%"
call npm run build

echo.
echo [2/2] Membangun Frontend...
cd /d "%FRONTEND_DIR%"
call npm run build

echo.
echo =========================================
echo Menjalankan Platooning Server
echo =========================================
echo.
start "Platooning Server" cmd /k "cd /d "%BACKEND_DIR%" && npm run start"

timeout /t 3 /nobreak >nul
start "" "http://localhost:4000"

echo.
echo Server telah dijalankan secara terpadu:
echo - URL Aplikasi : http://localhost:4000
echo.
echo Tutup jendela terminal "Platooning Server" untuk menghentikan aplikasi.
echo.
pause
