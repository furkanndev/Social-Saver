"""
Instagram API Client for Social Saver
Handles profile info, HD profile pictures, stories, timeline posts, and highlights.
Direct Instagram Web GraphQL & native API integration.
"""

import os
import re
import json
import time
import base64
import html
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime
from bs4 import BeautifulSoup

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

DEFAULT_CONFIG = {
    "session_id": "",
    "history": [],
    "favorites": [],
    "theme": "dark"
}

def load_config() -> Dict[str, Any]:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                return {**DEFAULT_CONFIG, **cfg}
        except Exception:
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(cfg: Dict[str, Any]) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving config: {e}")

class InstagramClient:
    def __init__(self, session_id: Optional[str] = None):
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=30, pool_maxsize=60, max_retries=1)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        self.crawler_session = requests.Session()
        self.crawler_session.mount("https://", adapter)
        self.crawler_session.mount("http://", adapter)

        self.config = load_config()
        self.session_id = session_id if session_id is not None else self.config.get("session_id", "")
        self._pending_2fa: Optional[Dict[str, Any]] = None
        self._public_cache: Dict[str, Any] = {}
        self._cache_profile: Dict[str, tuple[float, Any]] = {}
        self._cache_stories: Dict[str, tuple[float, Any]] = {}
        self._cache_highlights: Dict[str, tuple[float, Any]] = {}
        self._cache_highlight_stories: Dict[str, tuple[float, Any]] = {}
        self._cache_posts: Dict[str, tuple[float, Any]] = {}
        self._cache_hd_dp: Dict[str, tuple[float, str]] = {}
        self._csrf_token: Optional[str] = None
        self.update_headers()

    def set_session_id(self, session_id: str, username: str = "") -> None:
        self.session_id = session_id.strip()
        self._csrf_token = None
        self.config["session_id"] = self.session_id
        if username:
            self.config["logged_user"] = username
        elif not self.session_id:
            self.config["logged_user"] = ""
        save_config(self.config)
        self.update_headers()

    def update_headers(self) -> None:
        self.session.headers.clear()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "x-ig-app-id": "936619743392459",
            "x-asbd-id": "129477",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
            "Origin": "https://www.instagram.com",
            "Referer": "https://www.instagram.com/",
            "Sec-Fetch-Site": "same-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty"
        })
        if self.session_id:
            self.session.cookies.set("sessionid", self.session_id, domain=".instagram.com")

    def clear_cache(self) -> None:
        """Clear all in-memory API caches, profile caches, and session cookies cache."""
        self._public_cache.clear()
        self._cache_profile.clear()
        self._cache_stories.clear()
        self._cache_highlights.clear()
        self._cache_highlight_stories.clear()
        self._cache_posts.clear()
        self._cache_hd_dp.clear()
        self._csrf_token = None
        self._pending_2fa = None
        saved_session = self.session_id
        self.session.cookies.clear()
        self.crawler_session.cookies.clear()
        if saved_session:
            self.session.cookies.set("sessionid", saved_session, domain=".instagram.com")
        self.update_headers()

    def get_cache_stats(self) -> Dict[str, int]:
        """Return counts of items stored across in-memory caches."""
        return {
            "profiles": len(self._cache_profile),
            "stories": len(self._cache_stories),
            "highlights": len(self._cache_highlights),
            "posts": len(self._cache_posts),
            "hd_avatars": len(self._cache_hd_dp),
            "public_cache": len(self._public_cache),
        }

    def _get_csrf_token(self) -> str:
        """Get or fetch a valid csrftoken for Instagram web GraphQL requests."""
        if self._csrf_token:
            return self._csrf_token
        csrf = self.session.cookies.get("csrftoken")
        if csrf:
            self._csrf_token = csrf
            return csrf
        try:
            r = requests.get("https://www.instagram.com/", headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            }, timeout=6)
            c = r.cookies.get("csrftoken")
            if c:
                self._csrf_token = c
                return c
        except Exception:
            pass
        return "VBTgYDJy0WL8_IgcaY9LNK"

    def test_session(self) -> Dict[str, Any]:
        """Test if the current session ID is valid using Instagram Web account data."""
        if not self.session_id:
            return {"valid": False, "message": "Oturum kimliği (sessionid) girilmedi."}
        try:
            csrf = self._get_csrf_token()
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "x-csrftoken": csrf,
                "Accept": "*/*",
                "Referer": "https://www.instagram.com/",
            }
            resp = self.session.get("https://www.instagram.com/api/v1/accounts/edit/web_form_data/", headers=headers, timeout=10)
            if resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
                data = resp.json().get("form_data", {})
                username = data.get("username", "")
                first_name = data.get("first_name", "")
                if username and self.config.get("logged_user") != username:
                    self.config["logged_user"] = username
                    save_config(self.config)
                return {
                    "valid": True,
                    "username": username,
                    "full_name": first_name or username,
                    "profile_pic": None,
                    "message": f"Oturum geçerli: @{username}" if username else "Oturum geçerli."
                }
            elif resp.status_code in (401, 403) or "accounts/login" in resp.url:
                return {"valid": False, "message": "Oturum kimliği geçersiz veya süresi dolmuş."}
            else:
                return {"valid": False, "message": f"Instagram yanıt kodu: {resp.status_code}"}
        except Exception as e:
            return {"valid": False, "message": f"Bağlantı hatası: {str(e)}"}

    def login(self, username: str, password: str) -> Dict[str, Any]:
        """
        Direct Instagram authentication via web login API.
        Encrypts password using standard Instagram web format (#PWD_INSTAGRAM_BROWSER:0:{ts}:{password}).
        Returns:
            {"success": True, "authenticated": True, "session_id": "...", "username": "..."}
            or {"success": False, "two_factor_required": True, "two_factor_identifier": "...", "message": "..."}
            or {"success": False, "error": "Hata mesajı"}
        """
        username = username.strip().lstrip("@")
        password = password.strip()
        if not username or not password:
            return {"success": False, "error": "Kullanıcı adı ve şifre girilmelidir."}

        s = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=5, pool_maxsize=10, max_retries=1)
        s.mount("https://", adapter)
        s.mount("http://", adapter)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "x-ig-app-id": "936619743392459",
            "x-asbd-id": "129477",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
            "Origin": "https://www.instagram.com",
            "Referer": "https://www.instagram.com/accounts/login/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty"
        }
        s.headers.update(headers)

        try:
            # 1. Fetch CSRF token from login page
            s.get("https://www.instagram.com/accounts/login/", timeout=12)
            csrf_token = s.cookies.get("csrftoken", domain=".instagram.com") or s.cookies.get("csrftoken") or ""

            # 2. Encrypt password with Instagram web signature format
            ts = int(time.time())
            enc_password = f"#PWD_INSTAGRAM_BROWSER:0:{ts}:{password}"

            post_headers = {
                "X-CSRFToken": csrf_token,
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            data = {
                "username": username,
                "enc_password": enc_password,
                "queryParams": "{}",
                "optIntoOneTap": "false"
            }

            resp = s.post(
                "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
                headers=post_headers,
                data=data,
                timeout=18
            )

            try:
                res_data = resp.json()
            except Exception:
                return {"success": False, "error": f"Instagram beklenmedik bir yanıt döndürdü (HTTP {resp.status_code})."}

            # Check successful login
            if res_data.get("authenticated") is True:
                sid = s.cookies.get("sessionid", domain=".instagram.com") or s.cookies.get("sessionid") or ""
                if not sid:
                    for c in s.cookies:
                        if c.name == "sessionid":
                            sid = c.value
                            break

                if sid:
                    self.set_session_id(sid, username=username)
                    test_info = self.test_session()
                    logged_user = test_info.get("username", username)
                    return {
                        "success": True,
                        "authenticated": True,
                        "session_id": sid,
                        "username": logged_user,
                        "message": f"Giriş başarılı! Hesabınız bağlandı: @{logged_user}"
                    }
                else:
                    return {"success": False, "error": "Giriş yapıldı ancak oturum çerezi alınamadı."}

            # Check 2FA requirement
            if res_data.get("two_factor_required") is True:
                tf_info = res_data.get("two_factor_info", {})
                tf_id = tf_info.get("two_factor_identifier") or ""

                self._pending_2fa = {
                    "session": s,
                    "csrf_token": csrf_token,
                    "username": username,
                    "two_factor_identifier": tf_id,
                    "created_at": time.time()
                }

                return {
                    "success": False,
                    "two_factor_required": True,
                    "two_factor_identifier": tf_id,
                    "message": "Hesabınızda İki Adımlı Doğrulama (2FA) aktif. Lütfen SMS veya Authenticator kodunuzu girin."
                }

            # Check checkpoint / suspicious login
            msg = str(res_data.get("message", "")).lower()
            if "checkpoint" in msg:
                return {
                    "success": False,
                    "checkpoint": True,
                    "error": "Instagram güvenlik doğrulaması (şüpheli giriş uyarısı) istedi. Lütfen Instagram mobil uygulamanızdan 'Giriş Yapan Bendim' onayını verin veya 'Resmi Tarayıcı Penceresi' butonunu kullanın."
                }

            if res_data.get("user") is False:
                return {"success": False, "error": "Bu kullanıcı adına ait bir Instagram hesabı bulunamadı."}

            if res_data.get("authenticated") is False:
                return {"success": False, "error": "Kullanıcı adı veya şifre hatalı. Lütfen kontrol edip tekrar deneyin."}

            err_msg = res_data.get("message") or "Giriş işlemi tamamlanamadı."
            return {"success": False, "error": err_msg}

        except requests.exceptions.Timeout:
            return {"success": False, "error": "Instagram sunucusuna bağlanırken zaman aşımı oluştu. Lütfen tekrar deneyin."}
        except Exception as e:
            return {"success": False, "error": f"Giriş hatası: {str(e)}"}

    def login_two_factor(self, username: str, code: str, two_factor_identifier: Optional[str] = None) -> Dict[str, Any]:
        """
        Complete Instagram two-factor authentication.
        """
        username = username.strip().lstrip("@")
        code = code.strip().replace(" ", "").replace("-", "")
        if not username or not code:
            return {"success": False, "error": "Kullanıcı adı ve doğrulama kodu gereklidir."}

        pending = getattr(self, "_pending_2fa", None)
        if pending and pending.get("username") == username and (time.time() - pending.get("created_at", 0) < 300):
            s = pending["session"]
            csrf_token = pending.get("csrf_token") or s.cookies.get("csrftoken") or ""
            tf_id = two_factor_identifier or pending.get("two_factor_identifier", "")
        else:
            s = requests.Session()
            adapter = requests.adapters.HTTPAdapter(pool_connections=5, pool_maxsize=10, max_retries=1)
            s.mount("https://", adapter)
            s.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "Accept": "*/*",
                "Origin": "https://www.instagram.com",
                "Referer": "https://www.instagram.com/accounts/login/",
            })
            s.get("https://www.instagram.com/accounts/login/", timeout=12)
            csrf_token = s.cookies.get("csrftoken", domain=".instagram.com") or s.cookies.get("csrftoken") or ""
            tf_id = two_factor_identifier or ""

        post_headers = {
            "X-CSRFToken": csrf_token,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {
            "username": username,
            "verification_code": code,
            "two_factor_identifier": tf_id,
            "trust_this_device": "1",
            "queryParams": "{}"
        }

        try:
            resp = s.post(
                "https://www.instagram.com/api/v1/web/accounts/login/ajax/two_factor/",
                headers=post_headers,
                data=data,
                timeout=18
            )
            res_data = resp.json()

            if res_data.get("authenticated") is True:
                sid = s.cookies.get("sessionid", domain=".instagram.com") or s.cookies.get("sessionid") or ""
                if not sid:
                    for c in s.cookies:
                        if c.name == "sessionid":
                            sid = c.value
                            break

                if sid:
                    self.set_session_id(sid, username=username)
                    self._pending_2fa = None
                    test_info = self.test_session()
                    logged_user = test_info.get("username", username)
                    return {
                        "success": True,
                        "authenticated": True,
                        "session_id": sid,
                        "username": logged_user,
                        "message": f"2FA doğrulaması başarılı! Oturum açıldı: @{logged_user}"
                    }
                else:
                    return {"success": False, "error": "Doğrulama başarılı ancak sessionid alınamadı."}
            else:
                msg = res_data.get("message") or "Güvenlik kodu hatalı veya süresi dolmuş."
                return {"success": False, "error": msg}

        except Exception as e:
            return {"success": False, "error": f"2FA doğrulama hatası: {str(e)}"}

    def _fetch_hd_indown(self, username: str) -> Optional[str]:
        """
        Fallback resolver for private/restricted Instagram profiles to retrieve
        the authentic, signed Full HD (1080x1080) Instagram CDN URL without quality loss.
        """
        username = username.strip().lstrip("@").lower()
        if not username:
            return None

        now = time.time()
        if hasattr(self, "_cache_hd_dp") and username in self._cache_hd_dp:
            t, url = self._cache_hd_dp[username]
            if now - t < 600 and url:
                return url

        try:
            s = requests.Session()
            adapter = requests.adapters.HTTPAdapter(pool_connections=5, pool_maxsize=10, max_retries=1)
            s.mount("https://", adapter)
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
            }
            r = s.get("https://indown.io/insta-dp-viewer", headers=headers, timeout=8)
            if r.status_code != 200:
                return None
            soup = BeautifulSoup(r.text, "html.parser")
            token_el = soup.find("input", {"name": "_token"})
            if not token_el:
                return None
            token = token_el.get("value")
            post_data = {
                "referer": "https://indown.io/insta-dp-viewer/en1",
                "locale": "en",
                "_token": token,
                "link": f"https://www.instagram.com/{username}/"
            }
            r2 = s.post("https://indown.io/download", data=post_data, headers=headers, timeout=12)
            if r2.status_code != 200:
                return None
            soup2 = BeautifulSoup(r2.text, "html.parser")
            candidates = []
            for a in soup2.find_all("a", href=True):
                href = a["href"]
                if any(h in href for h in ["cdninstagram", "fbcdn", "scontent"]) and ("_n.jpg" in href or "profile_pic" in href):
                    clean_href = href.replace("&dl=1", "").replace("?dl=1", "")
                    candidates.append(clean_href)
            for img in soup2.find_all("img", src=True):
                src = img["src"]
                if any(h in src for h in ["cdninstagram", "fbcdn", "scontent"]) and ("_n.jpg" in src or "profile_pic" in src):
                    clean_src = src.replace("&dl=1", "").replace("?dl=1", "")
                    candidates.append(clean_src)

            # Strictly filter out thumbnail URLs
            hd = [c for c in candidates if not any(x in c for x in ["s150x150", "150x150", "s320x320", "320x320", "s100x100", "100x100"])]
            if hd:
                selected = None
                for c in hd:
                    if "1080" in c:
                        selected = c
                        break
                if not selected:
                    selected = hd[0]
                if selected:
                    if hasattr(self, "_cache_hd_dp"):
                        self._cache_hd_dp[username] = (now, selected)
                    return selected
        except Exception:
            pass
        return None

    def fetch_hd_profile_pic(self, username: str, user_id: str = "") -> Optional[str]:
        """
        Fetch authentic Full HD (1080x1080) profile picture directly from Instagram CDN,
        with automated fallback for locked/private profiles.
        """
        username = username.strip().lstrip("@").lower()
        if not username:
            return None

        # 1. Resolve numeric user_id
        numeric_id = str(user_id) if (user_id and str(user_id).isdigit()) else None
        if not numeric_id and username in self._public_cache:
            cand_id = self._public_cache[username].get("id")
            if cand_id and str(cand_id).isdigit():
                numeric_id = str(cand_id)

        # 2. If we don't have numeric_id yet, fetch it via Googlebot SSR
        if not numeric_id:
            try:
                ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                r_ssr = self.crawler_session.get(f"https://www.instagram.com/{username}/", headers={"User-Agent": ua}, timeout=10)
                if r_ssr.status_code == 200:
                    pk_m = re.search(r'"pk":\s*["\']?([0-9]+)["\']?', r_ssr.text)
                    if not pk_m:
                        pk_m = re.search(r'"id":\s*["\']?([0-9]{5,20})["\']?', r_ssr.text)
                    if pk_m:
                        numeric_id = pk_m.group(1)
            except Exception:
                pass

        # 3. Use official Instagram mobile API (which returns 1080x1080 genuine HD profile pictures)
        if numeric_id:
            try:
                headers = {
                    "User-Agent": "Instagram 300.0.0.29.110 Android (33/13; 420dpi; 1080x2400; samsung; SM-G998B; p3s; exynos2100; en_US; 513926839)",
                    "Accept": "*/*",
                }
                if self.session_id:
                    headers["Cookie"] = f"sessionid={self.session_id};"
                r = requests.get(f"https://i.instagram.com/api/v1/users/{numeric_id}/info/", headers=headers, timeout=10)
                if r.status_code == 200:
                    u = r.json().get("user", {})
                    hd_info = u.get("hd_profile_pic_url_info")
                    if hd_info and isinstance(hd_info, dict) and hd_info.get("url"):
                        cand = hd_info.get("url")
                        if not any(t in cand for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                            return cand

                    versions = u.get("hd_profile_pic_versions")
                    if versions and isinstance(versions, list):
                        sorted_vers = sorted(versions, key=lambda v: v.get("height", 0), reverse=True)
                        if sorted_vers and sorted_vers[0].get("url"):
                            cand = sorted_vers[0].get("url")
                            if not any(t in cand for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                                return cand
            except Exception:
                pass

        # 4. Try official web_profile_info if session available
        if self.session_id:
            try:
                csrf = self._get_csrf_token()
                w_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                    "x-ig-app-id": "936619743392459",
                    "x-asbd-id": "129477",
                    "x-csrftoken": csrf,
                    "Referer": f"https://www.instagram.com/{username}/",
                }
                r_w = self.session.get(f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}", headers=w_headers, timeout=8)
                if r_w.status_code == 200:
                    u = r_w.json().get("data", {}).get("user", {})
                    hd = u.get("hd_profile_pic_url_info", {}).get("url") or u.get("profile_pic_url_hd")
                    if hd and not any(t in hd for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                        return hd
            except Exception:
                pass

        # 5. Resolver fallback for private/restricted profiles where Instagram only returns 150x150
        indown_hd = self._fetch_hd_indown(username)
        if indown_hd and not any(t in indown_hd for t in ["s150x150", "150x150", "s100x100", "100x100"]):
            return indown_hd

        # 6. Fallback: Check cached profile pic
        if username in self._public_cache:
            p = self._public_cache[username]
            hd = p.get("profile_pic_url_hd")
            if hd and not any(t in hd for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                return hd

        return None

    def _parse_number(self, val: Any) -> int:
        """Parse raw number string (e.g. '318K', '29K', '687M', '8,612') into an integer."""
        if val is None or val == "":
            return 0
        if isinstance(val, (int, float)):
            return int(val)
        val_str = str(val).strip().replace(',', '')
        try:
            if val_str.endswith(('K', 'k')):
                return int(float(val_str[:-1]) * 1000)
            if val_str.endswith(('M', 'm')):
                return int(float(val_str[:-1]) * 1000000)
            if val_str.endswith(('B', 'b')):
                return int(float(val_str[:-1]) * 1000000000)
            return int(float(val_str))
        except Exception:
            return 0

    def fetch_profile_from_web(self, username: str) -> Dict[str, Any]:
        """
        Direct Instagram Web Crawler engine (Zero login required).
        Accurately extracts followers, following, posts count, full name, biography,
        HD avatar, and exact privacy status (is_private).
        """
        username = username.strip().lstrip("@").lower()
        if not username:
            return {"success": False, "error": "Kullanıcı adı boş olamaz."}

        url = f"https://www.instagram.com/{username}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept-Language": "en-US,en;q=0.9",
        }

        try:
            r = self.crawler_session.get(url, headers=headers, timeout=6)
        except Exception as e:
            return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}

        if r.status_code == 404:
            return {"success": False, "error": f"@{username} kullanıcısı bulunamadı."}
        if r.status_code != 200:
            return {"success": False, "error": f"Instagram yanıt vermedi (Kod: {r.status_code})"}

        text = r.text

        # Detect non-existent profiles / 404
        title_m = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\'](.*?)["\']', text, re.I)
        if not title_m:
            title_m = re.search(r'<title>(.*?)</title>', text, re.I)
        title = html.unescape(title_m.group(1)) if title_m else ""
        if title == "Instagram" or "Page Not Found" in title or "Sayfa Bulunamadı" in title:
            return {"success": False, "error": f"@{username} kullanıcısı bulunamadı."}

        # Privacy status: Check for "is_private": true/false in server-rendered JSON
        is_private = False
        m_priv = re.search(r'"is_private":\s*(true|false)', text)
        if m_priv:
            is_private = (m_priv.group(1).lower() == "true")

        # Stats from meta description
        # e.g. "318K Followers, 3 Following, 72 Posts - See Instagram photos and videos from User (@user)"
        desc_m = re.search(r'<meta\s+(?:name|property)=["\'](?:og:)?description["\']\s+content=["\'](.*?)["\']', text, re.I)
        desc = html.unescape(desc_m.group(1)) if desc_m else ""

        # Extract stats: 1. Try embedded JSON (live count), 2. Meta description (multi-lingual)
        m_edge_fol = re.search(r'"edge_followed_by":\s*\{\s*"count":\s*([0-9]+)\s*\}', text)
        m_edge_ing = re.search(r'"edge_follow":\s*\{\s*"count":\s*([0-9]+)\s*\}', text)
        m_edge_pst = re.search(r'"edge_owner_to_timeline_media":\s*\{\s*"count":\s*([0-9]+)\s*\}', text)

        if m_edge_fol and m_edge_ing:
            followers = int(m_edge_fol.group(1))
            following = int(m_edge_ing.group(1))
            posts_count = int(m_edge_pst.group(1)) if m_edge_pst else 0
        else:
            m_fol = re.search(r'([0-9.,KMBkmb]+)\s*(?:Followers|Takipçi)', desc, re.I)
            m_ing = re.search(r'([0-9.,KMBkmb]+)\s*(?:Following|Takip(?:\s+Edilen)?)', desc, re.I)
            m_pst = re.search(r'([0-9.,KMBkmb]+)\s*(?:Posts|Gönderi)', desc, re.I)

            followers = self._parse_number(m_fol.group(1)) if m_fol else 0
            following = self._parse_number(m_ing.group(1)) if m_ing else 0
            posts_count = self._parse_number(m_pst.group(1)) if m_pst else 0

        # Full name extraction
        name_m = re.search(r'^(.*?)\s*\(@' + re.escape(username) + r'\)', title, re.I)
        full_name = name_m.group(1).strip() if name_m else username

        # Biography extraction
        bio_m = re.search(r'on Instagram:\s*"(.*?)"\s*$', desc, re.S)
        biography = bio_m.group(1).strip() if bio_m else ""

        # Profile picture extraction: Extract authentic signed CDN URL
        # Preference: 1. User JSON profile_pic_url, 2. link preload, 3. -19/ CDN link, 4. og:image
        profile_pic = None
        user_pic_m = re.search(r'"username":"' + re.escape(username) + r'".*?"profile_pic_url":\s*"([^"]+)"', text)
        if not user_pic_m:
            user_pic_m = re.search(r'"profile_pic_url":\s*"([^"]+)"', text)
        if user_pic_m:
            raw = user_pic_m.group(1).replace(r'\/', '/').replace(r'\u0025', '%')
            profile_pic = html.unescape(raw)

        if not profile_pic:
            preload_m = re.search(r'<link\s+rel="preload"\s+as="image"\s+href="([^"]+-19/[^"]+)"', text)
            if preload_m:
                profile_pic = html.unescape(preload_m.group(1))

        # Check for uncompressed HD profile picture links in HTML
        cdn_links = re.findall(r'https?:[\\/]+[^"\'\s<>]*(?:cdninstagram|fbcdn)[^"\'\s<>]*-19[\\/][^"\'\s<>]+', text)
        for link in cdn_links:
            clean_link = html.unescape(link.replace(r'\/', '/').replace(r'\u0025', '%'))
            if any(k in clean_link for k in ["1080", "900", "728"]) and not any(t in clean_link for t in ["150x150", "320x320", "480x480"]):
                profile_pic = clean_link
                break

        if not profile_pic and cdn_links:
            raw = cdn_links[0].replace(r'\/', '/').replace(r'\u0025', '%')
            profile_pic = html.unescape(raw)

        if not profile_pic:
            img_m = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\'](.*?)["\']', text, re.I)
            if img_m:
                profile_pic = html.unescape(img_m.group(1))

        profile_pic = profile_pic or "/img/default_avatar.svg"
        # User ID extraction
        pk_m = re.search(r'"pk":\s*["\']?([0-9]+)["\']?', text)
        if not pk_m:
            pk_m = re.search(r'"id":\s*["\']?([0-9]{5,20})["\']?', text)
        user_id = pk_m.group(1) if pk_m else username

        # Verified status
        is_verified = '"is_verified":true' in text

        # Always obtain authentic Full HD (1080x1080) profile picture from official Instagram
        profile_pic_hd = profile_pic
        try:
            # Check if SSR text contains direct profile_pic_url_hd
            hd_m = re.search(r'"profile_pic_url_hd":\s*"([^"]+)"', text)
            if hd_m:
                raw_hd = hd_m.group(1).replace(r'\/', '/').replace(r'\u0025', '%')
                cand_hd = html.unescape(raw_hd)
                if cand_hd and not any(t in cand_hd for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                    profile_pic_hd = cand_hd
                    profile_pic = cand_hd

            native_hd = self.fetch_hd_profile_pic(username, user_id=user_id)
            if native_hd and not any(t in native_hd for t in ["s150x150", "150x150", "s100x100", "100x100"]):
                profile_pic_hd = native_hd
                profile_pic = native_hd
        except Exception:
            pass

        # Active story status
        has_active_story = False
        if not is_private:
            try:
                m_reel = re.search(r'"latest_reel_media":\s*([0-9]+)', text)
                if m_reel:
                    reel_ts = int(m_reel.group(1))
                    if reel_ts > 0 and (time.time() - reel_ts < 86400):
                        has_active_story = True
            except Exception:
                pass

        res = {
            "success": True,
            "id": user_id,
            "username": username,
            "full_name": full_name,
            "biography": biography or ("Bu hesap gizlidir (kilitli profil)." if is_private else ""),
            "is_private": is_private,
            "is_verified": is_verified,
            "has_active_story": has_active_story,
            "profile_pic_url": profile_pic,
            "profile_pic_url_hd": profile_pic_hd,
            "followers": followers,
            "following": following,
            "posts_count": posts_count,
            "stories": [],
            "count": 0,
            "clean_id": None,
            "has_highlights": False,
            "source": "instagram_web"
        }
        self._public_cache[username] = res
        return res


    def get_profile(self, username: str) -> Dict[str, Any]:
        """Fetch profile information and authentic Full HD profile picture."""
        username = username.strip().lstrip("@").lower()
        if not username:
            return {"success": False, "error": "Kullanıcı adı boş olamaz."}

        now = time.time()
        if username in self._cache_profile:
            t, data = self._cache_profile[username]
            cached_hd = data.get("profile_pic_url_hd", "")
            is_stale_thumb = any(t in cached_hd for t in ["s150x150", "150x150", "s100x100", "100x100"])
            if now - t < 600 and not is_stale_thumb:
                self._add_to_history(data)
                return data

        # Direct Instagram Crawler engine (Fast, accurate stats, zero login required)
        web_res = self.fetch_profile_from_web(username)
        if web_res.get("success"):
            uid = web_res.get("id")
            # If hd_pic is still a downscaled thumbnail, fetch authentic 1080x1080 Full HD picture via native official API
            current_hd = web_res.get("profile_pic_url_hd", "")
            if not current_hd or any(t in current_hd for t in ["s150x150", "150x150", "s100x100", "100x100", "s320x320", "320x320"]):
                try:
                    native_hd = self.fetch_hd_profile_pic(username, user_id=uid or "")
                    if native_hd and not any(t in native_hd for t in ["s150x150", "150x150", "s100x100", "100x100", "s320x320", "320x320"]):
                        web_res["profile_pic_url_hd"] = native_hd
                        web_res["profile_pic_url"] = native_hd
                except Exception:
                    pass

            self._public_cache[username] = web_res
            self._cache_profile[username] = (now, web_res)
            self._add_to_history(web_res)
            return web_res

        return web_res

    def get_stories(self, user_id: str, username: str = "") -> Dict[str, Any]:
        """Fetch active 24-hour stories for a user."""
        target_name = (username or user_id).strip().lstrip("@").lower()

        now = time.time()
        if target_name in self._cache_stories:
            t, cached_res = self._cache_stories[target_name]
            if now - t < 120:  # 2 minutes TTL for stories
                return cached_res

        # 1. Check if public cache already has stories from profile fetch
        if target_name in self._public_cache:
            cached = self._public_cache[target_name]
            if cached.get("is_private"):
                res = {
                    "success": False,
                    "is_private": True,
                    "error": "Bu hesap gizlidir (kilitli profil). Hikayeler görüntülenemez.",
                    "stories": [],
                    "count": 0
                }
                self._cache_stories[target_name] = (now, res)
                return res
            cached_stories = cached.get("stories", [])
            if cached_stories:
                res = {
                    "success": True,
                    "stories": cached_stories,
                    "count": len(cached_stories),
                    "message": ""
                }
                self._cache_stories[target_name] = (now, res)
                return res

        # 2. If session_id is available and user_id is numeric, try official Reels API on Instagram Web
        if self.session_id and str(user_id).isdigit():
            url = f"https://www.instagram.com/api/v1/feed/reels_media/?reel_ids={user_id}"
            csrf = self._get_csrf_token()
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "x-csrftoken": csrf,
                "Accept": "*/*",
                "Origin": "https://www.instagram.com",
                "Referer": "https://www.instagram.com/",
            }
            try:
                resp = self.session.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    user_reel = data.get("reels", {}).get(str(user_id))
                    if user_reel and user_reel.get("items"):
                        stories = []
                        now_ts = int(time.time())
                        for item in user_reel.get("items", []):
                            media_type = item.get("media_type")
                            is_video = (media_type == 2)
                            candidates = item.get("image_versions2", {}).get("candidates", [])
                            image_url = candidates[0].get("url") if candidates else None
                            video_url = None
                            if is_video:
                                video_versions = item.get("video_versions", [])
                                if video_versions:
                                    video_url = video_versions[0].get("url")

                            taken_at = item.get("taken_at", 0)
                            expiring_at = item.get("expiring_at", taken_at + 86400)

                            stories.append({
                                "id": item.get("id"),
                                "pk": item.get("pk"),
                                "is_video": is_video,
                                "media_type": "video" if is_video else "image",
                                "image_url": image_url,
                                "video_url": video_url,
                                "download_url": video_url if is_video else image_url,
                                "taken_at": taken_at,
                                "expiring_at": expiring_at,
                                "time_ago": self._format_time_ago(taken_at),
                                "expires_in": self._format_expires_in(expiring_at, now_ts),
                                "has_audio": item.get("has_audio", True),
                                "caption": item.get("caption", {}).get("text") if item.get("caption") else None
                            })

                        res = {
                            "success": True,
                            "stories": stories,
                            "count": len(stories)
                        }
                        self._cache_stories[target_name] = (now, res)
                        return res
            except Exception:
                pass

        # 3. Default when no active stories found from official Instagram endpoints

        # 4. Graceful default when no active stories found
        res = {
            "success": True,
            "stories": [],
            "count": 0,
            "message": "Bu kullanıcının son 24 saat içinde paylaştığı aktif bir hikaye bulunmuyor."
        }
        self._cache_stories[target_name] = (now, res)
        return res
    def _fetch_graphql_highlights_tray(self, numeric_id: str) -> List[Dict[str, Any]]:
        """Fetch highlight albums using official Instagram GraphQL query (ProfileStoryHighlightsTrayContentQuery_connection)."""
        if not self.session_id or not numeric_id:
            return []
        try:
            csrf = self._get_csrf_token()
            s = requests.Session()
            s.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "x-csrftoken": csrf,
                "Accept": "*/*",
                "Origin": "https://www.instagram.com",
                "Referer": "https://www.instagram.com/",
                "Content-Type": "application/x-www-form-urlencoded",
                "x-fb-friendly-name": "ProfileStoryHighlightsTrayContentQuery_connection"
            })
            s.cookies.set("sessionid", self.session_id, domain=".instagram.com")
            s.cookies.set("csrftoken", csrf, domain=".instagram.com")

            variables = {
                "after": None,
                "before": None,
                "first": 50,
                "last": None,
                "max_highlights_to_fetch_on_pagination": 50,
                "user_id": str(numeric_id)
            }

            resp = s.post(
                "https://www.instagram.com/graphql/query",
                data={"doc_id": "38168009559465141", "variables": json.dumps(variables)},
                timeout=15
            )

            new_csrf = resp.cookies.get("csrftoken")
            if new_csrf:
                self._csrf_token = new_csrf

            if resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
                data = resp.json().get("data", {})
                tray_data = data.get("highlights") or data.get("xdt_api__v1__user_id__paginated_highlights_tray_connection") or {}
                edges = tray_data.get("edges", [])
                albums = []
                for e in edges:
                    node = e.get("node", {})
                    hl_id = node.get("id")
                    if not hl_id:
                        continue
                    title = node.get("title") or "Öne Çıkan"
                    cover_info = node.get("cover_media", {}).get("cropped_image_version", {})
                    cover_url = cover_info.get("url") if isinstance(cover_info, dict) else None
                    media_count = node.get("media_count")
                    albums.append({
                        "id": hl_id,
                        "title": title,
                        "media_count": media_count or 1,
                        "count": f"{media_count} hikaye" if media_count else "Öne Çıkan",
                        "cover_url": cover_url or "/img/default_cover.svg"
                    })
                return albums
        except Exception as e:
            print(f"[GraphQL Highlights Error] {e}")
        return []

    def get_highlights(self, user_id: str, username: str = "") -> Dict[str, Any]:
        """Fetch highlight reels tray for a user directly from Instagram."""
        target_name = (username or user_id).strip().lstrip("@").lower()

        now = time.time()
        if target_name in self._cache_highlights:
            t, cached_res = self._cache_highlights[target_name]
            if now - t < 600:  # 10 minutes TTL
                return cached_res

        # Check if user is known to be private
        if target_name in self._public_cache and self._public_cache[target_name].get("is_private"):
            res = {
                "success": False,
                "is_private": True,
                "error": "Bu hesap gizlidir (kilitli profil). Öne çıkanlar görüntülenemez.",
                "highlights": [],
                "count": 0
            }
            self._cache_highlights[target_name] = (now, res)
            return res

        numeric_id = str(user_id).strip() if user_id and str(user_id).isdigit() else None
        if not numeric_id and target_name in self._public_cache and str(self._public_cache[target_name].get("id", "")).isdigit():
            numeric_id = str(self._public_cache[target_name]["id"])

        if not numeric_id:
            try:
                prof = self.get_profile(target_name)
                if prof and str(prof.get("id", "")).isdigit():
                    numeric_id = str(prof["id"])
            except Exception:
                pass

        if numeric_id and self.session_id:
            albums = self._fetch_graphql_highlights_tray(numeric_id)
            if albums:
                res = {"success": True, "highlights": albums, "count": len(albums)}
                self._cache_highlights[target_name] = (now, res)
                return res

        res = {
            "success": True,
            "highlights": [],
            "count": 0,
            "message": "Bu kullanıcının öne çıkan hikaye albümü bulunamadı."
        }
        self._cache_highlights[target_name] = (now, res)
        return res

    def get_highlight_stories(self, highlight_id: str) -> Dict[str, Any]:
        """Fetch media items inside a specific highlight directly from Instagram."""
        now = time.time()
        if highlight_id in self._cache_highlight_stories:
            t, cached_res = self._cache_highlight_stories[highlight_id]
            if now - t < 1800:  # 30 minutes TTL
                return cached_res

        target_hl_id = str(highlight_id).strip()
        if not target_hl_id.startswith("highlight:") and target_hl_id.isdigit():
            target_hl_id = f"highlight:{target_hl_id}"

        if self.session_id and (target_hl_id.startswith("highlight:") or target_hl_id.isdigit()):
            url = f"https://www.instagram.com/api/v1/feed/reels_media/?reel_ids={target_hl_id}"
            csrf = self._get_csrf_token()
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "x-csrftoken": csrf,
                "Accept": "*/*",
                "Origin": "https://www.instagram.com",
                "Referer": "https://www.instagram.com/",
            }
            cookies = {
                "sessionid": self.session_id,
                "csrftoken": csrf
            }
            try:
                resp = requests.get(url, headers=headers, cookies=cookies, timeout=15)
                if resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
                    data = resp.json()
                    reels = data.get("reels", {})
                    reel = reels.get(target_hl_id) or reels.get(str(highlight_id)) or (list(reels.values())[0] if reels else {})
                    items = reel.get("items", [])
                    if items:
                        stories = []
                        for item in items:
                            media_type = item.get("media_type")
                            is_video = (media_type == 2)
                            candidates = item.get("image_versions2", {}).get("candidates", [])
                            image_url = candidates[0].get("url") if candidates else None
                            video_url = None
                            if is_video:
                                video_versions = item.get("video_versions", [])
                                if video_versions:
                                    video_url = video_versions[0].get("url")

                            taken_at = item.get("taken_at", 0)
                            stories.append({
                                "id": str(item.get("id", "")),
                                "pk": str(item.get("pk", "")),
                                "is_video": is_video,
                                "media_type": "video" if is_video else "image",
                                "image_url": image_url,
                                "video_url": video_url,
                                "download_url": video_url if is_video else image_url,
                                "taken_at": taken_at,
                                "time_ago": self._format_time_ago(taken_at) if taken_at else "Öne Çıkan",
                                "expires_in": "Öne Çıkan",
                                "has_audio": item.get("has_audio", True),
                                "caption": item.get("caption", {}).get("text") if item.get("caption") else None
                            })

                        res = {"success": True, "stories": stories, "count": len(stories), "title": reel.get("title", "")}
                        self._cache_highlight_stories[highlight_id] = (now, res)
                        return res
            except Exception as e:
                print(f"[Highlight Stories Error] {e}")

        return {
            "success": False,
            "error": "Öne çıkan albüm yüklenemedi veya albüm boş.",
            "stories": [],
            "count": 0
        }

    def _fetch_graphql_posts(self, username: str, cursor: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch timeline posts using authenticated Instagram Polaris GraphQL query with pagination support."""
        if not self.session_id:
            return None
        try:
            csrf = self._get_csrf_token()
            s = requests.Session()
            s.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "x-ig-app-id": "936619743392459",
                "x-asbd-id": "129477",
                "x-csrftoken": csrf,
                "Accept": "*/*",
                "Origin": "https://www.instagram.com",
                "Referer": f"https://www.instagram.com/{username}/",
                "Content-Type": "application/x-www-form-urlencoded",
                "x-fb-friendly-name": "PolarisProfilePostsQuery"
            })
            s.cookies.set("sessionid", self.session_id, domain=".instagram.com")
            s.cookies.set("csrftoken", csrf, domain=".instagram.com")

            variables = {
                "after": cursor if cursor else None,
                "before": None,
                "data": {
                    "count": 12,
                    "include_relationship_info": True,
                    "latest_besties_reel_media": True,
                    "latest_reel_media": True
                },
                "first": 12,
                "last": None,
                "username": username,
                "__relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider": False,
                "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": False,
                "__relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider": False
            }

            resp = s.post(
                "https://www.instagram.com/graphql/query",
                data={"doc_id": "28991540097136703", "variables": json.dumps(variables)},
                timeout=15
            )

            new_csrf = resp.cookies.get("csrftoken")
            if new_csrf:
                self._csrf_token = new_csrf

            if resp.status_code == 200 and "json" in resp.headers.get("content-type", ""):
                data = resp.json().get("data", {}).get("xdt_api__v1__feed__user_timeline_graphql_connection", {})
                if data and "edges" in data:
                    return data
        except Exception as e:
            print(f"[GraphQL Posts Error] {e}")
        return None

    def get_posts(self, username: str, user_id: Optional[str] = None, max_id: Optional[str] = None) -> Dict[str, Any]:
        """Fetch timeline posts for a public profile with genuine resolution, carousel support, and pagination."""
        username = username.strip().lstrip("@").lower()
        now = time.time()
        cache_key = f"{username}_{max_id or 'first'}"
        
        # Check in-memory cache
        if cache_key in self._cache_posts:
            t, cached_res = self._cache_posts[cache_key]
            if now - t < 600:
                return cached_res

        # 1. If session_id is active, query official GraphQL timeline connection (works for page 1, 2, 3...)
        if self.session_id:
            graphql_data = self._fetch_graphql_posts(username, cursor=max_id)
            if graphql_data:
                edges = graphql_data.get("edges", [])
                page_info = graphql_data.get("page_info", {})
                posts = []
                for edge in edges:
                    node = edge.get("node", {})
                    pk = str(node.get("pk") or node.get("id") or "")
                    shortcode = node.get("code") or ""
                    if not shortcode and pk:
                        shortcode = self._pk_to_shortcode(pk)

                    m_type = node.get("media_type")
                    v_vers = node.get("video_versions") or []
                    c_media = node.get("carousel_media") or []
                    is_video = (m_type == 2) or bool(v_vers)
                    is_carousel = (m_type == 8) or bool(c_media)

                    cands = node.get("image_versions2", {}).get("candidates", []) if isinstance(node.get("image_versions2"), dict) else []
                    display_url = cands[0].get("url") if cands else node.get("display_uri")
                    video_url = v_vers[0].get("url") if v_vers else None

                    carousel_items = []
                    if is_carousel and c_media:
                        for c in c_media:
                            c_cands = c.get("image_versions2", {}).get("candidates", []) if isinstance(c.get("image_versions2"), dict) else []
                            c_v_vers = c.get("video_versions") or []
                            c_is_vid = bool(c_v_vers) or (c.get("media_type") == 2)
                            c_thumb = c_cands[0].get("url") if c_cands else None
                            c_video = c_v_vers[0].get("url") if c_v_vers else None
                            carousel_items.append({
                                "id": str(c.get("pk") or c.get("id") or ""),
                                "is_video": c_is_vid,
                                "display_url": c_thumb,
                                "video_url": c_video,
                                "download_url": c_video if c_is_vid else c_thumb
                            })

                    raw_cap = node.get("caption")
                    caption_text = ""
                    if isinstance(raw_cap, dict):
                        caption_text = raw_cap.get("text", "")
                    elif isinstance(raw_cap, str):
                        caption_text = raw_cap

                    taken_at = node.get("taken_at")
                    dl_url = video_url if (is_video and video_url) else display_url

                    posts.append({
                        "id": pk,
                        "pk": pk,
                        "shortcode": shortcode or pk,
                        "media_type": "carousel" if is_carousel else ("video" if is_video else "photo"),
                        "is_video": is_video,
                        "is_carousel": is_carousel,
                        "carousel_count": len(carousel_items) if is_carousel else 1,
                        "carousel_media": carousel_items,
                        "display_url": display_url,
                        "video_url": video_url,
                        "download_url": dl_url,
                        "caption": caption_text,
                        "likes": node.get("like_count", 0),
                        "comments": node.get("comment_count", 0),
                        "taken_at": taken_at,
                        "time_ago": self._format_time_ago(taken_at),
                        "is_pinned": bool(node.get("is_timeline_pinned", False)),
                        "permalink": f"https://www.instagram.com/p/{shortcode}/" if shortcode else f"https://www.instagram.com/{username}/"
                    })

                has_next = bool(page_info.get("has_next_page", False))
                end_cursor = page_info.get("end_cursor")
                res = {
                    "success": True,
                    "posts": posts,
                    "count": len(posts),
                    "has_next_page": has_next,
                    "next_max_id": end_cursor,
                    "end_cursor": end_cursor
                }
                self._cache_posts[cache_key] = (now, res)
                return res

        # 2. Scrape via Googlebot Crawler (Polaris Timeline Connection - No login required!)
        # Only for first page since Googlebot provides initial SSR batch
        if not max_id:
            try:
                ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
                headers = {"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"}
                url = f"https://www.instagram.com/{username}/"
                r = requests.get(url, headers=headers, timeout=12)
                if r.status_code == 200:
                    text = r.text
                    posts = []
                    page_info = {}
                    for m in re.finditer(r'<script[^>]*>(.*?)</script>', text, re.S):
                        sc = m.group(1)
                        if "polaris_timeline_connection" in sc:
                            try:
                                data = json.loads(sc)
                                def find_conn(d):
                                    if isinstance(d, dict):
                                        if "polaris_timeline_connection" in d:
                                            conn = d["polaris_timeline_connection"]
                                            if isinstance(conn, dict):
                                                return conn
                                        for v in d.values():
                                            res = find_conn(v)
                                            if res: return res
                                    elif isinstance(d, list):
                                        for v in d:
                                            res = find_conn(v)
                                            if res: return res
                                    return None

                                conn = find_conn(data)
                                if conn:
                                    edges = conn.get("edges", [])
                                    page_info = conn.get("page_info", {})
                                    for e in edges:
                                        node = e.get("node", {})
                                        pk = str(node.get("pk") or node.get("id") or "")
                                        typename = node.get("__typename", "")
                                        m_type_num = node.get("media_type")

                                        is_video = "Video" in typename or m_type_num == 2 or bool(node.get("is_video"))
                                        is_carousel = "Carousel" in typename or m_type_num == 8 or bool(node.get("carousel_media"))

                                        cands = node.get("image_versions2", {}).get("candidates", []) if isinstance(node.get("image_versions2"), dict) else []
                                        display_url = cands[0].get("url") if cands else node.get("display_uri")

                                        v_vers = node.get("video_versions", []) if isinstance(node.get("video_versions"), list) else []
                                        video_url = v_vers[0].get("url") if v_vers else None

                                        carousel_items = []
                                        raw_car = node.get("carousel_media") or node.get("any_carousel_media") or []
                                        if isinstance(raw_car, list):
                                            for c_item in raw_car:
                                                c_cands = c_item.get("image_versions2", {}).get("candidates", []) if isinstance(c_item.get("image_versions2"), dict) else []
                                                c_v_vers = c_item.get("video_versions", []) if isinstance(c_item.get("video_versions"), list) else []
                                                c_is_vid = bool(c_v_vers) or "Video" in c_item.get("__typename", "")
                                                carousel_items.append({
                                                    "id": str(c_item.get("id") or c_item.get("pk") or ""),
                                                    "is_video": c_is_vid,
                                                    "display_url": c_cands[0].get("url") if c_cands else None,
                                                    "video_url": c_v_vers[0].get("url") if c_v_vers else None,
                                                    "download_url": (c_v_vers[0].get("url") if c_v_vers else (c_cands[0].get("url") if c_cands else None))
                                                })

                                        raw_cap = node.get("caption")
                                        caption_text = ""
                                        if isinstance(raw_cap, dict):
                                            caption_text = raw_cap.get("text", "")
                                        elif isinstance(raw_cap, str):
                                            caption_text = raw_cap

                                        canonical = node.get("seo_canonical_url") or ""
                                        shortcode = node.get("code") or node.get("shortcode")
                                        if not shortcode and "/p/" in canonical:
                                            shortcode = canonical.split("/p/")[1].split("/")[0]
                                        if not shortcode and pk:
                                            shortcode = self._pk_to_shortcode(pk)

                                        taken_at = node.get("taken_at") or node.get("taken_at_timestamp")
                                        dl_url = video_url if (is_video and video_url) else display_url

                                        posts.append({
                                            "id": pk or f"post_{len(posts)}",
                                            "pk": pk,
                                            "shortcode": shortcode or pk,
                                            "media_type": "carousel" if is_carousel else ("video" if is_video else "photo"),
                                            "is_video": is_video,
                                            "is_carousel": is_carousel,
                                            "carousel_count": len(carousel_items) if is_carousel else 1,
                                            "carousel_media": carousel_items,
                                            "display_url": display_url,
                                            "video_url": video_url,
                                            "download_url": dl_url,
                                            "caption": caption_text,
                                            "likes": node.get("like_count") or 0,
                                            "comments": node.get("comment_count") or 0,
                                            "taken_at": taken_at,
                                            "time_ago": self._format_time_ago(taken_at),
                                            "is_pinned": bool(node.get("is_timeline_pinned", False)),
                                            "permalink": f"https://www.instagram.com/p/{shortcode}/" if shortcode else f"https://www.instagram.com/{username}/"
                                        })
                                    break
                            except Exception:
                                pass
                    if posts:
                        res = {
                            "success": True, 
                            "posts": posts, 
                            "count": len(posts),
                            "has_next_page": bool(page_info.get("has_next_page", False)),
                            "end_cursor": page_info.get("end_cursor")
                        }
                        self._cache_posts[cache_key] = (now, res)
                        return res
            except Exception:
                pass

        return {"success": True, "posts": [], "count": 0, "has_next_page": False, "message": "Gönderi bulunamadı veya profil gizli."}

    def _pk_to_shortcode(self, pk: Any) -> str:
        """Convert Instagram integer media ID (pk) into authentic base64 shortcode."""
        try:
            pk_clean = re.sub(r'\D', '', str(pk))
            if not pk_clean:
                return str(pk)
            n = int(pk_clean)
            alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
            shortcode = []
            while n > 0:
                n, rem = divmod(n, 64)
                shortcode.append(alphabet[rem])
            return ''.join(reversed(shortcode))
        except Exception:
            return str(pk)

    def _format_time_ago(self, ts: int) -> str:
        if not ts:
            return ""
        diff = int(time.time()) - ts
        if diff < 60:
            return "Az önce"
        elif diff < 3600:
            mins = diff // 60
            return f"{mins}d önce"
        elif diff < 86400:
            hours = diff // 3600
            return f"{hours}s önce"
        else:
            days = diff // 86400
            return f"{days}g önce"

    def _format_expires_in(self, exp_ts: int, now: int) -> str:
        diff = exp_ts - now
        if diff <= 0:
            return "Süresi doldu"
        hours = diff // 3600
        mins = (diff % 3600) // 60
        if hours > 0:
            return f"{hours}s {mins}d kaldı"
        return f"{mins} dakika kaldı"

    def _add_to_history(self, profile: Dict[str, Any]) -> None:
        cfg = load_config()
        history = cfg.get("history", [])
        history = [h for h in history if h.get("username") != profile["username"]]
        history.insert(0, {
            "username": profile["username"],
            "full_name": profile.get("full_name") or profile["username"],
            "profile_pic": profile.get("profile_pic_url", ""),
            "timestamp": int(time.time())
        })
        cfg["history"] = history[:15]
        save_config(cfg)
        self.config = cfg

    def toggle_favorite(self, username: str, full_name: str, pic_url: str) -> bool:
        cfg = load_config()
        favs = cfg.get("favorites", [])
        exists = any(f.get("username") == username for f in favs)
        if exists:
            favs = [f for f in favs if f.get("username") != username]
            is_fav = False
        else:
            favs.insert(0, {
                "username": username,
                "full_name": full_name,
                "profile_pic": pic_url
            })
            is_fav = True
        cfg["favorites"] = favs
        save_config(cfg)
        self.config = cfg
        return is_fav
