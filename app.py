"""
Flask Application for Social Saver
Serves the API and modern web user interface for Instagram Story & HD Profile Viewer.
"""

import os
import io
import sys
import json
import zipfile
import urllib.parse
import base64
import requests
import subprocess
import threading
import concurrent.futures
from flask import Flask, request, jsonify, send_from_directory, Response, send_file
from flask_cors import CORS
from ig_api import InstagramClient, load_config, save_config

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

client = InstagramClient()

def get_instagram_filename(url: str, default: str = "instagram_media.jpg") -> str:
    """Extract the exact original Instagram file name from CDN URL."""
    try:
        clean_url = url
        if "/get-cdn-image/" in clean_url:
            try:
                b64 = clean_url.split("/get-cdn-image/")[1].split("______")[0]
                b64 += "=" * (len(b64) % 4)
                clean_url = base64.b64decode(b64).decode("utf-8", errors="ignore")
            except Exception:
                pass
        
        parsed = urllib.parse.urlparse(clean_url)
        path = parsed.path
        name = path.split("/")[-1]
        if name and "." in name:
            clean_name = urllib.parse.unquote(name)
            if any(clean_name.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".mp4", ".webp", ".png"]):
                return clean_name
            return clean_name
    except Exception:
        pass
    return default

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(STATIC_DIR, path)

@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": "İstenen API servisi bulunamadı."}), 404
    return send_from_directory(STATIC_DIR, "index.html")

