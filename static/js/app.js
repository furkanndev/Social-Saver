/**
 * Social Saver — Instagram Story & HD Profile Viewer
 * Client-side Controller & UI Logic
 */

let currentProfile = null;
let currentStories = [];
let currentHighlightStories = [];
let playingStoriesList = [];
let currentHighlights = [];
let currentPosts = [];
let currentFavorites = [];
const highlightAlbumsCache = new Map();
let activePostModalIndex = 0;
let activePostCarouselIndex = 0;
let activeTab = 'stories';
let postsNextMaxId = null;
let postsHasNextPage = false;
let isFetchingMorePosts = false;
let clientConfig = null;
let dlPostsCancelled = false;

// Story Player State
let playerIndex = 0;
let playerTimer = null;
let playerProgressInterval = null;
let isPlayerPaused = false;
let isMuted = false;
const PHOTO_DURATION_MS = 5000;

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});

// Safe JSON fetcher that protects against HTML 500 error pages and JSON syntax errors
async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.warn('Non-JSON response from', url, text.slice(0, 150));
      return { success: false, error: 'Sunucudan beklenmeyen bir yanıt alındı.' };
    }
  } catch (netErr) {
    return { success: false, error: 'Sunucuya bağlanılamadı: ' + netErr.message };
  }
}

// ==========================================
// Config & Session Management
// ==========================================

async function loadConfig() {
  try {
    const data = await safeFetchJson('/api/config');
    if (!data) return;
    clientConfig = data;
    
    updateSessionUI(data.has_session, data.masked_session, data.logged_user);
    renderFavorites(data.favorites || []);
    renderHistory(data.history || []);
  } catch (err) {
    console.error('Config yüklenemedi:', err);
  }
}

function updateSessionUI(hasSession, maskedSession, loggedUser = '') {
  clientConfig = Object.assign(clientConfig || {}, { has_session: hasSession, masked_session: maskedSession, logged_user: loggedUser });
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('sessionStatusText');
  const headerBtnText = document.getElementById('headerAutoLoginText');
  const activeSessionCard = document.getElementById('activeSessionCard');
  const activeSessionUsername = document.getElementById('activeSessionUsername');
  const activeSessionAvatar = document.getElementById('activeSessionAvatar');

  if (hasSession) {
    if (dot) dot.classList.add('active');
    const displayUser = loggedUser ? `@${loggedUser}` : maskedSession;
    if (text) text.innerText = `Oturum (${displayUser})`;
    if (headerBtnText) headerBtnText.innerText = `Oturum: ${displayUser}`;
    
    if (activeSessionCard) {
      activeSessionCard.style.display = 'flex';
      if (activeSessionUsername) activeSessionUsername.innerText = loggedUser ? `@${loggedUser}` : `Session (${maskedSession})`;
      if (activeSessionAvatar) activeSessionAvatar.innerText = loggedUser ? loggedUser.charAt(0).toUpperCase() : 'IG';
    }
  } else {
    if (dot) dot.classList.add('active'); // Scraper is always active
    if (text) text.innerText = 'Giriş Yap';
    if (headerBtnText) headerBtnText.innerText = 'Giriş Yap';
    if (activeSessionCard) {
      activeSessionCard.style.display = 'none';
    }
  }
}

function openLoginModal(tab = 'session') {
  openModal('settingsModal');
  switchSettingsTab(tab);
}

function openSettingsModal(tab = 'cache') {
  openModal('settingsModal');
  switchSettingsTab(tab);
}

function switchSettingsTab(tab) {
  const cacheTabBtn = document.getElementById('settingsTabCacheBtn');
  const sessionTabBtn = document.getElementById('settingsTabSessionBtn');
  const cacheContent = document.getElementById('settingsTabCacheContent');
  const sessionContent = document.getElementById('settingsTabSessionContent');
  const footerCache = document.getElementById('settingsFooterCache');
  const footerSession = document.getElementById('settingsFooterSession');
  const modalTitle = document.getElementById('settingsModalTitle');

  if (tab === 'cache') {
    if (cacheTabBtn) cacheTabBtn.classList.add('active');
    if (sessionTabBtn) sessionTabBtn.classList.remove('active');
    if (cacheContent) cacheContent.style.display = 'flex';
    if (sessionContent) sessionContent.style.display = 'none';
    if (footerCache) footerCache.style.display = 'flex';
    if (footerSession) footerSession.style.display = 'none';
    if (modalTitle) {
      modalTitle.innerHTML = '<i class="fa-solid fa-broom" style="color: var(--accent-amber);"></i> <span>Önbellek & Uygulama Sıfırlama</span>';
    }
    loadCacheStats();
  } else {
    if (sessionTabBtn) sessionTabBtn.classList.add('active');
    if (cacheTabBtn) cacheTabBtn.classList.remove('active');
    if (sessionContent) sessionContent.style.display = 'flex';
    if (cacheContent) cacheContent.style.display = 'none';
    if (footerSession) footerSession.style.display = 'flex';
    if (footerCache) footerCache.style.display = 'none';
    if (modalTitle) {
      modalTitle.innerHTML = '<i class="fa-brands fa-instagram" style="color: var(--accent-pink);"></i> <span>Instagram Giriş & Oturum</span>';
    }
    const alertBox = document.getElementById('directLoginAlert');
    if (alertBox) alertBox.style.display = 'none';
    
    const activeCard = document.getElementById('activeSessionCard');
    const isAlreadyLoggedIn = activeCard && activeCard.style.display !== 'none';
    if (!isAlreadyLoggedIn) {
      const userInput = document.getElementById('directLoginUsername');
      if (userInput) setTimeout(() => userInput.focus(), 250);
    }
  }
}

async function loadCacheStats() {
  const mediaEl = document.getElementById('cacheMediaCount');
  const apiEl = document.getElementById('cacheApiCount');
  try {
    const res = await safeFetchJson('/api/cache/stats');
    if (res && res.success) {
      if (mediaEl) mediaEl.innerText = `${res.media_cache_count} görsel`;
      if (apiEl) apiEl.innerText = `${res.api_cache_count} kayıt`;
    }
  } catch (err) {
    if (mediaEl) mediaEl.innerText = '0 görsel';
    if (apiEl) apiEl.innerText = '0 kayıt';
  }
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

let pending2faUsername = '';
let pending2faIdentifier = '';

async function submitDirectLogin() {
  const userInput = document.getElementById('directLoginUsername');
  const passInput = document.getElementById('directLoginPassword');
  const btn = document.getElementById('directLoginSubmitBtn');
  const alertBox = document.getElementById('directLoginAlert');

  const username = userInput ? userInput.value.trim() : '';
  const password = passInput ? passInput.value : '';

  if (!username) {
    showDirectLoginAlert('Lütfen kullanıcı adınızı girin.', 'error');
    if (userInput) userInput.focus();
    return;
  }
  if (!password) {
    showDirectLoginAlert('Lütfen şifrenizi girin.', 'error');
    if (passInput) passInput.focus();
    return;
  }

  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> <span>Giriş Yapılıyor...</span>';
    btn.disabled = true;
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const data = await safeFetchJson('/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (data.two_factor_required) {
      pending2faUsername = username;
      pending2faIdentifier = data.two_factor_identifier || '';

      document.getElementById('directLoginForm').style.display = 'none';
      const f2aForm = document.getElementById('directLogin2faForm');
      f2aForm.style.display = 'flex';
      
      showDirectLoginAlert('İki adımlı doğrulama devrede. Lütfen SMS veya Kimlik Doğrulayıcı uygulamanızdaki 6 haneli güvenlik kodunu girin.', 'info');
      const codeInput = document.getElementById('directLogin2faCode');
      if (codeInput) {
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 150);
      }
      return;
    }

    if (data.success) {
      showDirectLoginAlert(data.message || 'Giriş başarılı!', 'success');
      showToast(`🎉 Giriş başarılı: @${data.username || username}`, 'success');
      if (passInput) passInput.value = '';
      
      await loadConfig();

      setTimeout(() => {
        closeModal('settingsModal');
        if (currentProfile) {
          fetchStories(currentProfile.id, currentProfile.username);
          fetchHighlights(currentProfile.id);
          fetchPosts(currentProfile.username, currentProfile.id);
        }
      }, 1200);

    } else {
      const errMsg = data.error || data.message || 'Giriş yapılamadı.';
      showDirectLoginAlert(errMsg, 'error');
      showToast(errMsg, 'error');
    }

  } catch (err) {
    showDirectLoginAlert('Bağlantı hatası: ' + err.message, 'error');
    showToast('Bağlantı hatası: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Giriş Yap';
      btn.disabled = false;
    }
  }
}

async function submitDirectLogin2fa() {
  const codeInput = document.getElementById('directLogin2faCode');
  const btn = document.getElementById('directLogin2faSubmitBtn');
  const code = codeInput ? codeInput.value.trim() : '';

  if (!code) {
    showDirectLoginAlert('Lütfen 6 haneli güvenlik kodunu girin.', 'error');
    if (codeInput) codeInput.focus();
    return;
  }

  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> <span>Doğrulanıyor...</span>';
    btn.disabled = true;
  }

  try {
    const data = await safeFetchJson('/api/session/login_2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: pending2faUsername,
        code: code,
        two_factor_identifier: pending2faIdentifier
      })
    });

    if (data.success) {
      showDirectLoginAlert(data.message || 'Doğrulama başarılı!', 'success');
      showToast('🎉 İki adımlı doğrulama başarılı!', 'success');
      backToDirectLoginForm();
      const passInput = document.getElementById('directLoginPassword');
      if (passInput) passInput.value = '';

      await loadConfig();

      setTimeout(() => {
        closeModal('settingsModal');
        if (currentProfile) {
          fetchStories(currentProfile.id, currentProfile.username);
          fetchHighlights(currentProfile.id);
          fetchPosts(currentProfile.username, currentProfile.id);
        }
      }, 1200);

    } else {
      const errMsg = data.error || data.message || 'Kod doğrulanamadı.';
      showDirectLoginAlert(errMsg, 'error');
      showToast(errMsg, 'error');
    }

  } catch (err) {
    showDirectLoginAlert('Doğrulama hatası: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-shield-check"></i> Doğrula ve Giriş Yap';
      btn.disabled = false;
    }
  }
}

