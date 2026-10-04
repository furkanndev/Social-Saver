# 🌟 Social Saver (v1.0) — Instagram Story & HD Profil Fotoğrafı İndirici

![Version](https://img.shields.io/badge/version-v1.0-blue.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.x-green?logo=flask)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Instagram'daki tüm **açık (public) profillerin** 24 saatlik aktif hikayelerini ve öne çıkan albümlerini **%100 anonim olarak (karşı tarafa "görüldü" gitmeden)** izleyebileceğiniz, tek tek veya topluca (.ZIP) indirebileceğiniz ve profil fotoğraflarını **Full HD (orijinal boyutta)** görüntüleyip kaydedebileceğiniz modern bir masaüstü/web uygulamasıdır.

---

## ✨ Özellikler

1. **🔒 %100 Anonim Story Görüntüleme & Kaydetme:**
   - Hikayeler doğrudan Instagram CDN sunucularından medya akışı olarak çekilir.
   - Instagram'ın "seen / görüldü" izleme servisine sinyal gönderilmez; hesap sahibi hikayesini izlediğinizi veya indirdiğinizi asla göremez.
   - Fotoğraf (.JPG) ve video (.MP4) hikayeler orijinal yüksek kalitede oynatılır ve indirilir.

2. **📸 Full HD Profil Fotoğrafı Görüntüleyici:**
   - Profil fotoğraflarını Instagram'ın sıkıştırmasına maruz kalmadan, ham en yüksek çözünürlükte (1080×1080 Full HD veya daha yüksek) açar.
   - Dahili zoom & pan modalı ile detayları yakından inceleyebilir, tek tıkla orijinal kalitede indirebilirsiniz.

3. **📦 Tüm Hikayeleri Tek Tıkla İndirme (.ZIP):**
   - Kullanıcının tüm aktif hikayelerini tek bir tıklamayla arka planda `.zip` arşivi olarak paketler ve cihazınıza indirir.

4. **🎞️ Instagram Tarzı Entegre Story Oynatıcı:**
   - Üst segmentli ilerleme çubukları (progress bars).
   - Hikayeler arasında ileri/geri geçiş, duraklatma ve ses açma/kapatma kontrolleri.

5. **⭐ Öne Çıkanlar (Highlights) Desteği:**
   - Profildeki tüm öne çıkan hikaye albümlerini kapak fotoğraflarıyla listeler.
   - Albüme tıklandığında içindeki tüm eski hikayeleri getirir ve indirme imkanı sunar.

6. **🧹 Gelişmiş Önbellek & Uygulama Sıfırlama (v1.0):**
   - Ayarlar menüsü üzerinden sunucu ve istemci tarafındaki tüm geçici medya/API önbelleklerini tek tıkla temizleme.
   - Gerçek zamanlı önbellek sayaçları ve gerektiğinde arama geçmişi ile birlikte temizleme veya fabrika ayarlarına döndürme seçeneği.

7. **⚡ Son Aramalar & Favoriler:**
   - Sık takip ettiğiniz profilleri tek tıkla tekrar açabilmeniz için yerel arama geçmişi ve favoriler listesi.

---

## 🚀 Hızlı Başlangıç

### Yöntem 1 (En Kolay — Tek Tıkla Başlatma):
Klasör içerisindeki **`start.bat`** dosyasına çift tıklayın.

### Yöntem 2 (Terminal Üzerinden):
```bash
python run.py
```
Uygulama otomatik olarak yerel sunucuyu ayağa kaldıracak ve varsayılan tarayıcınızda (Edge / Chrome) bağımsız masaüstü pencere modunda **`http://127.0.0.1:5055`** adresini açacaktır.

---

## 🔑 Otomatik Giriş (Tek Tıkla Bağlanma)

Artık hiçbir teknik ayar yapmanıza veya `F12` ile çerez kopyalamanıza gerek yok:

1. Uygulama arayüzünün sağ üstündeki **"✨ Otomatik Giriş Yap"** butonuna tıklayın.
2. Açılan resmi Instagram penceresinde hesabınıza giriş yapın (veya zaten açıksa bekleyin).
3. Giriş yaptığınız anda sistem **sessionID'yi otomatik olarak yakalar**, kaydeder ve pencereyi kendiliğinden kapatır.
4. Social Saver anında aktif hale gelir ve tüm story'leri sınırsız, reklamsız ve anonim olarak indirebilirsiniz!

> **Güvenlik Notu:** Giriş işlemi doğrudan resmi Instagram Web API'si üzerinden gerçekleşir. Şifreniz hiçbir yerde depolanmaz. Sadece oluşturulan oturum çerezi bilgisayarınızda yerel `config.json` dosyasında saklanır.