@app.errorhandler(500)
def handle_500(e):
    return jsonify({"success": False, "error": f"Sunucu hatası: {str(e)}"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({"success": False, "error": f"Beklenmeyen hata: {str(e)}"}), 500

@app.route("/api/config", methods=["GET"])
def get_config_endpoint():
    cfg = load_config()
    masked_session = ""
    if cfg.get("session_id"):
        sid = cfg["session_id"]
        masked_session = sid[:6] + "..." + sid[-4:] if len(sid) > 10 else "***"
    
    return jsonify({
        "has_session": bool(cfg.get("session_id")),
        "masked_session": masked_session,
        "logged_user": cfg.get("logged_user", ""),
        "history": cfg.get("history", []),
        "favorites": cfg.get("favorites", []),
        "theme": cfg.get("theme", "dark")
    })

@app.route("/api/session", methods=["POST"])
def update_session_endpoint():
    data = request.get_json() or {}
    session_id = data.get("session_id", "").strip()
    client.set_session_id(session_id)
    test_res = client.test_session()
    return jsonify({
        "success": True,
        "test": test_res
    })

@app.route("/api/session/test", methods=["GET"])
def test_session_endpoint():
    return jsonify(client.test_session())

@app.route("/api/session/login", methods=["POST"])
def direct_login_endpoint():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return jsonify({"success": False, "error": "Kullanıcı adı ve şifre gereklidir."}), 400
    res = client.login(username, password)
    status_code = 200 if res.get("success") or res.get("two_factor_required") else 400
    return jsonify(res), status_code

@app.route("/api/session/login_2fa", methods=["POST"])
def login_2fa_endpoint():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    code = data.get("code", "").strip()
    two_factor_identifier = data.get("two_factor_identifier", "").strip()
    if not username or not code:
        return jsonify({"success": False, "error": "Kullanıcı adı ve doğrulama kodu gereklidir."}), 400
    res = client.login_two_factor(username, code, two_factor_identifier)
    status_code = 200 if res.get("success") else 400
    return jsonify(res), status_code

@app.route("/api/session/open_browser", methods=["POST"])
def open_browser_endpoint():
    """Open official Instagram login in a dedicated browser window."""
    import webbrowser
    login_url = "https://www.instagram.com/accounts/login/"
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ]

    opened = False
    for ep in edge_paths:
        if os.path.exists(ep):
            try:
                subprocess.Popen([ep, f"--app={login_url}"])
                opened = True
                break
            except Exception:
                pass

    if not opened:
        for cp in chrome_paths:
            if os.path.exists(cp):
                try:
                    subprocess.Popen([cp, f"--app={login_url}"])
                    opened = True
                    break
                except Exception:
                    pass

    if not opened:
        try:
            webbrowser.open(login_url)
            opened = True
        except Exception as e:
            return jsonify({"success": False, "error": f"Tarayıcı açılamadı: {e}"}), 500

    return jsonify({"success": True, "message": "Instagram resmi giriş sayfası açıldı."})

login_process = None

@app.route("/api/session/auto_login", methods=["POST"])
def start_auto_login():
    global login_process
    status_file = os.path.join(BASE_DIR, "login_status.json")
    
    if login_process and login_process.poll() is None:
        return jsonify({"success": True, "message": "Giriş penceresi zaten açık."})

    with open(status_file, "w", encoding="utf-8") as f:
        json.dump({"status": "running", "message": "Giriş penceresi açılıyor..."}, f)

    venv_python = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
    py_exec = venv_python if os.path.exists(venv_python) else sys.executable
    script_path = os.path.join(BASE_DIR, "login_window.py")

    login_process = subprocess.Popen([py_exec, script_path], cwd=BASE_DIR)
    return jsonify({"success": True, "message": "Giriş penceresi başlatıldı."})

@app.route("/api/session/auto_login_status", methods=["GET"])
def get_auto_login_status():
    status_file = os.path.join(BASE_DIR, "login_status.json")
    if os.path.exists(status_file):
        try:
            with open(status_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("status") == "success":
                    cfg = load_config()
                    client.set_session_id(cfg.get("session_id", ""))
                return jsonify(data)
        except Exception:
            pass
    return jsonify({"status": "idle", "message": "Bekleniyor"})

@app.route("/api/profile", methods=["GET"])
def get_profile_endpoint():
    username = request.args.get("username", "").strip()
    if not username:
        return jsonify({"success": False, "error": "Kullanıcı adı belirtilmedi."}), 400
    try:
        res = client.get_profile(username)
        return jsonify(res)
    except Exception as e:
        return jsonify({"success": False, "error": f"Profil bilgisi alınırken hata oluştu: {str(e)}"}), 500

@app.route("/api/stories", methods=["GET"])
def get_stories_endpoint():
    user_id = request.args.get("user_id", "").strip()
    username = request.args.get("username", "").strip()
    if not user_id and not username:
        return jsonify({"success": False, "error": "Kullanıcı adı belirtilmedi."}), 400
    res = client.get_stories(user_id, username)
    return jsonify(res)

@app.route("/api/highlights", methods=["GET"])
def get_highlights_endpoint():
    user_id = request.args.get("user_id", "").strip()
    username = request.args.get("username", "").strip()
    if not user_id and not username:
        return jsonify({"success": False, "error": "User ID veya Username belirtilmedi."}), 400
    res = client.get_highlights(user_id, username)
    return jsonify(res)

@app.route("/api/highlight_stories", methods=["GET"])
def get_highlight_stories_endpoint():
    highlight_id = request.args.get("highlight_id", "").strip()
    if not highlight_id:
        return jsonify({"success": False, "error": "Highlight ID belirtilmedi."}), 400
    res = client.get_highlight_stories(highlight_id)
    return jsonify(res)

@app.route("/api/posts", methods=["GET"])
def get_posts_endpoint():
    username = request.args.get("username", "").strip()
    user_id = request.args.get("user_id", "").strip()
    max_id = request.args.get("max_id", "").strip()
    if not username:
        return jsonify({"success": False, "error": "Kullanıcı adı belirtilmedi."}), 400
    if username.isdigit() and user_id and not user_id.isdigit():
        username, user_id = user_id, username
    res = client.get_posts(username, user_id=user_id, max_id=max_id)
    res["has_session"] = bool(client.session_id)
    return jsonify(res)

@app.route("/api/favorite/toggle", methods=["POST"])
def toggle_fav_endpoint():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    full_name = data.get("full_name", "")
    pic_url = data.get("profile_pic", "")
    if not username:
        return jsonify({"success": False, "error": "Username gerekli"}), 400
    is_fav = client.toggle_favorite(username, full_name, pic_url)
    return jsonify({"success": True, "is_favorite": is_fav})

@app.route("/api/history/clear", methods=["POST"])
def clear_history_endpoint():
    cfg = load_config()
    cfg["history"] = []
    save_config(cfg)
    return jsonify({"success": True})

proxy_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100, max_retries=1)
proxy_session.mount("https://", adapter)
proxy_session.mount("http://", adapter)

# Fast in-memory LRU media cache for images & avatars
_media_cache = {}
_MAX_MEDIA_CACHE = 150

@app.route("/api/cache/stats", methods=["GET"])
def get_cache_stats_endpoint():
    cfg = load_config()
    ig_stats = client.get_cache_stats() if hasattr(client, "get_cache_stats") else {}
    return jsonify({
        "success": True,
        "media_cache_count": len(_media_cache),
        "api_cache_count": sum(ig_stats.values()),
        "details": ig_stats,
        "history_count": len(cfg.get("history", [])),
        "favorites_count": len(cfg.get("favorites", []))
    })

@app.route("/api/cache/clear", methods=["POST"])
def clear_cache_endpoint():
    global _media_cache
    data = request.get_json(silent=True) or {}
    clear_history = bool(data.get("clear_history", False))
    clear_favorites = bool(data.get("clear_favorites", False))
    clear_session = bool(data.get("clear_session", False))

    # 1. Clear server-side image / media proxy cache
    _media_cache.clear()

    # 2. Clear Instagram client in-memory cache
    if hasattr(client, "clear_cache"):
        client.clear_cache()

    # 3. Optional history / favorites / session clearing
    cfg = load_config()
    if clear_history:
        cfg["history"] = []
    if clear_favorites:
        cfg["favorites"] = []
    if clear_session:
        client.set_session_id("")
        cfg["session_id"] = ""
        cfg["logged_user"] = ""
    save_config(cfg)

    # 4. Clean up login_status.json if exists
    status_file = os.path.join(BASE_DIR, "login_status.json")
    if os.path.exists(status_file):
        try:
            with open(status_file, "w", encoding="utf-8") as f:
                json.dump({"status": "idle", "message": "Önbellek sıfırlandı"}, f)
        except Exception:
            pass

    return jsonify({
        "success": True,
        "message": "Önbellek ve uygulama durumu başarıyla sıfırlandı.",
        "media_cache_cleared": True,
        "api_cache_cleared": True,
        "cleared_history": clear_history,
        "cleared_favorites": clear_favorites,
        "cleared_session": clear_session
    })

@app.route("/api/proxy")
def proxy_media():
    """High-performance media proxy streaming authentic Instagram media without altering quality."""
    target_url = request.args.get("url")
    if not target_url:
        return "URL required", 400

    if target_url.startswith("/"):
        return send_from_directory(STATIC_DIR, target_url.lstrip("/"))

    if request.args.get("hd") == "1":
        uname = request.args.get("username", "").strip()
        if uname and any(x in target_url for x in ["s150x150", "150x150", "s100x100", "100x100", "s320x320", "320x320", "s480x480", "480x480"]):
            better_url = client.fetch_hd_profile_pic(uname)
            if better_url and not any(x in better_url for x in ["s150x150", "150x150", "s100x100", "100x100"]):
                target_url = better_url

    cache_key = target_url
    range_header = request.headers.get("Range")

    # Fast in-memory cache hit (0ms)
    if not range_header and cache_key in _media_cache:
        raw_bytes, c_type, extra_headers = _media_cache[cache_key]
        return Response(raw_bytes, status=200, headers=extra_headers)

    referer = "https://www.instagram.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Referer": referer,
        "Accept": "*/*"
    }

    if range_header:
        headers["Range"] = range_header

    try:
        req = proxy_session.get(target_url, headers=headers, stream=True, timeout=15)
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'content-type']
        response_headers = [
            (name, value) for (name, value) in req.raw.headers.items()
            if name.lower() not in excluded_headers
        ]

        c_type = req.headers.get("Content-Type", "image/jpeg")
        if "," in c_type:
            c_type = c_type.split(",")[0].strip()
        response_headers.append(('Content-Type', c_type))

        if 'Content-Length' in req.headers:
            response_headers.append(('Content-Length', req.headers['Content-Length']))
        if 'Accept-Ranges' in req.headers:
            response_headers.append(('Accept-Ranges', req.headers['Accept-Ranges']))
        if 'Content-Range' in req.headers:
            response_headers.append(('Content-Range', req.headers['Content-Range']))

        response_headers.append(('Cache-Control', 'public, max-age=604800, immutable'))
        response_headers.append(('Access-Control-Allow-Origin', '*'))

        # Cache authentic images in memory
        if not range_header and req.status_code == 200 and ("image" in c_type or any(ext in target_url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"])):
            img_bytes = req.content
            if len(_media_cache) > _MAX_MEDIA_CACHE:
                for k in list(_media_cache.keys())[:25]:
                    _media_cache.pop(k, None)
            _media_cache[cache_key] = (img_bytes, c_type, response_headers)
            return Response(img_bytes, status=200, headers=response_headers)

        def generate():
            for chunk in req.iter_content(chunk_size=131072):
                if chunk:
                    yield chunk

        return Response(generate(), status=req.status_code, headers=response_headers)

    except Exception as e:
        return f"Proxy error: {str(e)}", 502

@app.route("/api/download")
def download_media():
    """Download single media file directly with exact original Instagram server filename."""
    target_url = request.args.get("url")
    if not target_url:
        return "URL required", 400

    is_hd = request.args.get("hd") == "1"
    is_profile = is_hd or "profile_pic" in target_url or "-19/" in target_url

    # If it's a profile photo and target_url is downscaled, resolve the authentic HD photo from Instagram
    if is_profile or is_hd:
        if any(x in target_url for x in ["s150x150", "150x150", "s320x320", "320x320", "s480x480", "480x480"]):
            uname = request.args.get("username", "")
            if not uname:
                fn = request.args.get("filename", "")
                if fn and "_" in fn:
                    uname = fn.split("_")[0]
            if uname:
                better_url = client.fetch_hd_profile_pic(uname)
                if better_url and not any(x in better_url for x in ["s150x150", "150x150", "s320x320", "320x320"]):
                    target_url = better_url

    # For profile photos, ALWAYS use the authentic server filename from Instagram CDN
    filename = request.args.get("filename")
    if is_profile or not filename or filename == "download.jpg" or "_profile_hd.jpg" in filename or "_profile_pic.jpg" in filename:
        filename = get_instagram_filename(target_url, "profile_pic.jpg")

    if target_url.startswith("/"):
        return send_from_directory(STATIC_DIR, target_url.lstrip("/"), as_attachment=True, download_name=filename)

    referer = "https://www.instagram.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Referer": referer,
    }

    try:
        r = proxy_session.get(target_url, headers=headers, stream=True, timeout=25)
        if r.status_code != 200:
            return f"Download failed: status {r.status_code}", 502

        # Extract filename from Content-Disposition if provided by the remote server
        cd = r.headers.get("Content-Disposition", "")
        if "filename=" in cd:
            try:
                server_cd_name = cd.split("filename=")[1].split(";")[0].strip(' "\'')
                if server_cd_name and "." in server_cd_name:
                    filename = server_cd_name
            except Exception:
                pass

        c_type = r.headers.get("Content-Type", "application/octet-stream")
        if "," in c_type:
            c_type = c_type.split(",")[0].strip()

        resp_headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": c_type
        }
        if "Content-Length" in r.headers:
            resp_headers["Content-Length"] = r.headers["Content-Length"]

        return Response(
            r.iter_content(chunk_size=65536),
            headers=resp_headers
        )
    except Exception as e:
        return f"Download error: {str(e)}", 502

