@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install
)
start "" http://localhost:5519
call npm run dev
