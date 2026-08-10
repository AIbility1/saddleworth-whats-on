@echo off
rem Start Saddleworth What's On locally (static site + community API).
cd /d "%~dp0"
start "" "http://localhost:8130/index.html"
node scripts\dev-server.js