function backToDirectLoginForm() {
  document.getElementById('directLoginForm').style.display = 'flex';
  document.getElementById('directLogin2faForm').style.display = 'none';
  const codeInput = document.getElementById('directLogin2faCode');
  if (codeInput) codeInput.value = '';
}

function showDirectLoginAlert(message, type = 'error') {
  const alertBox = document.getElementById('directLoginAlert');
  const alertText = document.getElementById('directLoginAlertText');
  const icon = document.getElementById('directLoginAlertIcon');
  if (!alertBox || !alertText) return;

  alertBox.className = 'login-alert-box login-alert-' + type;
  alertText.innerText = message;
  alertBox.style.display = 'flex';

  if (icon) {
    if (type === 'success') {
      icon.className = 'fa-solid fa-circle-check';
    } else if (type === 'info') {
      icon.className = 'fa-solid fa-circle-info';
    } else {
      icon.className = 'fa-solid fa-circle-exclamation';
    }
  }
}

async function openExternalBrowserLogin() {
  const btn = document.getElementById('openBrowserWindowBtn');
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Açılıyor...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/api/session/open_browser', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Resmi Instagram sayfası harici pencerede açıldı.', 'info');
      showDirectLoginAlert('Instagram sayfası açıldı. Giriş yaptıktan sonra isterseniz doğrudan yukarıdaki kullanıcı adı ve şifre formunu da kullanabilirsiniz.', 'info');
    } else {
      showToast(data.error || 'Tarayıcı açılamadı.', 'error');
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Resmi Instagram Sayfasını Ayrı Pencerede Aç';
      btn.disabled = false;
    }
  }
}

async function saveSessionId() {
  const input = document.getElementById('sessionIdInput');
  const sid = input.value.trim();
  const btn = document.getElementById('saveSessionBtn');
  const resultDiv = document.getElementById('sessionTestResult');

  if (!sid) {
    showToast('Lütfen bir sessionid girin.', 'error');
    return;
  }

  btn.innerHTML = '<span class="spinner"></span> Kaydediliyor...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid })
    });
    const data = await res.json();

    resultDiv.style.display = 'block';
    if (data.test && data.test.valid) {
      resultDiv.style.background = 'rgba(16, 185, 129, 0.15)';
      resultDiv.style.color = '#34d399';
      resultDiv.style.border = '1px solid #10b981';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.test.message}`;
      showToast('Oturum başarıyla doğrulandı ve kaydedildi!', 'success');
    } else {
      resultDiv.style.background = 'rgba(239, 68, 68, 0.15)';
      resultDiv.style.color = '#f87171';
      resultDiv.style.border = '1px solid #ef4444';
      resultDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.test ? data.test.message : 'Doğrulama başarısız'}`;
      showToast('SessionID kaydedildi ancak Instagram doğrulaması başarısız oldu.', 'warning');
    }

    loadConfig();
  } catch (err) {
    showToast('Kaydetme hatası: ' + err.message, 'error');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Kaydet';
    btn.disabled = false;
  }
}

async function testCurrentSession() {
  const btn = document.getElementById('testSessionBtn');
  const resultDiv = document.getElementById('sessionTestResult');
  btn.innerHTML = '<span class="spinner"></span> Test ediliyor...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/session/test');
    const data = await res.json();

    resultDiv.style.display = 'block';
    if (data.valid) {
      resultDiv.style.background = 'rgba(16, 185, 129, 0.15)';
      resultDiv.style.color = '#34d399';
      resultDiv.style.border = '1px solid #10b981';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.message}`;
    } else {
      resultDiv.style.background = 'rgba(239, 68, 68, 0.15)';
      resultDiv.style.color = '#f87171';
      resultDiv.style.border = '1px solid #ef4444';
      resultDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.message}`;
    }
  } catch (err) {
    showToast('Hata: ' + err.message, 'error');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Oturumu Test Et';
    btn.disabled = false;
  }
}

async function clearSessionId() {
  if (!confirm('Kayıtlı oturum bilgisini silmek istediğinize emin misiniz?')) return;
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: '' })
  });
  const sidInput = document.getElementById('sessionIdInput');
  if (sidInput) sidInput.value = '';
  const testRes = document.getElementById('sessionTestResult');
  if (testRes) testRes.style.display = 'none';
  const alertBox = document.getElementById('directLoginAlert');
  if (alertBox) alertBox.style.display = 'none';
  const passInput = document.getElementById('directLoginPassword');
  if (passInput) passInput.value = '';
  await loadConfig();
  showToast('Oturum bilgisi temizlendi.', 'info');
}

async function resetAppCache(isFactoryReset = false) {
  let clearHistory = false;
  let clearFavorites = false;
  let clearSession = false;

  if (isFactoryReset) {
    const ok = confirm(
      '⚠️ DİKKAT: Kapsamlı Fabrika Sıfırlaması\n\n' +
      '• Tüm görsel, hikaye ve API önbellekleri silinecektir.\n' +
      '• Arama geçmişiniz ve favorileriniz silinecektir.\n' +
      '• Kayıtlı Instagram oturumunuz kapatılacaktır.\n' +
      '• Uygulama ilk açılış durumuna döndürülecektir.\n\n' +
      'Sıfırlamayı onaylıyor musunuz?'
    );
    if (!ok) return;
    clearHistory = true;
    clearFavorites = true;
    clearSession = true;
  } else {
    const histCheck = document.getElementById('resetClearHistoryCheck');
    clearHistory = histCheck ? histCheck.checked : false;
  }

  const primaryBtn = document.getElementById('clearCacheBtn');
  const footerBtn = document.getElementById('footerResetCacheBtn');
  const factoryBtn = document.getElementById('factoryResetBtn');

  const targetBtn = isFactoryReset ? factoryBtn : (primaryBtn || footerBtn);
  const oldText = targetBtn ? targetBtn.innerHTML : '';
  if (targetBtn) {
    targetBtn.innerHTML = '<span class="spinner"></span> Sıfırlanıyor...';
    targetBtn.disabled = true;
  }
  if (footerBtn && !isFactoryReset) {
    footerBtn.innerHTML = '<span class="spinner"></span> Sıfırlanıyor...';
    footerBtn.disabled = true;
  }

  try {
    // 1. Backend cache purge
    const res = await fetch('/api/cache/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clear_history: clearHistory,
        clear_favorites: clearFavorites,
        clear_session: clearSession
      })
    });
    const data = await res.json();

    // 2. Clear frontend runtime state & memory
    highlightAlbumsCache.clear();
    currentProfile = null;
    currentStories = [];
    currentHighlightStories = [];
    playingStoriesList = [];
    currentHighlights = [];
    currentPosts = [];
    postsNextMaxId = null;
    postsHasNextPage = false;
    isFetchingMorePosts = false;

    // 3. Clear browser cache storage, localStorage & sessionStorage
    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }
    } catch (cErr) {
      console.warn('CacheStorage purge warning:', cErr);
    }

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (sErr) {}

    // 4. Reset search input
    const input = document.getElementById('usernameInput');
    if (input) input.value = '';

    showToast('Önbellek temizlendi, uygulama yeniden başlatılıyor...', 'success');

    // 5. Clean reload
    setTimeout(() => {
      window.location.reload(true);
    }, 600);

  } catch (err) {
    showToast('Önbellek sıfırlanırken hata: ' + err.message, 'error');
    if (targetBtn) {
      targetBtn.innerHTML = oldText;
      targetBtn.disabled = false;
    }
    if (footerBtn && !isFactoryReset) {
      footerBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Önbelleği Sıfırla';
      footerBtn.disabled = false;
    }
  }
}

// ==========================================
// Search & Profile Loading
// ==========================================

function quickSearch(username) {
  document.getElementById('usernameInput').value = username;
  document.getElementById('searchForm').dispatchEvent(new Event('submit'));
}

async function handleSearch(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('usernameInput');
  const username = input.value.trim().replace(/^@/, '');
  const submitBtn = document.getElementById('searchSubmitBtn');

  if (!username) return;

  submitBtn.innerHTML = '<span class="spinner"></span> <span>Aranıyor...</span>';
  submitBtn.disabled = true;

  try {
    const data = await safeFetchJson(`/api/profile?username=${encodeURIComponent(username)}`);

    if (!data.success) {
      if (data.rate_limited) {
        showToast(data.error, 'warning');
        openModal('settingsModal');
      } else {
        showToast(data.error || 'Profil bulunamadı', 'error');
      }
      return;
    }

    currentProfile = data;
    renderProfile(data);

    // Only fetch stories, highlights & posts if profile is NOT private!
    if (!data.is_private) {
      switchTab('stories');
      fetchStories(data.id, data.username);
      fetchHighlights(data.id);
      fetchPosts(data.username, data.id);
    }
    loadConfig(); // Refresh search history

  } catch (err) {
    showToast('Bağlantı hatası: ' + err.message, 'error');
  } finally {
    submitBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> <span>Sorgula</span>';
    submitBtn.disabled = false;
  }
}

function extractInstagramFilename(url, defaultName = '') {
  if (!url) return defaultName;
  try {
    let cleanUrl = url;
    if (cleanUrl.includes('/get-cdn-image/')) {
      const part = cleanUrl.split('/get-cdn-image/')[1].split('______')[0];
      const pad = part.length % 4;
      const b64 = part + (pad ? '='.repeat(4 - pad) : '');
      const decoded = atob(b64);
      if (decoded.includes('http')) cleanUrl = decoded;
    }
    const pathname = new URL(cleanUrl).pathname;
    const name = pathname.split('/').filter(Boolean).pop();
    if (name && name.includes('.')) {
      const cleanName = decodeURIComponent(name).split('?')[0].split('#')[0];
      if (cleanName && cleanName.includes('.')) {
        return cleanName;
      }
    }
  } catch (e) {
    // fallback
  }
  return defaultName;
}