@app.route("/api/download_all_zip", methods=["POST"])
def download_all_zip():
    """Bundle stories or posts into a zip archive with exact original Instagram filenames."""
    data = request.get_json() or {}
    items = data.get("items", [])
    username = data.get("username", "download")
    zip_type = data.get("zip_type", "stories")
    if not items:
        return jsonify({"error": "No items provided"}), 400

    zip_buffer = io.BytesIO()
    used_names = set()
    name_lock = threading.Lock()

    def fetch_item(entry):
        idx, item = entry
        url = item.get("download_url") or item.get("url")
        if not url:
            return None

        is_vid = bool(item.get("is_video")) or (".mp4" in url.lower())
        default_ext = ".mp4" if is_vid else ".jpg"
        fallback_base = "post" if zip_type == "posts" else "story"
        fallback_name = f"{fallback_base}_{idx+1}{default_ext}"
        ig_name = get_instagram_filename(url, fallback_name)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Referer": "https://www.instagram.com/",
        }

        try:
            r = proxy_session.get(url, headers=headers, timeout=20)
            if r.status_code == 200 and r.content:
                return (ig_name, r.content)
        except Exception as e:
            print(f"Error downloading {ig_name}: {e}")
        return None

    # Multi-threaded parallel downloading for instant high-speed packing
    workers = min(10, max(2, len(items) // 3)) if len(items) > 2 else 2
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(fetch_item, enumerate(items)))

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for res in results:
            if not res:
                continue
            ig_name, content = res
            with name_lock:
                entry_name = ig_name
                count = 1
                name_base, ext = os.path.splitext(ig_name)
                while entry_name in used_names:
                    entry_name = f"{name_base}_{count}{ext}"
                    count += 1
                used_names.add(entry_name)
            zip_file.writestr(entry_name, content)

    zip_buffer.seek(0)
    zip_filename = f"{username}_{zip_type}_pack.zip"
    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_filename
    )

if __name__ == "__main__":
    os.makedirs(STATIC_DIR, exist_ok=True)
    print("=" * 60)
    print("Social Saver Server Started!")
    print("Web UI available at: http://127.0.0.1:5055")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5055, debug=False)
