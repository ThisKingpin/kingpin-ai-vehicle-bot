# kingpin-ai-vehicle-bot

Discord bot — karakter hikayesine gore AI profil cikarimi + deterministik arac skorlama.

## Kurulum

```bash
cd kingpin-ai-vehicle-bot
cp .env.example .env
npm install
npm run register-commands
npm run dev
```

## Ortam degiskenleri

| Degisken | Aciklama |
|----------|----------|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Uygulama ID |
| `GEMINI_API_KEY` | Google Gemini API |
| `OPENAI_API_KEY` | JSON fallback (opsiyonel ama onerilir) |
| `AI_VEHICLE_SECRET` | FiveM ile ayni secret |
| `FIVEM_BASE_URL` | Ornek: `http://SUNUCU_IP:30120` |
| `SERVER_NAME` | Sunucu adi |
| `LOG_CHANNEL_ID` | Otomatik verme audit log kanali (onerilir) |
| `STAFF_CHANNEL_ID` | Kullanilmiyor (eski onay akisi kaldirildi) |
| `ADMIN_ROLE_ID` | Yetkili rol |
| `GUILD_ID` | Hizli slash komut kaydi (opsiyonel) |

## Komutlar

- `/aracal` — Hikaye analizi + **otomatik** en uygun arac garaja eklenir
- `/arac-log` — Yetkili gecmis
- `/arac-yeniden-analiz` — Yetkili: yeniden analiz + otomatik ver

Staff onay adimi yok. `LOG_CHANNEL_ID` audit kaydi icin onerilir.

## Test

```bash
npm test
```

## FiveM

[`kingpin-ai-vehicles`](../kingpin-ai-vehicles/) resource'unu sunucuda baslat:

```
ensure kingpin-ai-vehicles
set ai_vehicle_secret "guclu-bir-secret"
```

Bot VPS'ten FiveM HTTP endpoint'ine erismeli (port + firewall).

## Railway deploy

1. GitHub repo'yu Railway'e bagla (New Project → Deploy from GitHub)
2. Root directory: repo kok dizini (bot projesi tek basina repo)
3. Asagidaki env degiskenlerini Railway Variables'a ekle:

| Variable | Zorunlu |
|----------|---------|
| `DISCORD_TOKEN` | Evet |
| `DISCORD_CLIENT_ID` | Evet |
| `GEMINI_API_KEY` | Evet |
| `AI_VEHICLE_SECRET` | Evet (FiveM ile ayni) |
| `FIVEM_BASE_URL` | Evet (`http://IP:30120`) |
| `SERVER_NAME` | Evet |
| `LOG_CHANNEL_ID` | Onerilir |
| `ADMIN_ROLE_ID` | Onerilir |
| `GUILD_ID` | Onerilir (hizli slash komut guncelleme) |
| `OPENAI_API_KEY` | Opsiyonel (fallback) |

4. Deploy sonrasi bot otomatik baslar ve slash komutlari kaydeder
5. FiveM sunucusunda Railway cikis IP'sine HTTP portu ac

**Not:** `dist/` git'e girmez; Railway build sirasinda `npm run build` calistirir.
