@echo off
rem Removes the vrc_upload arm file (cancels a pending armed window).
set "ARMFILE=%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm"
if exist "%ARMFILE%" (
    del "%ARMFILE%"
    echo [UnityMCP] vrc_upload DISARMED: %ARMFILE%
) else (
    echo [UnityMCP] already disarmed (no arm file).
)
pause
