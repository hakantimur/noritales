# noritales
AI Tales for kids 

## NoriTales Local Studio — Windows desktop POC

Anne/baba bilgileri, referans fotoğrafları ve izinli yetişkin sesiyle resimli/sesli masal üretimini denemek için Electron masaüstü uygulaması. Stitch NoriTales Luminary renk ve atmosferi temel alınmıştır; bu sürüm mobil tasarımın birebir kopyası değildir.

### Windows'ta başlatma

1. [Node.js](https://nodejs.org) 22.12 veya üstünü kurun (LTS).
2. Bu repoyu indirin: **Code → Download ZIP**, ZIP'i bir klasöre çıkarın. Alternatif: `git clone https://github.com/hakantimur/noritales.git`.
3. Çıkardığınız klasörde **BASLAT.cmd** dosyasına çift tıklayın. İlk çalıştırmada bağımlılıklar indirilir, sonraki çalıştırmada masaüstü penceresi açılır.
4. **API & modeller** ekranında kendi OpenRouter anahtarınızı girip kaydedin. **Canlı model listesini getir** ile modelleri seçin; seçimleri yeniden kaydedin.
5. Yeni masal formunu doldurun, fotoğrafları ve sesi yükleyin. Fotoğraf sırasını karakter açıklamasında eşleştirin (Fotoğraf 1: çocuk, Fotoğraf 2: baba gibi).
6. Önce metni oluşturun. Kitap ekranında **bir sayfanın resmini ve sesini** deneyin; sonuç uygunsa eksik tüm sayfaları üretin.

Terminal alternatifi:

```sh
npm ci
npm start
```

### Kapsam ve net varsayımlar

- 20–30 toplam sayfa; her sayfa resim + kısa metin. **Kitabın toplamı 300–500 kelime**, sayfa başına değil. Ek kapak sayfası yok. Varsayılan 24 sayfa.
- Yaş (1,5–10), dil, karakter, tema, günlük olay, tür, anlatım ve resim tarzı girilebilir.
- Animasyon filmi tarzında **sabit resimler**; video/animasyon üretimi bu POC'de yok.
- Ses yükleme var; uygulama içi mikrofon kaydı yok. Windows Ses Kaydedicisiyle alınan kaydı desteklenen WAV/MP3 formatına aktarabilirsiniz.
- Ebeveyn sesi `input_references` ile TTS isteğine gönderilir; genel hazır sese sessiz geçiş yapılmaz. Sağlayıcı/model klonlama ve Türkçe desteği şarttır.
- Fotoğraflar her sayfa isteğinde aynı karakter rehberiyle gönderilir. Benzerlik garantisi yok; kullanıcı gözle değerlendirmelidir.
- Sayfa metni/sahnesi düzenlenebilir. Değişiklik ilgili eski medyayı geçersiz kılar, fiziksel dosyalar korunur.
- Her başarılı sayfa diske yazılır. Toplu üretim hata alınca durur; tekrar başlatmak sadece eksik sayfaları üretir. Otomatik ücretli retry yok.
- Üretim sürerken düzenleme kapalıdır. Uygulamayı normal kapatma engellenir; zorla kapatmak devam eden sayfa çıktısını kaybettirebilir, ücret oluşabilir.
- Kitaplık, sayfa bazlı ses oynatıcı, isteğe bağlı otomatik sayfa geçişi ve manuel değerlendirme paneli.
- Dışa aktarım: resim ve sayfa sesleri gömülü tek çevrimdışı HTML. Tarayıcıda Yazdır → PDF olarak kaydet ile resimli PDF. Sayfa MP3'leri kitap klasöründedir; **tek birleştirilmiş MP3 yok**.
- Fon müziği, otomatik transkripsiyonla ses/metin karşılaştırması ve otomatik görsel benzerlik puanlaması bu sürümde yok. Arayüz bunları yapılmış gibi göstermez.

### Modeller ve maliyet

Model kimlikleri sabitlenmez: canlı listeden veya elle seçilir. Metin modeli JSON üretebilmeli; resim modeli referans girişini, TTS sağlayıcısı ses klonlamayı desteklemelidir. Liste sadece modalite filtresidir; **ses listesindeki bütün modeller klonlama desteklemez**. Sağlayıcının endpoint yeteneklerini kontrol edin. Model ve fiyatlar değişebilir. Çoklu fotoğraf sayısı ve ses formatı/süresi sağlayıcıya bağlıdır.

Resim: `POST /api/v1/images`, base64 `input_references`; ses: `POST /api/v1/audio/speech`, `input_references`, MP3; metin: `POST /api/v1/chat/completions`.

Kaynaklar (7 Eylül 2026):

- [OpenRouter resim API ve referanslar](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter TTS ve ses klonlama](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [Electron güvenliği](https://www.electronjs.org/docs/latest/tutorial/security)

**Gerçek API üretimi ve Türkçe ses benzerliği geliştirici ortamında test edilmedi; kullanıcı anahtarıyla küçük örnek testi gerekir.** HTTP hata kodları gösterilir; gizli veri içerebilecek sağlayıcı hata gövdeleri kaydedilmez. 401: anahtar, 402: bakiye, 400: model/format, 429: limit. Uygun olmayan kelime/sayfa sayısında metin kaydedilmez; yeniden deneme ücretli olabilir.

### Gizlilik ve kayıtlar

Repo herkese açıktır; buraya **anahtar, fotoğraf, ses, çocuk bilgisi veya üretilen kitap koymayın**.

- Veriler Electron `userData/books` altında, repo dışında tutulur. Kesin yolu **API & modeller** ekranında görebilirsiniz; genellikle `%APPDATA%/noritales-desktop-poc/books`.
- Kitap JSON'unda brief, metinler, karakter rehberi, model/üretim kayıtları ve değerlendirme bulunur. Referanslar ve MP3/resimler aynı kitap klasöründedir.
- Fotoğraf/ses/metinler üretim için OpenRouter ve seçilen sağlayıcılara iletilir; tamamen çevrimdışı değildir. Çocuk verisi ve yetişkin sesi için yetki/izin onayı zorunludur.
- Anahtar varsayılan olarak yalnızca bellektedir. İsteğe bağlı hatırlama Windows/macOS işletim sistemi şifrelemesini kullanır; Linux'ta güvenli saklama yoksa kalıcı anahtar yazılmaz.
- Kitaplar ve fotoğraflar yerelde şifrelenmez. Disk şifrelemesi ve kullanıcı hesabı güvenliği sizin sorumluluğunuzdadır. Dışa aktarılan HTML sesleri de içerir; paylaşırken dikkat edin.
- Uygulamanın uzak içerik yüklemesi, renderer ağ erişimi ve Node erişimi kapalıdır. Dar IPC arayüzü, sender doğrulaması, sandbox ve context isolation kullanılır.

### Test

```sh
npm test
npm run check
```

Testler kelime/sayfa sınırlarını, Unicode sayımını, JSON ayrıştırmayı, kayıt/yeniden yüklemeyi, dosya yolu kontrollerini, API payloadlarını, hata tekrarının olmamasını ve HTML kaçışını kapsar. Gerçek API faturası oluşturmazlar.

İsteğe bağlı sahte köprüyle tarayıcı UI testi: Playwright ve Chromium kurulu ortamda `node scripts/ui-smoke.cjs`. Bu test Windows/Electron entegrasyon testi yerine geçmez.

Yerel kabul testi:

1. 24 sayfa / 300–500 kelime sayacını doğrulayın.
2. Bir resimde aile fotoğrafına benzerliği, sonra birkaç sayfada kıyafet/yüz tutarlılığını değerlendirin.
3. Bir sayfayı dinleyin: ebeveyn benzerliği, Türkçe telaffuz ve tüm sözcüklerin okunması.
4. Metni değiştirin; ilgili sayfanın medyası yeniden üretim beklemeli.
5. Uygulamayı kapatıp açın; kitap, resimler, sesler ve değerlendirme geri gelmeli.
6. HTML dışa aktarımını çevrimdışı açın; sesleri ve PDF baskı önizlemesinde toplam sayfa sayısını kontrol edin.

Bu bir POC'dir: üretim ortamı çocuk güvenliği/mahremiyet incelemesi, imzalı Windows kurucusu ve canlı sağlayıcı entegrasyon testi ayrıca gereklidir.
