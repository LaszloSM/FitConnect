@echo off
REM Construye fitconnect-agent.exe en Windows (requiere Python 3.12).
python -m venv .venv
call .venv\Scripts\activate
pip install -e ".[zk]" pyinstaller
pyinstaller --onefile --name fitconnect-agent fitconnect_agent\main.py
echo Listo: dist\fitconnect-agent.exe