function renderProfile(p) {
  document.getElementById('welcomeGuide').style.display = 'none';
  const card = document.getElementById('profileCard');
  card.style.display = 'flex';

  const isPrivate = Boolean(p.is_private);

  // Toggle locked class on profileCard
  if (isPrivate) {
    card.classList.add('is-locked');
  } else {
    card.classList.remove('is-locked');
  }

  // Avatar (routed via proxy with resilient fallback and original full quality)
  const avatarUrl = p.profile_pic_url_hd || p.profile_pic_url;
  const avatarImg = document.getElementById('profileAvatar');
  if (avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'))) {
    avatarImg.src = `/api/proxy?url=${encodeURIComponent(avatarUrl)}&hd=1&username=${encodeURIComponent(p.username)}`;
  } else {
    avatarImg.src = avatarUrl || '/img/default_avatar.svg';
  }
  avatarImg.onerror = function() {
    this.onerror = function() {
      this.onerror = null;
      this.src = '/img/default_avatar.svg';
    };
    if (avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'))) {
      this.src = `/api/proxy?url=${encodeURIComponent(avatarUrl)}&hd=1&username=${encodeURIComponent(p.username)}`;
    } else {
      this.src = '/img/default_avatar.svg';
    }
  };

  // Avatar lock badge
  const avatarLock = document.getElementById('avatarLockBadge');
  if (avatarLock) {
    avatarLock.style.display = isPrivate ? 'flex' : 'none';
  }

  document.getElementById('profileUsername').innerText = '@' + p.username;
  document.getElementById('profileVerified').style.display = p.is_verified ? 'inline-block' : 'none';
  
  // Private badge in name row
  const privBadge = document.getElementById('profilePrivateBadge');
  if (privBadge) {
    privBadge.style.display = isPrivate ? 'inline-flex' : 'none';
  }

  document.getElementById('profileFullName').innerText = p.full_name || p.username;
  document.getElementById('profileBio').innerText = p.biography || (isPrivate ? 'Bu hesap gizlidir (kilitli profil).' : '');

  document.getElementById('profilePostsCount').innerText = formatNumber(p.posts_count);
  document.getElementById('profileFollowers').innerText = formatNumber(p.followers);
  document.getElementById('profileFollowing').innerText = formatNumber(p.following);

  // Manage visibility of Content Tabs vs Private HD Showcase
  const tabsNav = document.querySelector('.content-tabs');
  const storiesTab = document.getElementById('storiesTabContent');
  const highlightsTab = document.getElementById('highlightsTabContent');
  const profilePicTab = document.getElementById('profilePicTabContent');
  const privateBanner = document.getElementById('privateProfileBanner');
  const privateShowcase = document.getElementById('privateHdShowcase');

  const hdUrl = p.profile_pic_url_hd || p.profile_pic_url;
  const isRemote = hdUrl && (hdUrl.startsWith('http://') || hdUrl.startsWith('https://'));
  const proxyUrl = isRemote 
    ? `/api/proxy?url=${encodeURIComponent(hdUrl)}&hd=1&username=${encodeURIComponent(p.username)}` 
    : (hdUrl || '/img/default_avatar.svg');
  // Exact authentic server filename from Instagram CDN
  const serverFilename = extractInstagramFilename(hdUrl, `${p.username}_profile_hd.jpg`);
  const dlUrl = isRemote 
    ? `/api/download?url=${encodeURIComponent(hdUrl)}&hd=1&username=${encodeURIComponent(p.username)}` 
    : hdUrl;

  // Set top profile card download button
  const cardDlBtn = document.getElementById('profileCardDlBtn');
  if (cardDlBtn) {
    cardDlBtn.href = dlUrl;
    if (serverFilename) {
      cardDlBtn.download = serverFilename;
    } else {
      cardDlBtn.removeAttribute('download');
    }
  }

  // Update favorite toggle button state
  const favBtn = document.getElementById('favToggleBtn');
  const isFav = currentFavorites.some(f => f.username && f.username.toLowerCase() === p.username.toLowerCase());
  if (favBtn) {
    if (isFav) {
      favBtn.innerHTML = '<i class="fa-solid fa-bookmark" style="color: var(--accent-pink);"></i> Favoride';
    } else {
      favBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Favorilere Ekle';
    }
  }

  // Story ring: ONLY display colorful gradient ring when active story exists
  const avatarRing = document.getElementById('profileAvatarRing');
  if (avatarRing) {
    if (p.has_active_story) {
      avatarRing.classList.add('has-story');
      avatarRing.parentElement.title = 'Aktif Story Mevcut — HD Profil Fotoğrafını Büyüt';
    } else {
      avatarRing.classList.remove('has-story');
      avatarRing.parentElement.title = 'HD Profil Fotoğrafını Büyüt';
    }
  }

  const postsTab = document.getElementById('postsTabContent');
  const btnPosts = document.getElementById('tabPostsBtn');

  if (isPrivate) {
    hidePinnedHighlightsTray();
    // Hide tabs completely for locked accounts
    if (tabsNav) tabsNav.style.display = 'none';
    if (storiesTab) storiesTab.style.display = 'none';
    if (postsTab) postsTab.style.display = 'none';
    if (profilePicTab) profilePicTab.style.display = 'none';

    // Show locked banner
    if (privateBanner) privateBanner.style.display = 'flex';
    if (avatarRing) avatarRing.classList.remove('has-story');

    // Populate and display private HD showcase
    const privateShowcase = document.getElementById('privateHdShowcase');
    if (privateShowcase) {
      privateShowcase.style.display = 'block';
      const privImg = document.getElementById('privateShowcaseImg');
      const privDims = document.getElementById('privateShowcaseDims');
      const privDlBtn = document.getElementById('privateShowcaseDlBtn');

      if (privImg) {
        privImg.src = proxyUrl;
        privImg.onerror = function() {
          this.onerror = null;
          this.src = isRemote ? hdUrl : '/img/default_avatar.svg';
        };
        privImg.onload = function() {
          if (privDims && privImg.naturalWidth) {
            const w = privImg.naturalWidth;
            const h = privImg.naturalHeight;
            const isFhd = w >= 700 || h >= 700;
            privDims.innerText = `${w} × ${h} ${isFhd ? 'Full HD' : 'px'}`;
          }
        };
      }
      if (privDlBtn) {
        privDlBtn.href = dlUrl;
        if (serverFilename) {
          privDlBtn.download = serverFilename;
        } else {
          privDlBtn.removeAttribute('download');
        }
      }
    }
  } else {
    // Public profile: Hide private showcase, show tabs and reset active tab to stories
    const privateShowcase = document.getElementById('privateHdShowcase');
    if (privateShowcase) privateShowcase.style.display = 'none';
    if (tabsNav) tabsNav.style.display = 'flex';
    if (btnPosts) btnPosts.style.display = 'inline-flex';
    if (privateBanner) privateBanner.style.display = 'none';
    switchTab('stories');

    const publicShowcaseImg = document.getElementById('publicShowcaseImg');
    const publicShowcaseDlBtn = document.getElementById('publicShowcaseDlBtn');
    const publicShowcaseDims = document.getElementById('publicShowcaseDims');
    const publicShowcasePrivacy = document.getElementById('publicShowcasePrivacy');
    if (publicShowcasePrivacy) {
      publicShowcasePrivacy.innerText = isPrivate ? 'Gizli Profil' : 'Herkese Açık';
    }
    if (publicShowcaseImg) {
      publicShowcaseImg.src = proxyUrl;
      publicShowcaseImg.onerror = function() {
        this.onerror = null;
        this.src = '/img/default_avatar.svg';
      };
      publicShowcaseImg.onload = function() {
        if (publicShowcaseDims && publicShowcaseImg.naturalWidth) {
          const w = publicShowcaseImg.naturalWidth;
          const h = publicShowcaseImg.naturalHeight;
          const isFhd = w >= 700 || h >= 700;
          publicShowcaseDims.innerText = `${w} × ${h} ${isFhd ? 'Full HD' : 'px'}`;
        }
      };
    }
    if (publicShowcaseDlBtn) {
      publicShowcaseDlBtn.href = dlUrl;
      if (serverFilename) {
        publicShowcaseDlBtn.download = serverFilename;
      } else {
        publicShowcaseDlBtn.removeAttribute('download');
      }
    }
  }

  // Scroll to profile
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copyProfileHdLink() {
  if (!currentProfile) return;
  const hdUrl = currentProfile.profile_pic_url_hd || currentProfile.profile_pic_url;
  if (!hdUrl) return;
  const isRemote = hdUrl.startsWith('http://') || hdUrl.startsWith('https://');
  const targetUrl = isRemote ? `${window.location.origin}/api/proxy?url=${encodeURIComponent(hdUrl)}` : hdUrl;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(targetUrl).then(() => {
      showToast('HD Fotoğraf bağlantısı panoya kopyalandı!', 'success');
    }).catch(() => {
      prompt('HD Fotoğraf Bağlantısı:', targetUrl);
    });
  } else {
    prompt('HD Fotoğraf Bağlantısı:', targetUrl);
  }
}

// ==========================================
// HD Profile Picture Lightbox Modal
// ==========================================

let currentHdZoom = 1.0;
let isHdFullscreen = false;
let hdPanX = 0;
let hdPanY = 0;
let isHdDragging = false;
let hdDragStartX = 0;
let hdDragStartY = 0;
let hdInteractionsInitialized = false;

function openHdProfileModal() {
  if (!currentProfile) return;
  const hdUrl = currentProfile.profile_pic_url_hd || currentProfile.profile_pic_url;
  const isRemote = hdUrl && (hdUrl.startsWith('http://') || hdUrl.startsWith('https://'));
  const uname = currentProfile.username;
  const proxyUrl = isRemote 
    ? `/api/proxy?url=${encodeURIComponent(hdUrl)}&hd=1&username=${encodeURIComponent(uname)}` 
    : (hdUrl || '/img/default_avatar.svg');
  const serverFilename = extractInstagramFilename(hdUrl, `${uname}_profile_hd.jpg`);
  const dlUrl = isRemote 
    ? `/api/download?url=${encodeURIComponent(hdUrl)}&hd=1&username=${encodeURIComponent(uname)}` 
    : hdUrl;

  document.getElementById('hdModalTitle').innerText = `@${uname} — HD Profil Fotoğrafı`;
  const img = document.getElementById('hdModalImg');
  const dimsEl = document.getElementById('hdImageDims');
  if (dimsEl) {
    dimsEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> HD Yükleniyor...';
  }

  // Reset zoom, pan & fullscreen state
  currentHdZoom = 1.0;
  hdPanX = 0;
  hdPanY = 0;
  isHdFullscreen = false;
  const modal = document.getElementById('hdProfileModal');
  if (modal) modal.classList.remove('is-fullscreen');
  const fsBtn = document.getElementById('hdModalFullscreenBtn');
  if (fsBtn) {
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fsBtn.title = 'Tam Ekran Modu (F)';
  }
  updateProfilePicTransform();

  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const isFullHd = w >= 700 || h >= 700;
    const label = (w && h) ? `${w} × ${h} ${isFullHd ? 'Full HD' : 'px'}` : 'HD Profil Fotoğrafı';
    if (dimsEl) dimsEl.innerHTML = `<i class="fa-solid fa-image"></i> ${label}`;
  };

  img.onerror = function() {
    this.onerror = null;
    if (isRemote && this.src !== hdUrl) {
      this.src = hdUrl;
    } else {
      this.src = '/img/default_avatar.svg';
    }
    if (dimsEl) dimsEl.innerHTML = '<i class="fa-solid fa-image"></i> Profil Fotoğrafı';
  };

  img.src = proxyUrl;

  const dlBtn = document.getElementById('hdDownloadBtn');
  if (dlBtn) {
    dlBtn.href = dlUrl;
    if (serverFilename) {
      dlBtn.download = serverFilename;
    } else {
      dlBtn.removeAttribute('download');
    }
  }

  const openNewTabBtn = document.getElementById('hdOpenNewTabBtn');
  if (openNewTabBtn) {
    openNewTabBtn.href = proxyUrl;
  }

  // Initialize mouse/touch listeners once
  if (!hdInteractionsInitialized) {
    initHdModalInteractions();
    hdInteractionsInitialized = true;
  }

  openModal('hdProfileModal');
}

