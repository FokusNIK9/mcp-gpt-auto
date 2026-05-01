@echo off
echo Start action bridge first:
echo   scripts\win\40-start-action-bridge.bat
echo.
echo Then expose it with your preferred HTTPS tunnel, for example:
echo   ngrok http 8787
echo.
echo Restart the bridge with the public URL:
echo   set ACTION_BRIDGE_PUBLIC_URL=https://your-ngrok-host.ngrok-free.app
echo   scripts\win\40-start-action-bridge.bat
echo.
echo Import this in GPT Actions:
echo   https://your-ngrok-host.ngrok-free.app/openapi.json
