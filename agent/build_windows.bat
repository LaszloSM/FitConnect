@echo off
REM Construye lsmfit-agent.exe en Windows (requiere Python 3.12).
python -m venv .venv
call .venv\Scripts\activate
pip install -e ".[zk]" pyinstaller
pyinstaller --onefile --name lsmfit-agent lsmfit_agent\main.py
echo Listo: dist\lsmfit-agent.exe
