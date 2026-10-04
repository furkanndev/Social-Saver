"""
Social Saver — Başlatıcı (Launcher)
Uygulamayı yerel sunucu olarak başlatır ve tarayıcıda veya masaüstü pencere modunda açar.
"""

import sys
import os
import subprocess

# Windows cp1252 terminal unicode güvenliği
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Otomatik Sanal Ortam (.venv) Yönlendirmesi:
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
if os.path.exists(VENV_PYTHON):
    try:
        if os.path.samefile(sys.executable, VENV_PYTHON) is False:
            sys.exit(subprocess.call([VENV_PYTHON] + sys.argv))
    except Exception:
        if os.path.abspath(sys.executable).lower() != os.path.abspath(VENV_PYTHON).lower():
            sys.exit(subprocess.call([VENV_PYTHON] + sys.argv))

import time
import webbrowser
import threading
from app import app

PORT = 5055
URL = f"http://127.0.0.1:{PORT}"

def open_app_window():
    time.sleep(1.2)
    # Edge veya Chrome uygulama modunu deneyelim (temiz masaüstü penceresi için)
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ]
    chrome_paths = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]

    for p in edge_paths + chrome_paths:
        if os.path.exists(p):
            try:
                subprocess.Popen([p, f"--app={URL}"])
                return
            except Exception:
                pass

    # Tarayıcıda normal sekme olarak aç
    webbrowser.open(URL)

if __name__ == "__main__":
    print("=" * 65)
    print("   [Social Saver] Instagram Story & HD Profil Indirici")
    print(f"   Sunucu adresi: {URL}")
    print("   Cikis yapmak icin: Ctrl + C")
    print("=" * 65)

    threading.Thread(target=open_app_window, daemon=True).start()
    app.run(host="127.0.0.1", port=PORT, debug=False)
