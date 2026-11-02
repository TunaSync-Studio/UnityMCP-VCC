@echo off
setlocal
rem Arms ONE real vrc_upload attempt (one-shot, human use only). It expires
rem after 30 minutes, or after UNITY_MCP_ARM_TTL_MIN minutes (at most 1440).
rem An AI agent must never run this; the whole point is human-held consent.
set "ARMFILE=%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm"
rem Honors UNITY_MCP_ARM_FILE when it is an absolute path (X:\... or \\server\...),
rem like the MCP server and the Unity plugin. No labels: this file has LF endings.
set "UMCP_ARMV="
if defined UNITY_MCP_ARM_FILE set "UMCP_ARMV=%UNITY_MCP_ARM_FILE%"
if defined UMCP_ARMV if "%UMCP_ARMV:~1,1%"==":" set "ARMFILE=%UMCP_ARMV%"
if defined UMCP_ARMV if "%UMCP_ARMV:~0,2%"=="\\" set "ARMFILE=%UMCP_ARMV%"
for %%I in ("%ARMFILE%") do set "ARMDIR=%%~dpI"
if not exist "%ARMDIR%" mkdir "%ARMDIR%"
rem A claim lock left behind by a crashed editor would refuse every claim.
if exist "%ARMFILE%.lock" del "%ARMFILE%.lock"
>"%ARMFILE%" echo armed %DATE% %TIME% by %USERNAME%
echo.
echo [UnityMCP] vrc_upload ARMED (one-shot):
echo   %ARMFILE%
echo.
echo A real upload still requires confirm:true on the tool call.
echo Run tools\disarm-vrc-upload.bat to cancel.
pause
