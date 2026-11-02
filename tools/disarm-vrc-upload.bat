@echo off
setlocal
rem Removes the vrc_upload arm file (cancels a pending armed window).
set "ARMFILE=%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm"
rem Honors UNITY_MCP_ARM_FILE when it is an absolute path (X:\... or \\server\...),
rem like the MCP server and the Unity plugin. No labels: this file has LF endings.
set "UMCP_ARMV="
if defined UNITY_MCP_ARM_FILE set "UMCP_ARMV=%UNITY_MCP_ARM_FILE%"
if defined UMCP_ARMV if "%UMCP_ARMV:~1,1%"==":" set "ARMFILE=%UMCP_ARMV%"
if defined UMCP_ARMV if "%UMCP_ARMV:~0,2%"=="\\" set "ARMFILE=%UMCP_ARMV%"
rem Also clears a claim lock left behind by a crashed editor.
if exist "%ARMFILE%.lock" del "%ARMFILE%.lock"
if exist "%ARMFILE%" (
    del "%ARMFILE%"
    echo [UnityMCP] vrc_upload DISARMED: %ARMFILE%
) else (
    echo [UnityMCP] already disarmed (no arm file^).
)
pause