function zoomProfilePic(delta) {
  const newZoom = Math.min(4.0, Math.max(0.5, Math.round((currentHdZoom + delta) * 100) / 100));
  currentHdZoom = newZoom;
  if (currentHdZoom <= 1.0) {
    hdPanX = 0;
    hdPanY = 0;
  }
  updateProfilePicTransform();
}

function resetProfilePicZoom() {
  currentHdZoom = 1.0;
  hdPanX = 0;
  hdPanY = 0;
  updateProfilePicTransform();
}

function updateProfilePicTransform() {
  const img = document.getElementById('hdModalImg');
  const container = document.getElementById('hdImgContainer');
  const zoomBadge = document.getElementById('hdZoomBadge');
  
  if (img) {
    img.style.transform = `translate(${hdPanX}px, ${hdPanY}px) scale(${currentHdZoom})`;
  }
  if (container) {
    if (currentHdZoom > 1.05) {
      container.style.cursor = isHdDragging ? 'grabbing' : 'grab';
    } else {
      container.style.cursor = 'zoom-in';
    }
  }
  if (zoomBadge) {
    zoomBadge.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> %${Math.round(currentHdZoom * 100)}`;
  }
}

function toggleProfilePicFullscreen() {
  const modal = document.getElementById('hdProfileModal');
  const fsBtn = document.getElementById('hdModalFullscreenBtn');
  if (!modal) return;
  
  isHdFullscreen = !isHdFullscreen;
  modal.classList.toggle('is-fullscreen', isHdFullscreen);
  
  // Try native Fullscreen API for true immersive fullscreen experience if supported
  try {
    if (isHdFullscreen) {
      if (modal.requestFullscreen && !document.fullscreenElement) {
        modal.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  } catch (err) {}

  if (fsBtn) {
    fsBtn.innerHTML = isHdFullscreen ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
    fsBtn.title = isHdFullscreen ? 'Tam Ekrandan Çık (Esc / F)' : 'Tam Ekran Modu (F)';
  }
}

function initHdModalInteractions() {
  const container = document.getElementById('hdImgContainer');
  const modal = document.getElementById('hdProfileModal');
  if (!container) return;

  // Mouse Drag / Pan
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Primary left click only
    if (currentHdZoom <= 1.05) return;
    isHdDragging = true;
    hdDragStartX = e.clientX - hdPanX;
    hdDragStartY = e.clientY - hdPanY;
    container.classList.add('is-dragging');
    container.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isHdDragging) return;
    hdPanX = e.clientX - hdDragStartX;
    hdPanY = e.clientY - hdDragStartY;
    updateProfilePicTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isHdDragging) {
      isHdDragging = false;
      container.classList.remove('is-dragging');
      if (container) {
        container.style.cursor = currentHdZoom > 1.05 ? 'grab' : 'zoom-in';
      }
    }
  });

  // Wheel zoom with mouse wheel
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    zoomProfilePic(delta);
  }, { passive: false });

  // Double click toggles between 100% and 200%
  container.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (currentHdZoom > 1.15) {
      resetProfilePicZoom();
    } else {
      zoomProfilePic(1.0);
    }
  });

  // Touch Drag & Tap support for mobile
  let lastTouchTime = 0;
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      if (now - lastTouchTime < 300) {
        // Double tap toggle
        e.preventDefault();
        if (currentHdZoom > 1.15) resetProfilePicZoom();
        else zoomProfilePic(1.0);
      } else {
        if (currentHdZoom > 1.05) {
          isHdDragging = true;
          hdDragStartX = touch.clientX - hdPanX;
          hdDragStartY = touch.clientY - hdPanY;
          container.classList.add('is-dragging');
        }
      }
      lastTouchTime = now;
    }
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (isHdDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      hdPanX = touch.clientX - hdDragStartX;
      hdPanY = touch.clientY - hdDragStartY;
      updateProfilePicTransform();
      e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener('touchend', () => {
    isHdDragging = false;
    container.classList.remove('is-dragging');
  });

  // Fullscreen change listener to sync icons
  document.addEventListener('fullscreenchange', () => {
    const fsBtn = document.getElementById('hdModalFullscreenBtn');
    if (!document.fullscreenElement && isHdFullscreen) {
      isHdFullscreen = false;
      if (modal) modal.classList.remove('is-fullscreen');
      if (fsBtn) {
        fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        fsBtn.title = 'Tam Ekran Modu (F)';
      }
    }
  });

  // Keyboard navigation when modal is open
  document.addEventListener('keydown', (e) => {
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      closeModal('hdProfileModal');
    } else if (e.key === '+' || e.key === '=') {
      zoomProfilePic(0.25);
    } else if (e.key === '-' || e.key === '_') {
      zoomProfilePic(-0.25);
    } else if (e.key === '0') {
      resetProfilePicZoom();
    } else if (e.key.toLowerCase() === 'f') {
      toggleProfilePicFullscreen();
    }
  });
}

// ==========================================
// Stories & Highlights Fetching
// ==========================================

async function fetchStories(userId, username) {
  const grid = document.getElementById('storiesGrid');
  const empty = document.getElementById('storiesEmpty');
  const badge = document.getElementById('storiesCountBadge');
  const actions = document.getElementById('storiesActions');
  const subtext = document.getElementById('storiesSubtext');

  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><span class="spinner" style="width: 32px; height: 32px; border-width: 3px;"></span><p style="margin-top: 12px; color: var(--text-secondary);">Hikayeler alınıyor...</p></div>';
  empty.style.display = 'none';

  try {
    const data = await safeFetchJson(`/api/stories?user_id=${encodeURIComponent(userId)}&username=${encodeURIComponent(username)}`);

    const loginPromptBtn = document.getElementById('storiesLoginPromptBtn');

    if (!data.success) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      empty.querySelector('.empty-title').innerText = data.requires_session ? 'Instagram Oturumu Gerekli' : 'Story Bilgisi Alınamadı';
      empty.querySelector('.empty-desc').innerText = data.error;
      badge.innerText = '0';
      actions.style.display = 'none';
      if (loginPromptBtn) {
        loginPromptBtn.style.display = data.requires_session ? 'inline-flex' : 'none';
      }
      const avatarRing = document.getElementById('profileAvatarRing');
      if (avatarRing) {
        avatarRing.classList.remove('has-story');
        avatarRing.parentElement.title = 'HD Profil Fotoğrafını Büyüt';
      }
      return;
    }

    if (loginPromptBtn) loginPromptBtn.style.display = 'none';

    currentStories = data.stories || [];
    badge.innerText = currentStories.length;
    subtext.innerText = currentStories.length > 0 ? `(${currentStories.length} aktif içerik)` : '';

    const avatarRing = document.getElementById('profileAvatarRing');
    if (avatarRing) {
      if (currentStories.length > 0) {
        avatarRing.classList.add('has-story');
        avatarRing.parentElement.title = `${currentStories.length} Aktif Story Mevcut — HD Profil Fotoğrafını Büyüt`;
      } else {
        avatarRing.classList.remove('has-story');
        avatarRing.parentElement.title = 'HD Profil Fotoğrafını Büyüt';
      }
    }

    if (currentStories.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      empty.querySelector('.empty-title').innerText = 'Aktif Story Yok';
      empty.querySelector('.empty-desc').innerText = 'Bu kullanıcının son 24 saat içinde paylaştığı aktif bir hikaye bulunmuyor.';
      actions.style.display = 'none';
      if (loginPromptBtn) loginPromptBtn.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    actions.style.display = 'flex';
    renderStoriesGrid(currentStories);

  } catch (err) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    empty.querySelector('.empty-title').innerText = 'Bağlantı Hatası';
    empty.querySelector('.empty-desc').innerText = err.message;
  }
}

function renderStoriesGrid(stories) {
  const grid = document.getElementById('storiesGrid');
  grid.innerHTML = '';

  stories.forEach((story, idx) => {
    const card = document.createElement('div');
    card.className = 'story-card';

    const isVideo = Boolean(story.is_video);
    const hasValidImgThumb = story.image_url && 
      !story.image_url.includes('.mp4') && 
      !story.image_url.includes('.webm') && 
      story.image_url !== story.video_url;

    let mediaMarkup = '';
    if (isVideo && !hasValidImgThumb) {
      const videoSrc = `/api/proxy?url=${encodeURIComponent(story.video_url || story.download_url)}`;
      mediaMarkup = `<video src="${videoSrc}#t=0.1" preload="metadata" muted playsinline class="story-preview-video"></video>`;
    } else {
      const thumbUrl = hasValidImgThumb ? story.image_url : (story.download_url || story.image_url);
      const proxyThumb = `/api/proxy?url=${encodeURIComponent(thumbUrl)}`;
      mediaMarkup = `<img src="${proxyThumb}" alt="Story ${idx + 1}" loading="lazy">`;
    }

    const dlFilename = extractInstagramFilename(story.download_url, `${currentProfile.username}_story_${idx + 1}.${isVideo ? 'mp4' : 'jpg'}`);
    const dlUrl = `/api/download?url=${encodeURIComponent(story.download_url)}&filename=${encodeURIComponent(dlFilename)}`;

    card.innerHTML = `
      <div class="story-media-box">
        ${mediaMarkup}
        <div class="story-card-overlay">
          <div class="story-meta-top">
            <span class="story-type-badge ${isVideo ? 'video' : 'photo'}">
              <i class="fa-solid ${isVideo ? 'fa-video' : 'fa-image'}"></i>
              ${isVideo ? 'Video' : 'Fotoğraf'}
            </span>
            <span class="story-time">${story.time_ago || 'Aktif'}</span>
          </div>

          <div class="story-play-overlay">
            <i class="fa-solid ${isVideo ? 'fa-play' : 'fa-eye'}"></i>
          </div>

          <div style="font-size: 11px; color: #f1f5f9; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
            <i class="fa-regular fa-clock"></i> ${story.expires_in || '24 saat'}
          </div>
        </div>
      </div>

      <div class="story-card-footer">
        <span class="story-footer-time">${story.time_ago || ''}</span>
        <a href="${dlUrl}" class="btn btn-primary" style="padding: 5px 12px; font-size: 11px;" download>
          <i class="fa-solid fa-download"></i> İndir
        </a>
      </div>
    `;

    const imgEl = card.querySelector('img');
    if (imgEl) {
      imgEl.onerror = function() {
        this.onerror = null;
        const fallback = story.image_url || story.download_url;
        if (fallback && fallback.startsWith('http') && !fallback.includes('.mp4')) {
          this.src = fallback;
        }
      };
    }

    const mediaBox = card.querySelector('.story-media-box');
    mediaBox.onclick = () => openStoryPlayer(idx, false);

    grid.appendChild(card);
  });
}

function renderPinnedHighlightsTray(highlights) {
  const container = document.getElementById('pinnedHighlightsContainer');
  const tray = document.getElementById('pinnedHighlightsTray');
  const badge = document.getElementById('pinnedHighlightsBadge');
  if (!container || !tray) return;

  if (!highlights || highlights.length === 0) {
    container.style.display = 'none';
    tray.innerHTML = '';
    return;
  }

  tray.innerHTML = '';
  if (badge) badge.innerText = highlights.length;

  highlights.forEach(h => {
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'pinned-highlight-bubble';
    bubble.title = `${h.title || 'Öne Çıkan'} (Tıkla ve İzle)`;
    bubble.onclick = () => loadHighlightAlbum(h.id, h.title, bubble);

    // Anticipatory pre-fetch on hover or touchstart for instant 0ms open
    bubble.onmouseenter = bubble.ontouchstart = () => {
      if (h.id && !highlightAlbumsCache.has(h.id)) {
        fetch(`/api/highlight_stories?highlight_id=${encodeURIComponent(h.id)}`)
          .then(r => r.json())
          .then(d => {
            if (d.success && d.stories && d.stories.length > 0) {
              highlightAlbumsCache.set(h.id, d.stories);
            }
          })
          .catch(() => {});
      }
    };

    const isRemote = h.cover_url && (h.cover_url.startsWith('http://') || h.cover_url.startsWith('https://'));
    const coverUrl = isRemote ? `/api/proxy?url=${encodeURIComponent(h.cover_url)}` : (h.cover_url || '/img/default_cover.svg');

    bubble.innerHTML = `
      <div class="pinned-bubble-ring">
        <img src="${coverUrl}" alt="${h.title}" class="pinned-bubble-img">
      </div>
      <span class="pinned-bubble-title">${h.title || 'Öne Çıkan'}</span>
    `;

    const imgEl = bubble.querySelector('img');
    imgEl.onerror = function() {
      this.onerror = null;
      this.src = '/img/default_cover.svg';
    };

    tray.appendChild(bubble);
  });

  container.style.display = 'flex';

  // Smooth background prefetch queue for all highlight albums
  const queue = [...highlights];
  async function prefetchQueue() {
    for (const h of queue) {
      if (!h.id || highlightAlbumsCache.has(h.id)) continue;
      try {
        const res = await fetch(`/api/highlight_stories?highlight_id=${encodeURIComponent(h.id)}`);
        const d = await res.json();
        if (d.success && d.stories && d.stories.length > 0) {
          highlightAlbumsCache.set(h.id, d.stories);
        }
      } catch (e) {}
    }
  }
  setTimeout(prefetchQueue, 250);
}

function hidePinnedHighlightsTray() {
  const container = document.getElementById('pinnedHighlightsContainer');
  const tray = document.getElementById('pinnedHighlightsTray');
  if (container) container.style.display = 'none';
  if (tray) tray.innerHTML = '';
}

async function fetchHighlights(userId) {
  try {
    const username = currentProfile ? currentProfile.username : '';
    const data = await safeFetchJson(`/api/highlights?user_id=${encodeURIComponent(userId)}&username=${encodeURIComponent(username)}`);

    if (!data.success || !data.highlights || data.highlights.length === 0) {
      hidePinnedHighlightsTray();
      return;
    }

    currentHighlights = data.highlights;
    renderPinnedHighlightsTray(currentHighlights);

  } catch (err) {
    console.error('Highlights error:', err);
    hidePinnedHighlightsTray();
  }
}

async function loadHighlightAlbum(highlightId, title, bubbleEl) {
  // If already in memory cache, open instantly!
  if (highlightAlbumsCache.has(highlightId)) {
    currentHighlightStories = highlightAlbumsCache.get(highlightId);
    openStoryPlayer(0, true);
    return;
  }

  if (bubbleEl) bubbleEl.classList.add('is-loading');
  showToast(`"${title}" albüm hikayeleri alınıyor...`, 'info');
  try {
    const data = await safeFetchJson(`/api/highlight_stories?highlight_id=${encodeURIComponent(highlightId)}`);
    if (bubbleEl) bubbleEl.classList.remove('is-loading');

    if (data.success && data.stories && data.stories.length > 0) {
      highlightAlbumsCache.set(highlightId, data.stories);
      currentHighlightStories = data.stories;
      openStoryPlayer(0, true);
      showToast(`"${title}" albümünden ${data.stories.length} hikaye yüklendi!`, 'success');
    } else {
      showToast('Albüm hikayeleri alınamadı veya albüm boş.', 'warning');
    }
  } catch (err) {
    if (bubbleEl) bubbleEl.classList.remove('is-loading');
    showToast('Hata: ' + err.message, 'error');
  }
}

// ==========================================
// Fullscreen Story Player
// ==========================================

function openStoryPlayer(index, fromHighlight = false) {
  playingStoriesList = fromHighlight ? currentHighlightStories : currentStories;
  if (!playingStoriesList || playingStoriesList.length === 0) return;
  playerIndex = index;
  
  // Set player user info
  document.getElementById('playerUsername').innerText = '@' + currentProfile.username;
  const avatarUrl = currentProfile.profile_pic_url || currentProfile.profile_pic_url_hd;
  const playerAvatar = document.getElementById('playerUserAvatar');
  if (avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'))) {
    playerAvatar.src = `/api/proxy?url=${encodeURIComponent(avatarUrl)}`;
  } else {
    playerAvatar.src = avatarUrl || '/img/default_avatar.svg';
  }
  playerAvatar.onerror = function() {
    this.onerror = null;
    this.src = '/img/default_avatar.svg';
  };

  // Build progress bar segments
  const progressContainer = document.getElementById('playerProgressContainer');
  progressContainer.innerHTML = '';
  playingStoriesList.forEach((_, i) => {
    const seg = document.createElement('div');
    seg.className = 'story-progress-seg';
    seg.innerHTML = `<div class="story-progress-fill" id="pFill_${i}"></div>`;
    progressContainer.appendChild(seg);
  });

  openModal('storyPlayerModal');
  loadPlayerItem(playerIndex);
}

function loadPlayerItem(index) {
  if (!playingStoriesList || index < 0 || index >= playingStoriesList.length) {
    closeStoryPlayer();
    return;
  }

  playerIndex = index;
  const story = playingStoriesList[index];

  // Update progress bars
  playingStoriesList.forEach((_, i) => {
    const fill = document.getElementById(`pFill_${i}`);
    if (fill) {
      if (i < index) fill.style.width = '100%';
      else if (i > index) fill.style.width = '0%';
    }
  });

  document.getElementById('playerTime').innerText = story.time_ago || '';

  const imgEl = document.getElementById('playerImage');
  const videoEl = document.getElementById('playerVideo');

  clearTimeout(playerTimer);
  clearInterval(playerProgressInterval);

  const fill = document.getElementById(`pFill_${index}`);
  if (fill) fill.style.width = '0%';

  if (story.is_video) {
    imgEl.style.display = 'none';
    videoEl.style.display = 'block';
    const videoStreamUrl = story.video_url || story.download_url;
    videoEl.src = `/api/proxy?url=${encodeURIComponent(videoStreamUrl)}`;
    videoEl.onerror = function() {
      this.onerror = null;
      if (videoStreamUrl && videoStreamUrl.startsWith('http')) {
        this.src = videoStreamUrl;
      }
    };
    videoEl.muted = isMuted;

    videoEl.onloadedmetadata = () => {
      const modal = document.getElementById('storyPlayerModal');
      if (modal && modal.classList.contains('open') && !isPlayerPaused) {
        videoEl.play().catch(() => {});
      } else {
        videoEl.pause();
      }
    };

    videoEl.ontimeupdate = () => {
      if (videoEl.duration && fill) {
        const pct = (videoEl.currentTime / videoEl.duration) * 100;
        fill.style.width = `${pct}%`;
      }
    };

    videoEl.onended = () => {
      playerNext();
    };

  } else {
    videoEl.pause();
    videoEl.onloadedmetadata = null;
    videoEl.ontimeupdate = null;
    videoEl.onended = null;
    videoEl.onerror = null;
    videoEl.currentTime = 0;
    videoEl.removeAttribute('src');
    try { videoEl.load(); } catch (e) {}
    videoEl.style.display = 'none';
    imgEl.style.display = 'block';
    const photoUrl = story.download_url || story.image_url;
    imgEl.src = `/api/proxy?url=${encodeURIComponent(photoUrl)}`;
    imgEl.onerror = function() {
      this.onerror = null;
      if (photoUrl && photoUrl.startsWith('http')) {
        this.src = photoUrl;
      }
    };

    let elapsed = 0;
    const intervalTime = 50;
    playerProgressInterval = setInterval(() => {
      if (!isPlayerPaused) {
        elapsed += intervalTime;
        if (fill) fill.style.width = `${(elapsed / PHOTO_DURATION_MS) * 100}%`;
        if (elapsed >= PHOTO_DURATION_MS) {
          clearInterval(playerProgressInterval);
          playerNext();
        }
      }
    }, intervalTime);
  }
}

function playerNext() {
  if (playerIndex < playingStoriesList.length - 1) {
    loadPlayerItem(playerIndex + 1);
  } else {
    closeStoryPlayer();
  }
}

function playerPrev() {
  if (playerIndex > 0) {
    loadPlayerItem(playerIndex - 1);
  } else {
    loadPlayerItem(0);
  }
}

function togglePlayPause() {
  const btn = document.getElementById('playPauseBtn');
  const videoEl = document.getElementById('playerVideo');
  const story = playingStoriesList[playerIndex];

  isPlayerPaused = !isPlayerPaused;

  if (isPlayerPaused) {
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Oynat';
    if (story && story.is_video) videoEl.pause();
  } else {
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> Duraklat';
    if (story && story.is_video) videoEl.play().catch(() => {});
  }
}

function togglePlayerSound() {
  isMuted = !isMuted;
  const videoEl = document.getElementById('playerVideo');
  videoEl.muted = isMuted;
  const icon = document.getElementById('soundIcon');
  icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
}

function downloadCurrentPlayerStory() {
  const story = playingStoriesList[playerIndex];
  if (!story) return;
  const dlFilename = extractInstagramFilename(story.download_url, `${currentProfile.username}_story_${playerIndex + 1}.${story.is_video ? 'mp4' : 'jpg'}`);
  const dlUrl = `/api/download?url=${encodeURIComponent(story.download_url)}&filename=${encodeURIComponent(dlFilename)}`;
  
  const a = document.createElement('a');
  a.href = dlUrl;
  a.download = dlFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Story indirme başlatıldı: ' + dlFilename, 'success');
}

function closeStoryPlayer() {
  clearTimeout(playerTimer);
  clearInterval(playerProgressInterval);
  isPlayerPaused = false;
  const videoEl = document.getElementById('playerVideo');
  if (videoEl) {
    videoEl.onloadedmetadata = null;
    videoEl.ontimeupdate = null;
    videoEl.onended = null;
    videoEl.onerror = null;
    videoEl.pause();
    videoEl.currentTime = 0;
    videoEl.removeAttribute('src');
    try { videoEl.load(); } catch (e) {}
  }
  const imgEl = document.getElementById('playerImage');
  if (imgEl) {
    imgEl.removeAttribute('src');
  }
  closeModal('storyPlayerModal');
}

// ==========================================
// Download All Stories (.ZIP)
// ==========================================

async function downloadAllStoriesZip() {
  if (!currentStories || currentStories.length === 0) return;

  showToast(`${currentStories.length} adet hikaye zip paketine hazırlanıyor... Lütfen bekleyin.`, 'info');

  try {
    const res = await fetch('/api/download_all_zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentProfile.username,
        items: currentStories
      })
    });

    if (!res.ok) throw new Error('Zip paketi oluşturulamadı');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProfile.username}_stories_pack.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Tüm hikayeler başarıyla indirildi!', 'success');
  } catch (err) {
    showToast('Zip indirme hatası: ' + err.message, 'error');
  }
}

// ==========================================
// Tab Switcher
// ==========================================

function switchTab(tab) {
  activeTab = tab;
  const storiesTab = document.getElementById('storiesTabContent');
  const postsTab = document.getElementById('postsTabContent');
  const profilePicTab = document.getElementById('profilePicTabContent');
  const btnStories = document.getElementById('tabStoriesBtn');
  const btnPosts = document.getElementById('tabPostsBtn');
  const btnProfilePic = document.getElementById('tabProfilePicBtn');

  if (storiesTab) storiesTab.style.display = tab === 'stories' ? 'block' : 'none';
  if (postsTab) postsTab.style.display = tab === 'posts' ? 'block' : 'none';
  if (profilePicTab) profilePicTab.style.display = tab === 'profilepic' ? 'block' : 'none';

  if (btnStories) btnStories.classList.toggle('active', tab === 'stories');
  if (btnPosts) btnPosts.classList.toggle('active', tab === 'posts');
  if (btnProfilePic) btnProfilePic.classList.toggle('active', tab === 'profilepic');
}

// ==========================================
// History & Favorites UI
// ==========================================

function renderFavorites(favorites) {
  currentFavorites = favorites || [];
  const bar = document.getElementById('favoritesBar');
  const badge = document.getElementById('favoritesCountBadge');
  const container = document.getElementById('favoritesItems');
  if (!bar || !container) return;

  if (!favorites || favorites.length === 0) {
    bar.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  bar.style.display = 'flex';
  if (badge) badge.innerText = favorites.length;
  container.innerHTML = '';

  favorites.forEach(fav => {
    const chip = document.createElement('div');
    chip.className = 'favorite-chip';
    chip.title = `@${fav.username} profilini görüntüle`;
    chip.onclick = () => quickSearch(fav.username);

    const avatarUrl = fav.profile_pic ? `/api/proxy?url=${encodeURIComponent(fav.profile_pic)}` : '/img/default_avatar.svg';

    chip.innerHTML = `
      <img src="${avatarUrl}" class="favorite-chip-avatar" alt="${fav.username}" onerror="this.onerror=null;this.src='/img/default_avatar.svg';">
      <span>@${fav.username}</span>
      <button class="favorite-chip-remove" onclick="removeFavorite('${fav.username}', event)" title="Favorilerden çıkar">&times;</button>
    `;

    container.appendChild(chip);
  });
}

async function removeFavorite(username, event) {
  if (event) event.stopPropagation();
  try {
    const res = await fetch('/api/favorite/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username })
    });
    const data = await res.json();
    loadConfig();
    if (currentProfile && currentProfile.username.toLowerCase() === username.toLowerCase()) {
      const btn = document.getElementById('favToggleBtn');
      if (btn) btn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Favorilere Ekle';
    }
    showToast(`@${username} favorilerden çıkarıldı.`, 'info');
  } catch (err) {
    showToast('Favori kaldırılamadı: ' + err.message, 'error');
  }
}

function renderHistory(history) {
  const bar = document.getElementById('historyBar');
  const container = document.getElementById('historyItems');
  if (!history || history.length === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }

  if (bar) bar.style.display = 'flex';
  if (container) {
    container.innerHTML = '';
    history.slice(0, 8).forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'quick-tag';
      chip.innerText = '@' + item.username;
      chip.onclick = () => quickSearch(item.username);
      container.appendChild(chip);
    });
  }
}

async function clearSearchHistory() {
  try {
    const res = await fetch('/api/history/clear', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const bar = document.getElementById('historyBar');
      const container = document.getElementById('historyItems');
      if (bar) bar.style.display = 'none';
      if (container) container.innerHTML = '';
      showToast('Son aramalar temizlendi.', 'info');
    }
  } catch (err) {
    showToast('Geçmiş temizlenemedi: ' + err.message, 'error');
  }
}

async function toggleFavoriteCurrent() {
  if (!currentProfile) return;
  try {
    const res = await fetch('/api/favorite/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentProfile.username,
        full_name: currentProfile.full_name,
        profile_pic: currentProfile.profile_pic_url
      })
    });
    const data = await res.json();
    const btn = document.getElementById('favToggleBtn');
    if (data.is_favorite) {
      btn.innerHTML = '<i class="fa-solid fa-bookmark" style="color: var(--accent-pink);"></i> Favoride';
      showToast(`@${currentProfile.username} favorilere eklendi.`, 'success');
    } else {
      btn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Favorilere Ekle';
      showToast(`@${currentProfile.username} favorilerden çıkarıldı.`, 'info');
    }
    loadConfig();
  } catch (err) {
    showToast('Favori işlemi hatası', 'error');
  }
}

// ==========================================
// Posts Feed Fetching & Rendering
// ==========================================

async function fetchPosts(username, userId, maxId = null) {
  // Defensive swap if numeric userId was inadvertently passed as username
  if (typeof username === 'string' && /^\d+$/.test(username) && typeof userId === 'string' && !/^\d+$/.test(userId) && userId.length > 0) {
    const temp = username;
    username = userId;
    userId = temp;
  }

  const grid = document.getElementById('postsGrid');
  const empty = document.getElementById('postsEmpty');
  const badge = document.getElementById('postsCountBadge');
  const subtext = document.getElementById('postsSubtext');
  const loadMoreBtn = document.getElementById('postsLoadMoreBtn');
  const paginationContainer = document.getElementById('postsLoadMoreContainer');
  const postsActions = document.getElementById('postsActions');
  if (!grid || !empty) return;

  if (!maxId) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">Gönderiler yükleniyor...</p></div>';
    empty.style.display = 'none';
    if (paginationContainer) paginationContainer.style.display = 'none';
    if (postsActions) postsActions.style.display = 'none';
    currentPosts = [];
    postsNextMaxId = null;
    postsHasNextPage = false;
  } else {
    isFetchingMorePosts = true;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gönderiler Yükleniyor...';
    }
  }

  try {
    let url = `/api/posts?username=${encodeURIComponent(username)}&user_id=${encodeURIComponent(userId || '')}`;
    if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

    const data = await safeFetchJson(url);

    if (!maxId && (!data.success || !data.posts || data.posts.length === 0)) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      if (badge) badge.innerText = '0';
      if (subtext) subtext.innerText = '';
      if (paginationContainer) paginationContainer.style.display = 'none';
      if (postsActions) postsActions.style.display = 'none';
      return;
    }

    const fetchedPosts = data.posts || [];
    if (!maxId) {
      currentPosts = fetchedPosts;
      empty.style.display = 'none';
      renderPostsGrid(currentPosts);
    } else {
      const startIndex = currentPosts.length;
      currentPosts = currentPosts.concat(fetchedPosts);
      appendPostsToGrid(fetchedPosts, startIndex);
    }

    if (postsActions) {
      postsActions.style.display = (currentPosts && currentPosts.length > 0) ? 'flex' : 'none';
    }

    const totalCount = currentProfile && currentProfile.posts_count ? currentProfile.posts_count : currentPosts.length;
    if (badge) badge.innerText = currentPosts.length;
    if (subtext) subtext.innerText = totalCount ? `(${currentPosts.length} / ${formatNumber(totalCount)} gönderi)` : `(${currentPosts.length} gönderi)`;

    postsNextMaxId = data.next_max_id || data.end_cursor || null;
    postsHasNextPage = Boolean(data.has_next_page);

    updatePostsPaginationUI(data.has_session, totalCount);

  } catch (err) {
    if (!maxId) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      empty.querySelector('.empty-title').innerText = 'Bağlantı Hatası';
      empty.querySelector('.empty-desc').innerText = err.message;
      if (paginationContainer) paginationContainer.style.display = 'none';
      if (postsActions) postsActions.style.display = 'none';
    } else {
      showToast('Daha fazla gönderi yüklenemedi: ' + err.message, 'error');
    }
  } finally {
    isFetchingMorePosts = false;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = false;
      loadMoreBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Daha Fazla Gönderi Yükle';
    }
  }
}

function updatePostsPaginationUI(hasSession, totalCount) {
  const container = document.getElementById('postsLoadMoreContainer');
  const stats = document.getElementById('postsLoadedStats');
  const loadMoreBtn = document.getElementById('postsLoadMoreBtn');
  const anonNotice = document.getElementById('postsAnonymousNotice');
  const remSpan = document.getElementById('postsRemainingCount');
  if (!container) return;

  if (!currentPosts || currentPosts.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  if (stats) {
    stats.innerText = `${currentPosts.length} / ${formatNumber(totalCount || currentPosts.length)} gönderi görüntülendi`;
  }

  if (hasSession && postsHasNextPage) {
    if (loadMoreBtn) loadMoreBtn.style.display = 'inline-flex';
    if (anonNotice) anonNotice.style.display = 'none';
    setupPostsInfiniteScroll();
  } else if (!hasSession && postsHasNextPage) {
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (anonNotice) {
      anonNotice.style.display = 'block';
      if (remSpan) {
        const remaining = totalCount > currentPosts.length ? (totalCount - currentPosts.length) : null;
        remSpan.innerText = remaining ? `${formatNumber(remaining)} gönderi` : 'tüm gönderiler';
      }
    }
  } else {
    // All available posts loaded
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (anonNotice) anonNotice.style.display = 'none';
  }
}

let postsInfiniteObserver = null;
function setupPostsInfiniteScroll() {
  const container = document.getElementById('postsLoadMoreContainer');
  if (!container || postsInfiniteObserver) return;
  if (!('IntersectionObserver' in window)) return;

  postsInfiniteObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting && !isFetchingMorePosts && postsHasNextPage && postsNextMaxId) {
      loadMorePosts();
    }
  }, { rootMargin: '250px' });
  postsInfiniteObserver.observe(container);
}

async function loadMorePosts() {
  if (!currentProfile || !postsNextMaxId || isFetchingMorePosts) return;
  await fetchPosts(currentProfile.username, currentProfile.id, postsNextMaxId);
}

function createPostCardElement(post, idx) {
  const card = document.createElement('div');
  card.className = 'post-card';

  const isVideo = Boolean(post.is_video);
  const isCarousel = Boolean(post.is_carousel);
  
  const thumbUrl = post.display_url || post.download_url;
  const proxyThumb = thumbUrl ? `/api/proxy?url=${encodeURIComponent(thumbUrl)}` : '/img/default_avatar.svg';
  
  let mediaMarkup = '';
  if (isVideo && post.video_url && !post.display_url) {
    const vidSrc = `/api/proxy?url=${encodeURIComponent(post.video_url)}`;
    mediaMarkup = `<video src="${vidSrc}#t=0.1" preload="metadata" muted playsinline></video>`;
  } else {
    mediaMarkup = `<img src="${proxyThumb}" alt="Post ${idx + 1}" loading="lazy">`;
  }

  const badgeMarkup = isCarousel ? 
    `<span class="post-badge-top"><i class="fa-solid fa-layer-group"></i> ${post.carousel_count || ''}</span>` : 
    (isVideo ? `<span class="post-badge-top"><i class="fa-solid fa-video"></i> Video</span>` : '');

  const pinnedMarkup = post.is_pinned ? 
    `<span class="post-badge-pinned"><i class="fa-solid fa-thumbtack"></i> Sabitlendi</span>` : '';

  const dlTarget = (isVideo && post.video_url) ? post.video_url : (post.display_url || post.download_url);
  const dlFilename = extractInstagramFilename(dlTarget, `${currentProfile.username}_post_${idx + 1}.${(isVideo && post.video_url) ? 'mp4' : 'jpg'}`);
  const dlUrl = `/api/download?url=${encodeURIComponent(dlTarget)}&filename=${encodeURIComponent(dlFilename)}`;

  card.innerHTML = `
    <div class="post-media-box" onclick="openPostModal(${idx})">
      ${pinnedMarkup}
      ${badgeMarkup}
      ${mediaMarkup}
    </div>

    <div class="post-card-body">
      <div class="post-stats-row">
        <span class="post-stat-pill"><i class="fa-regular fa-heart" style="color: var(--accent-pink);"></i> ${formatNumber(post.likes)}</span>
        <span class="post-stat-pill"><i class="fa-regular fa-comment"></i> ${formatNumber(post.comments)}</span>
        <span style="font-size: 11px; color: var(--text-muted);">${post.time_ago || ''}</span>
      </div>
      <p class="post-caption-snippet" title="${escapeHtml(post.caption || '')}">${post.caption ? escapeHtml(post.caption) : '<em style="color: var(--text-muted);">Açıklama yok</em>'}</p>
    </div>

    <div class="post-card-footer">
      <button class="btn btn-secondary" style="padding: 5px 12px; font-size: 11px;" onclick="openPostModal(${idx})">
        <i class="fa-solid fa-eye"></i> İncele
      </button>
      <a href="${dlUrl}" class="btn btn-primary" style="padding: 5px 12px; font-size: 11px;" download>
        <i class="fa-solid fa-download"></i> İndir
      </a>
    </div>
  `;

  const imgEl = card.querySelector('img');
  if (imgEl) {
    imgEl.onerror = function() {
      this.onerror = null;
      if (thumbUrl && thumbUrl.startsWith('http')) this.src = thumbUrl;
    };
  }

  return card;
}

function renderPostsGrid(posts) {
  const grid = document.getElementById('postsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  posts.forEach((post, idx) => {
    grid.appendChild(createPostCardElement(post, idx));
  });
}

function appendPostsToGrid(newPosts, startIndex) {
  const grid = document.getElementById('postsGrid');
  if (!grid) return;
  newPosts.forEach((post, i) => {
    grid.appendChild(createPostCardElement(post, startIndex + i));
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openPostModal(idx) {
  if (!currentPosts || !currentPosts[idx]) return;
  activePostModalIndex = idx;
  activePostCarouselIndex = 0;
  renderPostModalContent();
  openModal('postPreviewModal');
}

function renderPostModalContent() {
  const post = currentPosts[activePostModalIndex];
  if (!post) return;

  const modalImg = document.getElementById('postModalImg');
  const modalVideo = document.getElementById('postModalVideo');
  const prevBtn = document.getElementById('carouselPrevBtn');
  const nextBtn = document.getElementById('carouselNextBtn');
  const counter = document.getElementById('carouselCounter');
  const dlBtn = document.getElementById('postDownloadBtn');

  document.getElementById('postLikes').innerHTML = `<i class="fa-regular fa-heart" style="color: var(--accent-pink);"></i> ${formatNumber(post.likes)} beğeni`;
  document.getElementById('postComments').innerHTML = `<i class="fa-regular fa-comment"></i> ${formatNumber(post.comments)} yorum`;
  document.getElementById('postDate').innerHTML = `<i class="fa-regular fa-clock"></i> ${post.time_ago || ''}`;
  document.getElementById('postCaptionText').innerText = post.caption || 'Açıklama bulunmuyor.';
  
  const origLink = document.getElementById('postOriginalLink');
  if (origLink) origLink.href = post.permalink || `https://www.instagram.com/${currentProfile.username}/`;

  let currentMedia = null;
  if (post.is_carousel && post.carousel_media && post.carousel_media.length > 0) {
    const items = post.carousel_media;
    currentMedia = items[activePostCarouselIndex] || items[0];
    if (prevBtn) prevBtn.style.display = items.length > 1 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = items.length > 1 ? 'flex' : 'none';
    if (counter) {
      counter.style.display = 'block';
      counter.innerText = `${activePostCarouselIndex + 1} / ${items.length}`;
    }
  } else {
    currentMedia = post;
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (counter) counter.style.display = 'none';
  }

  const hasRealVideo = Boolean(currentMedia.video_url);
  const isVideo = Boolean(currentMedia.is_video) && hasRealVideo;
  const mediaUrl = isVideo ? currentMedia.video_url : (currentMedia.display_url || currentMedia.download_url);
  const proxyUrl = mediaUrl ? `/api/proxy?url=${encodeURIComponent(mediaUrl)}` : '';
  const dlFilename = extractInstagramFilename(mediaUrl, `${currentProfile.username}_post_${activePostModalIndex + 1}_${activePostCarouselIndex + 1}.${isVideo ? 'mp4' : 'jpg'}`);
  const dlUrl = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(dlFilename)}`;

  if (isVideo) {
    if (modalImg) {
      modalImg.style.display = 'none';
      modalImg.removeAttribute('src');
    }
    if (modalVideo) {
      modalVideo.style.display = 'block';
      modalVideo.src = proxyUrl;
      modalVideo.load();
    }
  } else {
    if (modalVideo) {
      modalVideo.pause();
      modalVideo.onloadedmetadata = null;
      modalVideo.currentTime = 0;
      modalVideo.removeAttribute('src');
      try { modalVideo.load(); } catch (e) {}
      modalVideo.style.display = 'none';
    }
    if (modalImg) {
      modalImg.style.display = 'block';
      modalImg.src = proxyUrl;
    }
  }

  if (dlBtn) {
    dlBtn.href = dlUrl;
    dlBtn.download = dlFilename;
  }
}

function carouselSlide(direction) {
  const post = currentPosts[activePostModalIndex];
  if (!post || !post.is_carousel || !post.carousel_media) return;
  const count = post.carousel_media.length;
  activePostCarouselIndex = (activePostCarouselIndex + direction + count) % count;
  renderPostModalContent();
}

// ==========================================
// Download All Posts (.ZIP) Modal & Execution
// ==========================================

function openDownloadAllPostsModal() {
  if (!clientConfig || !clientConfig.has_session) {
    showToast('Tüm gönderileri indirebilmek için lütfen önce Instagram oturumunuzu açın.', 'warning');
    openLoginModal();
    return;
  }

  if (!currentProfile) {
    showToast('Lütfen önce bir profil görüntüleyin.', 'info');
    return;
  }

  if (!currentPosts || currentPosts.length === 0) {
    showToast('İndirilecek herhangi bir gönderi bulunamadı.', 'info');
    return;
  }

  const unameEl = document.getElementById('dlPostsUsername');
  const totalEl = document.getElementById('dlPostsTotalCount');
  const loadedEl = document.getElementById('dlPostsLoadedCount');

  const total = currentProfile.posts_count || currentPosts.length;
  if (unameEl) unameEl.innerText = '@' + currentProfile.username;
  if (totalEl) totalEl.innerText = formatNumber(total) + ' gönderi';
  if (loadedEl) loadedEl.innerText = currentPosts.length + ' gönderi';

  const setupView = document.getElementById('downloadPostsSetupView');
  const progressView = document.getElementById('downloadPostsProgressView');
  if (setupView) setupView.style.display = 'block';
  if (progressView) progressView.style.display = 'none';

  dlPostsCancelled = false;
  openModal('downloadAllPostsModal');
}

function closeDownloadAllPostsModal() {
  dlPostsCancelled = true;
  closeModal('downloadAllPostsModal');
}

function cancelDownloadAllPosts() {
  dlPostsCancelled = true;
  closeModal('downloadAllPostsModal');
  showToast('Gönderi indirme işlemi iptal edildi.', 'info');
}

function updateDlProgress(title, subtitle, percent) {
  const tEl = document.getElementById('dlPostsProgressTitle');
  const sEl = document.getElementById('dlPostsProgressSubtitle');
  const bEl = document.getElementById('dlPostsProgressBar');
  const pEl = document.getElementById('dlPostsProgressPercent');

  if (tEl && title) tEl.innerText = title;
  if (sEl && subtitle) sEl.innerText = subtitle;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (bEl) bEl.style.width = `${clamped}%`;
  if (pEl) pEl.innerText = `%${clamped}`;
}

async function executeDownloadAllPosts() {
  if (!currentProfile) return;

  const scopeRadio = document.querySelector('input[name="dlPostsScope"]:checked');
  const scope = scopeRadio ? scopeRadio.value : 'all';

  const setupView = document.getElementById('downloadPostsSetupView');
  const progressView = document.getElementById('downloadPostsProgressView');
  if (setupView) setupView.style.display = 'none';
  if (progressView) progressView.style.display = 'block';

  dlPostsCancelled = false;
  updateDlProgress('Gönderiler Hazırlanıyor...', 'Gönderi listesi kontrol ediliyor...', 5);

  let allCollectedPosts = [...currentPosts];

  try {
    if (scope === 'all') {
      let curMaxId = postsNextMaxId;
      let hasMore = postsHasNextPage;
      const totalExpected = (currentProfile && currentProfile.posts_count) ? currentProfile.posts_count : (allCollectedPosts.length || 1);

      // If initial posts were empty, try fetching page 1
      if (allCollectedPosts.length === 0) {
        updateDlProgress('Gönderiler Taranıyor...', 'İlk sayfa yükleniyor...', 10);
        const p1Data = await safeFetchJson(`/api/posts?username=${encodeURIComponent(currentProfile.username)}&user_id=${encodeURIComponent(currentProfile.id || '')}`);
        if (p1Data && p1Data.success && p1Data.posts) {
          allCollectedPosts = p1Data.posts;
          curMaxId = p1Data.next_max_id || p1Data.end_cursor || null;
          hasMore = Boolean(p1Data.has_next_page);
        }
      }

      let pageCount = 1;
      while (hasMore && curMaxId && !dlPostsCancelled) {
        pageCount++;
        const pct = Math.min(45, 10 + Math.round((allCollectedPosts.length / Math.max(1, totalExpected)) * 35));
        updateDlProgress(
          'Gönderiler Taranıyor...',
          `Sayfa ${pageCount}: ${allCollectedPosts.length} / ${formatNumber(totalExpected)} gönderi toplandı...`,
          pct
        );

        await new Promise(r => setTimeout(r, 200));
        if (dlPostsCancelled) return;

        try {
          const pData = await safeFetchJson(`/api/posts?username=${encodeURIComponent(currentProfile.username)}&user_id=${encodeURIComponent(currentProfile.id || '')}&max_id=${encodeURIComponent(curMaxId)}`);
          if (!pData || !pData.success || !pData.posts || pData.posts.length === 0) break;

          allCollectedPosts = allCollectedPosts.concat(pData.posts);
          curMaxId = pData.next_max_id || pData.end_cursor || null;
          hasMore = Boolean(pData.has_next_page);
        } catch (err) {
          console.error('Gönderi sayfası getirme hatası:', err);
          break;
        }
      }
    }

    if (dlPostsCancelled) return;

    updateDlProgress('Medyalar Ayrıştırılıyor...', 'Fotoğraf, video ve çoklu albüm (carousel) slaytları çıkarılıyor...', 50);

    const mediaItems = [];
    allCollectedPosts.forEach((post, pIdx) => {
      if (post.is_carousel && Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
        post.carousel_media.forEach((item, cIdx) => {
          const isVid = Boolean(item.is_video) && Boolean(item.video_url);
          const dlUrl = isVid ? item.video_url : (item.download_url || item.display_url);
          if (dlUrl) {
            mediaItems.push({
              download_url: dlUrl,
              url: dlUrl,
              is_video: isVid,
              caption: post.caption || '',
              index: `${pIdx + 1}_${cIdx + 1}`
            });
          }
        });
      } else {
        const isVid = Boolean(post.is_video) && Boolean(post.video_url);
        const dlUrl = isVid ? post.video_url : (post.download_url || post.display_url);
        if (dlUrl) {
          mediaItems.push({
            download_url: dlUrl,
            url: dlUrl,
            is_video: isVid,
            caption: post.caption || '',
            index: `${pIdx + 1}`
          });
        }
      }
    });

    if (mediaItems.length === 0) {
      showToast('İndirilecek medya dosyası bulunamadı.', 'warning');
      closeModal('downloadAllPostsModal');
      return;
    }

    if (dlPostsCancelled) return;

    updateDlProgress(
      'ZIP Paketi Hazırlanıyor...',
      `${mediaItems.length} adet medya dosyası sunucuda paralel indiriliyor ve sıkıştırılıyor...`,
      70
    );

    const zipRes = await fetch('/api/download_all_zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentProfile.username,
        zip_type: 'posts',
        items: mediaItems
      })
    });

    if (dlPostsCancelled) return;

    if (!zipRes.ok) {
      let errTxt = 'Zip paketi oluşturulamadı';
      try {
        const errJson = await zipRes.json();
        if (errJson && errJson.error) errTxt = errJson.error;
      } catch (e) {}
      throw new Error(errTxt);
    }

    updateDlProgress('İndirme Başlatılıyor...', 'ZIP tarayıcınıza aktarılıyor...', 95);

    const blob = await zipRes.blob();
    if (dlPostsCancelled) return;

    const dlBlobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlBlobUrl;
    a.download = `${currentProfile.username}_posts_pack.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(dlBlobUrl);
    document.body.removeChild(a);

    updateDlProgress('Tamamlandı!', `${mediaItems.length} medya başarıyla ZIP olarak indirildi.`, 100);
    setTimeout(() => {
      closeModal('downloadAllPostsModal');
      showToast(`🎉 ${mediaItems.length} adet gönderi medyası ZIP olarak indirildi!`, 'success');
    }, 1200);

  } catch (err) {
    if (!dlPostsCancelled) {
      showToast('Gönderiler indirilirken hata oluştu: ' + err.message, 'error');
      if (setupView) setupView.style.display = 'block';
      if (progressView) progressView.style.display = 'none';
    }
  }
}

