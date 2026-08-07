@echo off
rem Arms ONE real vrc_upload attempt for 30 minutes (one-shot, human use only).
rem An AI agent must never run this; the whole point is human-held consent.
set "ARMDIR=%LOCALAPPDATA%\UnityMCP\arm"
if not exist "%ARMDIR%" mkdir "%ARMDIR%"
>"%ARMDIR%\vrc-upload.arm" echo armed %DATE% %TIME% by %USERNAME%
echo.
echo [UnityMCP] vrc_upload ARMED (one-shot, expires in 30 minutes):
echo   %ARMDIR%\vrc-upload.arm
echo.
echo A real upload still requires confirm:true on the tool call.
echo Run tools\disarm-vrc-upload.bat to cancel.
pause
