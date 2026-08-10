@echo off
rem Start Saddleworth What's On: serves this folder and opens the browser.
cd /d "%~dp0"
start "" "http://localhost:8130/index.html"
python -m http.server 8130