// ==========================================
// Modal Helpers & Toasts
// ==========================================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');

    // Immediately stop, detach, and unload all video and audio playback inside this modal
    el.querySelectorAll('video, audio').forEach(media => {
      try {
        media.pause();
        media.onloadedmetadata = null;
        media.ontimeupdate = null;
        media.onended = null;
        media.onerror = null;
        media.currentTime = 0;
        media.removeAttribute('src');
        media.load();
      } catch (err) {}
    });
  }

  if (id === 'hdProfileModal') {
    resetProfilePicZoom();
    if (isHdFullscreen) {
      isHdFullscreen = false;
      const modal = document.getElementById('hdProfileModal');
      if (modal) modal.classList.remove('is-fullscreen');
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (err) {}
    }
  }
  if (id === 'storyPlayerModal') {
    clearTimeout(playerTimer);
    clearInterval(playerProgressInterval);
    isPlayerPaused = false;
  }
  if (id === 'postPreviewModal') {
    activePostCarouselIndex = 0;
  }
}

// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal.id === 'storyPlayerModal') closeStoryPlayer();
      else if (modal.id === 'downloadAllPostsModal') closeDownloadAllPostsModal();
      else closeModal(modal.id);
    }
  });
});

// Close on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(modal => {
      if (modal.id === 'storyPlayerModal') closeStoryPlayer();
      else if (modal.id === 'downloadAllPostsModal') closeDownloadAllPostsModal();
      else closeModal(modal.id);
    });
  }
});

function showToast(message, type = 'info') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '9999';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '13.5px';
    toast.style.fontWeight = '600';
    toast.style.color = '#fff';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.appendChild(toast);
  }

  if (type === 'success') {
    toast.style.background = '#059669';
  } else if (type === 'error') {
    toast.style.background = '#dc2626';
  } else if (type === 'warning') {
    toast.style.background = '#d97706';
  } else {
    toast.style.background = '#2563eb';
  }

  toast.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-right: 8px;"></i> ${message}`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 4000);
}

function formatNumber(num) {
  if (num === null || num === undefined || num === '') return '0';
  if (typeof num === 'string') {
    const s = num.trim();
    if (/[kmb]/i.test(s)) return s.toUpperCase();
    const clean = s.replace(/,/g, '');
    const parsed = Number(clean);
    if (!isNaN(parsed)) num = parsed;
    else return s;
  }
  if (typeof num === 'number') {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 10_000) return (num / 1_000).toFixed(0) + 'K';
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString('tr-TR');
  }
  return String(num);
}
