# FLICK — 3D Aim Trainer

Tarayıcıda çalışan, Three.js ile yazılmış, CS tarzı hassasiyet ayarlarına ve yerleşik hile korumasına (Sentinel) sahip bir aim trainer.

**Oyna:** https://furkycl.github.io/aim/

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # tüm modüllerin parse kontrolü + Sentinel bağlı mı
npm run build    # dist/
```

`main` dalına her push, GitHub Actions ile otomatik olarak GitHub Pages'e deploy eder.
