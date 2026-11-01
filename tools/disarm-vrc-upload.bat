@echo off
rem Removes the vrc_upload arm file (cancels a pending armed window).
set "ARMFILE=%LOCALAPPDATA%\UnityMCP\arm\vrc-upload.arm"
rem Also clears a claim lock left behind by a crashed editor.
if exist "%ARMFILE%.lock" del "%ARMFILE%.lock"
if exist "%ARMFILE%" (
    del "%ARMFILE%"
    echo [UnityMCP] vrc_upload DISARMED: %ARMFILE%
) else (
    echo [UnityMCP] already disarmed (no arm file).
)
pause
