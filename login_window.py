"""
Instagram Auto-Login Window for Social Saver
Opens a native Edge/Chromium window to instagram.com,
monitors for sessionid, saves it to config, and closes automatically.
"""

import sys
import os
import re
import time
import json
import threading

# Windows cp1252 terminal unicode support
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure correct working directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "login_status.json")

def update_status(status: str, message: str = "", username: str = ""):
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "status": status,
                "message": message,
                "username": username,
                "timestamp": int(time.time())
            }, f, indent=2)
    except Exception as e:
        print(f"Error updating login status: {e}")

def extract_session_id(cookies) -> str:
    for c in cookies:
        # Check Morsel / Cookie object attributes
        key = getattr(c, "key", None)
        val = getattr(c, "value", None)
        if key == "sessionid" and val:
            return str(val)

        # Check dict format
        if isinstance(c, dict):
            k = c.get("name") or c.get("key")
            v = c.get("value")
            if k == "sessionid" and v:
                return str(v)

        # Check SimpleCookie dict
        if hasattr(c, "items"):
            for k, morsel in c.items():
                if k == "sessionid":
                    return str(morsel.value if hasattr(morsel, "value") else morsel)

        # String regex fallback
        raw_str = str(c)
        match = re.search(r"sessionid=([a-zA-Z0-9%_-]+)", raw_str)
        if match:
            return match.group(1)

    return ""

def cookie_watcher(window):
    print("[LoginWindow] Cookie watcher started...")
    from ig_api import InstagramClient, load_config, save_config

    session_found = False
    # Monitor for up to 10 minutes (600 seconds)
    for _ in range(600):
        time.sleep(1.2)
        try:
            cookies = window.get_cookies()
            sid = extract_session_id(cookies)
            if sid and len(sid) > 10:
                print(f"[LoginWindow] Found sessionid: {sid[:8]}...")
                update_status("verifying", "SessionID algılandı, doğrulanıyor...")

                # Save and test with Instagram
                client = InstagramClient()
                client.set_session_id(sid)
                test_res = client.test_session()

                username = test_res.get("username", "")
                if test_res.get("valid"):
                    print(f"[LoginWindow] Login verified for user: @{username}")
                    update_status("success", f"Giriş başarılı: @{username}", username=username)
                else:
                    # Still save even if account lookup is rate limited or delayed
                    update_status("success", "Oturum başarıyla kaydedildi.", username=username or "Instagram Kullanıcısı")

                session_found = True
                time.sleep(0.8)
                window.destroy()
                return

        except Exception as e:
            # Window might have been closed by user
            err_str = str(e)
            if "disposed" in err_str.lower() or "destroy" in err_str.lower():
                break
            print(f"[LoginWindow] Watcher check: {e}")

    if not session_found:
        update_status("cancelled", "Giriş işlemi iptal edildi veya zaman aşımına uğradı.")

def main():
    import webview

    update_status("running", "Giriş penceresi açıldı, bekleniyor...")
    
    # Store cookies in user's AppData for persistence
    storage_path = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "SocialSaver_IG")
    os.makedirs(storage_path, exist_ok=True)

    # Instagram official login URL
    login_url = "https://www.instagram.com/accounts/login/"
    window = webview.create_window(
        title="Instagram Giriş — Social Saver",
        url=login_url,
        width=480,
        height=680,
        resizable=True
    )

    watcher_thread = threading.Thread(target=cookie_watcher, args=(window,), daemon=True)
    watcher_thread.start()

    try:
        webview.start(storage_path=storage_path, private_mode=False)
    except Exception as e:
        print(f"[LoginWindow] Webview error: {e}, falling back to standalone browser...")
        import subprocess
        import webbrowser
        
        opened = False
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        ]
        for ep in edge_paths:
            if os.path.exists(ep):
                try:
                    subprocess.Popen([ep, f"--app={login_url}"])
                    opened = True
                    break
                except Exception:
                    pass

        if not opened:
            try:
                webbrowser.open(login_url)
                opened = True
            except Exception:
                pass

        if opened:
            update_status("browser_opened", "Resmi Instagram sayfası açıldı. Giriş yapabilir veya doğrudan giriş formunu kullanabilirsiniz.")
        else:
            update_status("error", f"Pencere açılamadı: {str(e)}")

    print("[LoginWindow] Window closed.")

if __name__ == "__main__":
    main()
