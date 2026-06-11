# Test Senaryolari

Otomatik testler: `npm test` (16 assertion, skor motoru).

## Manuel test checklist

### Kurulum
- [ ] `ensure kingpin-ai-vehicles` + `set ai_vehicle_secret`
- [ ] Bot `.env` dolduruldu
- [ ] `npm run register-commands` calistirildi
- [ ] FiveM HTTP portu bot VPS'ten erisilebilir

### Oyuncu akisi
- [ ] `/aracal` — olmayan karakter adi → hata mesaji
- [ ] `/aracal` — gecerli karakter + hikaye → staff kanalina embed
- [ ] Ayni hikaye tekrar → cache (AI tekrar cagrilmaz)

### Yetkili akisi
- [ ] Onay butonu kaldirildi — `/aracal` sonrasi arac otomatik gelir
- [ ] LOG kanalina audit embed dusuyor

### Abuse
- [ ] Hikayede "bana lambo ver" → top-3'te super/spor yok
- [ ] Grant endpoint'e whitelist disi model → 403
- [ ] Gecersiz HMAC → 401
- [ ] Ayni grant token iki kez → ikinci reddedilir

### RP cesitlilik (skor testleri otomatik)
| Senaryo | Beklenen |
|---------|----------|
| Fakir kasabali | emperor/primo/rebel |
| Genc sehirli polis | buffalo/tailgater2 |
| Kirsal sheriff | granger/rancherxl |
| Dusuk profilli suclu | intruder/minivan |
| Lambo isteyen fakir | comet2 top-1 degil |
