@echo off
rem ════════════════════════════════════════════════════════════════════════
rem  CRIG Ontdekt — "AI of niet AI?"  展台启动器
rem
rem  用法：活动当天双击这个文件。要退出按 Alt+F4。
rem
rem  ★ 为什么用 --kiosk 而不是全屏 API：
rem    全屏 API 必须由用户手势触发，于是机器刚开机、还没人碰过屏幕时，
rem    画面是带地址栏的窗口。--kiosk 从进程启动就是全屏，没有这个缝。
rem    页面里的全屏请求仍然保留（attract 屏首次点击时），两条路并存。
rem ════════════════════════════════════════════════════════════════════════
setlocal

rem ★ 必须拼成【绝对】 file:// URL。
rem   曾写成相对路径 "index.html" 并 cd 到本目录，实测【不成立】：
rem   Chrome 把命令行上的相对路径当成搜索词，打开的是一张错误页，
rem   而退出码仍然是 0——展会当天会表现为"双击了，出来个空白页"。
rem   反斜杠换成斜杠；路径里的空格【不】需要转义，实测 Chrome 接受原样空格。
set "HERE=%~dp0"
set "URL=file:///%HERE:\=/%index.html"

rem ── 找浏览器：Chrome 优先，退到 Edge（同为 Chromium，行为一致）──────
rem   刻意不用 for 循环列路径：%ProgramFiles(x86)% 展开后含右括号，
rem   会把 for 的括号列表提前截断。顺序 if 更啰嗦但不会踩这个坑。
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not exist "%CHROME%" (
  echo.
  echo   找不到 Chrome 或 Edge。请手工打开本目录下的 index.html，
  echo   然后按 F11 进入全屏。
  echo.
  pause
  exit /b 1
)

rem ★ --user-data-dir 是这一行里最重要的参数，不是可有可无的卫生习惯：
rem   Chrome 若已在用【默认配置】运行，新进程只是往现有窗口里丢一个标签页，
rem   命令行上的 --kiosk 会被【静默忽略】——展会当天表现为"双击了但没全屏"，
rem   而且看起来像是页面的问题。用独立配置目录就永远走全新进程。
rem   顺带也不碰工作人员自己的书签、登录状态和历史记录。
set "PROFILE=%TEMP%\aon-kiosk"

rem ★ 刻意【不】传 --allow-file-access-from-files。
rem   页面在 file:// 下的全部写法（经典 script、题库是 .js 全局量、
rem   系统字体栈、storage 包装）都是为了让它在默认权限下就能跑。
rem   加上那个开关会把 CORS 限制关掉，于是哪天有人手滑引入了 ES module，
rem   在这台机器上仍然能跑，到别的机器上才炸。宁可现在就炸。
rem
rem   参数写在一行里，不用 ^ 续行：续行要求文件是 CRLF，一旦哪天被人
rem   用 LF 编辑器存过，^ 会把下一行吞进参数里，报错信息完全指不到原因。
start "" "%CHROME%" --kiosk --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --disable-features=Translate,TranslateUI,MediaRouter --overscroll-history-navigation=0 --disable-pinch --autoplay-policy=no-user-gesture-required "%URL%"

endlocal
