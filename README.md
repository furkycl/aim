# FLICK — 3D Aim Trainer

Tarayıcıda çalışan, Three.js ile yazılmış, CS tarzı hassasiyet ayarlarına ve yerleşik hile korumasına (**Sentinel**) sahip bir aim trainer.

**Oyna:** https://furkycl.github.io/aim/

## Modlar

| Mod | Açıklama |
| --- | --- |
| **GRIDSHOT** | Duvarda aynı anda 3 hedef; vurdukça yenisi gelir. Hız + doğruluk. |
| **FLICK** | Tek hedef, geniş açı. Tepki süren ölçülür, hızlı vuruş bonus verir. |
| **TRACKING** | Hareket eden hedefin üstünde kal; basılı tutarken puan akar. |
| **PRECISION** | Küçük hedefler zamanla büzüşür; küçükken vurmak daha çok puan. |
| **SPIDER** | Merkez → rastgele → merkez. Flick + geri dönüş disiplini. |

Her koşu 60 saniye. Seri (streak) çarpanı, S–F notu, mod başına en iyi skor.

## Ayarlar

- **Fare:** CS2 ölçeğinde hassasiyet (`yaw = sens × 0.022°/count`), DPI, canlı eDPI / cm-360 / in-360 okuması, yakınlaştırma hassasiyeti (sağ tık), dikey tersleme, ham giriş (`unadjustedMovement`).
- **Crosshair:** stil (+, nokta, +•, çember, T), boyut, kalınlık, boşluk, renk, dış hat, opaklık, hazır presetler.
- **Görüntü:** FOV (4:3 yatay referans, Source dönüşümü), bloom, parçacıklar, kamera sarsıntısı, render ölçeği, FPS göstergesi.
- **Ses:** ana/efekt sesi, vuruş sesi, ambiyans. Tüm sesler WebAudio ile sentezlenir, dosya yoktur.

Ayarlar `localStorage`'a otomatik kaydedilir.

## Sentinel — hile koruması

Oyun tamamen istemci tarafında çalıştığı için amaç, **tarayıcı konsolundan, userscript'ten veya otomasyon aracından yapılan müdahaleleri yakalamak ve o koşuyu geçersiz kılmaktır**. Katmanlar:

1. **Güvenilir giriş kapısı** — yalnızca donanım kaynaklı (`isTrusted === true`) fare/klavye olayları işlenir. `dispatchEvent(new MouseEvent(...))` ile üretilen her olay reddedilir ve koşu anında durdurulur. `isTrusted`, `movementX/Y` gibi değerler yükleme anında yakalanan orijinal getter'lar üzerinden okunur; prototip veya örnek üzerinde ezilmiş getter'lar tespit edilir.
2. **Giriş forensiği** — fare akışı istatistiksel olarak analiz edilir:
   - hedef merkezine göre isabet hatası dağılımı (*perfect-aim*),
   - tek bir olayda tüm flick'i taşıyan "ışınlanma" hareketleri (*snap-aim*),
   - hedefe yavaşlamadan yaklaşım (*no-deceleration*),
   - insan dışı tepki süreleri (*inhuman-reaction*),
   - metronomik tıklama kadansı ve imkânsız tıklama hızı (*autoclicker*, *click-rate*),
   - kuantize / eksen kilitli / metronomik hareket,
   - kusursuz tracking oranı.
3. **Ortam bütünlüğü** — `requestAnimationFrame`, `performance.now`, `Date.now`, `Math.random`, `addEventListener`, `dispatchEvent`, `MouseEvent`, `requestPointerLock`, `Function.prototype.toString`, `Object.defineProperty` ve kritik getter'lar, temiz bir `about:blank` realm'inin `toString`'i ile doğrulanır. DOM'a sonradan eklenen `script`/`iframe`, yabancı kaynaklı scriptler, userscript yöneticisi izleri (`GM_*`, `unsafeWindow`), `navigator.webdriver`, devtools (`debugger` duraklaması + pencere farkı) ve saat sapması izlenir. `__THREE_DEVTOOLS__` sabitlenir; sahne grafiği dışarıdan okunamaz.
4. **Koşu defteri** — duvar saati süresi, kare temposu ve vuruş sayacı oyunun kendi sayaçlarıyla çapraz kontrol edilir (speedhack / yapay rAF sürüşü).
5. **İmzalı kayıtlar** — her skor, kurulum başına üretilen gizli anahtarla HMAC-SHA256 (SubtleCrypto) imzalanır. `localStorage`'daki kaydı elle değiştiren biri imzayı bozar; kayıt "İMZA BOZUK" olarak işaretlenir ve en iyi skor sayılmaz.

Sonuç: **DOĞRULANDI** (temiz), **DOĞRULANAMADI** (uyarı var, kaydedilir ama şüpheli) veya **GEÇERSİZ** (kaydedilmez).

> Not: İstemci tarafı bir oyunda %100 hile önlemek mümkün değildir; kaynak koda erişen kararlı biri her zaman bir yol bulabilir. Sentinel'in hedefi, konsol/userscript/otomasyon tabanlı hilelerin tamamını yakalamak ve kalan yolları ekonomik olarak anlamsız kılmaktır. Sunucu tarafı doğrulama (replay + seed) için altyapı hazırdır: her koşu seed'li RNG ile üretilir.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173/aim/
npm run check    # tüm modüllerin parse kontrolü, Sentinel bağlı mı, dist'te dev handle yok mu
npm run build    # dist/
```

Geliştirme modunda `window.__flick` test tutamacı açıktır; üretim derlemesinde tamamen kaldırılır (`npm run check` bunu doğrular).

## Dağıtım

- PR'lar `CI` workflow'unda `check` + `build` çalıştırır.
- `main` dalına her merge, `Deploy to GitHub Pages` workflow'u ile otomatik yayınlanır.

## Yapı

```
src/
  anticheat/   preload (orijinal API yakalama), sentinel, forensics, integrity, signer
  audio/       WebAudio ile sentezlenen efektler
  config/      ayar deposu (CS2 ölçeği), mod tanımları
  core/        giriş (pointer lock), hedef yöneticisi, oyun döngüsü
  data/        imzalı yerel skor tablosu
  render/      sahne/arena, post-processing, parçacık efektleri
  ui/          menü, HUD, ayarlar paneli, crosshair çizici
```

## Lisans

MIT
