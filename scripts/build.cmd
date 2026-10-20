@echo off
rem Windows 包装：通过 Git Bash 调用 scripts/build.sh，参数原样透传。
rem   scripts\build.cmd           跑测试并打包 .dbxp
rem   scripts\build.cmd dev       本地工作台调试
rem 本插件是纯前端包，不需要 MSVC / cargo / perl 之类的前置环境。
setlocal
set "BASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git Bash not found at "%BASH%" >&2
  exit /b 1
)
pushd %~dp0..
"%BASH%" scripts/build.sh %*
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%
