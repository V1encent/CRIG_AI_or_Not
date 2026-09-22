@echo off
rem ════════════════════════════════════════════════════════════════════════
rem  CRIG Ontdekt — "AI of niet AI?"  本地服务器
rem
rem  开发时用它，公网部署也是这条路（纯静态文件，丢进任何 web 根目录即可）。
rem
rem  ★ 但它【不能替代】验收测试。
rem    file:// 与 http:// 两条路径会分叉：service worker、Web Share、
rem    localStorage 的行为都不一样。最终验收必须在展台机器上
rem   双击 index.html（或跑 kiosk.bat）跑一遍。
rem ════════════════════════════════════════════════════════════════════════
setlocal
cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%/index.html"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   找不到 python。用任意静态服务器指向本目录也可以，例如：
  echo       npx --yes serve -l %PORT%
  echo.
  pause
  exit /b 1
)

echo.
echo   服务目录：%CD%
echo   游戏地址：%URL%
echo   调试地址：%URL%?autoplay=20^&seed=12345   ^(无人值守跑 20 轮^)
echo              %URL%?mode=kiosk               ^(在 http 下测展台行为^)
echo.
echo   按 Ctrl+C 停止。
echo.

rem 浏览器稍后再开，给服务器一点启动时间；用 start 让服务器留在前台，
rem 关掉这个窗口就等于关掉服务。
start "" cmd /c "timeout /t 2 >nul & start "" "%URL%""
python -m http.server %PORT%

endlocal
