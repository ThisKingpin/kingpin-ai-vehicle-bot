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

## Discord 401 hatasi (slash komut kaydi)

`401 Unauthorized` = Discord token veya Application ID gecersiz.

Kontrol listesi:

1. **Bot Token kullan** — Developer Portal → Application → **Bot** → Reset Token / Copy  
   - Client Secret **DEGIL**
   - User token **DEGIL**

2. **DISCORD_CLIENT_ID** = Application ID (General Information)  
   - URL'deki ID: `1514764198062850159` ise Railway'de de aynisi olmali

3. **Token sifirlandi mi?** — Portal'da reset yaptiysan eski token calismaz; Railway'de guncelle

4. **Tirnak/bosluk yok** — Railway Variables:
   ```
   DISCORD_TOKEN=MTIz...   (tirnaksiz)
   ```
   Yanlis: `"MTIz..."` veya sonda bosluk

5. **Bot sunucuda mi?** — OAuth2 URL Generator ile `bot` + `applications.commands` scope; botu guild'e davet et

6. **GUILD_ID** = `1508952770730922095` (sunucu ID, botun eklendigi sunucu)


| Degisken | Aciklama |
|----------|----------|
| `DISCORD_TOKEN` | **Bot Token** (Bot sekmesi — Client Secret degil!) |
| `DISCORD_CLIENT_ID` | Opsiyonel (bot token'daki app id otomatik kullanilir) |
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

Repo: **https://github.com/ThisKingpin/kingpin-ai-vehicle-bot**

1. [Railway](https://railway.app) → New Project → Deploy from GitHub → `kingpin-ai-vehicle-bot`

2. Asagidaki env degiskenlerini Railway **Variables** sekmesine ekle:

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
| `GUILD_ID` | Onerilir |
| `OPENAI_API_KEY` | Opsiyonel |

3. Deploy sonrasi bot otomatik baslar ve slash komutlari kaydeder
4. FiveM sunucusunda Railway cikis IP'sine HTTP portu ac

**Not:** `dist/` git'e girmez; Railway build sirasinda `npm run build` calistirir.
