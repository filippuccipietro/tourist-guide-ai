@echo off
del /f /q "%~dp0.git\index.lock"
echo Lock rimosso! Ora puoi fare il commit in GitHub Desktop.
pause
