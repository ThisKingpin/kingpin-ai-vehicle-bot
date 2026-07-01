# kingpin-ai-vehicle-bot

Discord bot — karakter hikayesine gore AI profil cikarimi + deterministik arac skorlama.

## Kurulum (yerel gelistirme)

```bash
cd kingpin-ai-vehicle-bot
cp .env.example .env
# .env dosyasini doldur (asagidaki tabloya bak)
npm install
npm run register-commands
npm run dev
```

`.env` dosyasini **asla** git'e commit etme. Gercek token/anahtarlari Discord sohbetine veya ekran goruntusune yapistirma.

---

## Ortam degiskenleri (Environment Variables)

### Zorunlu

| Degisken | Aciklama | Nereden alinir |
|----------|----------|----------------|
| `DISCORD_TOKEN` | Discord **Bot Token** | [Discord Developer Portal](https://discord.com/developers/applications) → Uygulama sec → **Bot** → Reset Token / Copy. **Client Secret degil**, user token degil. |
| `DISCORD_CLIENT_ID` | Application ID | Ayni portal → **General Information** → Application ID. URL'deki uzun sayi da aynidir. |
| `GEMINI_API_KEY` | Google Gemini API anahtari | [Google AI Studio](https://aistudio.google.com/apikey) → Create API key. |
| `AI_VEHICLE_SECRET` | FiveM ↔ bot paylasimli sifre | Kendin uret (uzun rastgele string). FiveM `server.cfg` icindeki `ai_vehicle_secret` ile **birebir ayni** olmali. |
| `SERVER_NAME` | Oyuncuya gosterilen sunucu adi | Ornek: `Kingpin RP` |

### Onerilen (Discord sunucu / yetki)

| Degisken | Aciklama | Nereden alinir |
|----------|----------|----------------|
| `GUILD_ID` | Discord sunucu ID | Discord'da sunucu adina sag tik → **Sunucu Kimligini Kopyala** (Developer Mode acik olmali). Slash komutlari bu sunucuda aninda guncellenir. |
| `ADMIN_ROLE_ID` | Yetkili rol ID | Sunucu Ayarlari → Roller → role sag tik → **Rol Kimligini Kopyala**. `/arac-log` ve `/arac-yeniden-analiz` icin gerekli. |
| `LOG_CHANNEL_ID` | Audit log kanal ID | Log kanalina sag tik → **Kanal Kimligini Kopyala**. Otomatik arac verme kayitlari buraya duser. |

### Opsiyonel

| Degisken | Aciklama | Nereden / varsayilan |
|----------|----------|----------------------|
| `OPENAI_API_KEY` | Gemini basarisiz olursa yedek AI | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `GEMINI_MODEL` | Gemini model adi | Varsayilan: `gemini-2.5-flash` |
| `FORUM_CHANNEL_ID` | Sadece bu forumdaki konular kabul edilir | Forum kanalina sag tik → Kanal ID |
| `STORY_MAX` | Forum hikaye karakter limiti | Varsayilan: `20000` |
| `VEHICLE_VISUAL_ANALYSIS` | Gorsel yeniden siralama | `true` / `false` (varsayilan acik) |
| `VEHICLE_IMAGE_BASE_URL` | Embed arac gorseli taban URL | Varsayilan: FiveM docs |

### Artik kullanilmiyor

| Degisken | Not |
|----------|-----|
| `FIVEM_BASE_URL` | **Pull modu** ile kaldirildi. FiveM disari cikarak Railway'den is ceker; modemde port acmana gerek yok. |

---

## Discord Developer Portal ayarlari

1. [Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** sekmesi:
   - Token olustur → `DISCORD_TOKEN`
   - **Privileged Gateway Intents** gerekmez (sadece slash komut kullaniliyor)
3. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`, `View Channels`
   - Olusan link ile botu sunucuna davet et
4. Forum kanalinda bot rolune: **Kanallari Gor**, **Mesaj Gecmisini Oku**

**Developer Mode:** Discord Ayarlar → Gelismis → Gelistirici Modu → acik (ID kopyalamak icin).

---

## FiveM tarafi (`kingpin-ai-vehicles`)

Bot tek basina calismaz; sunucuda resource ve eslesen secret gerekir.

`server.cfg`:

```cfg
ensure kingpin-ai-vehicles

set ai_vehicle_secret "BURAYA_AI_VEHICLE_SECRET_ILE_AYNI_DEGER"
set ai_vehicle_bot_url "https://SENIN-PROJE.railway.app"
set ai_vehicle_poll_ms "2000"
```

| Convar | Aciklama |
|--------|----------|
| `ai_vehicle_secret` | Bot `AI_VEHICLE_SECRET` ile **ayni** |
| `ai_vehicle_bot_url` | Railway public URL (sonunda `/` olmasin) |
| `ai_vehicle_poll_ms` | Is cekme araligi ms (opsiyonel, varsayilan 2000) |

Framework: QBox ve QBCore desteklenir (`kingpin-ai-vehicles` config'de `auto`).

---

## Railway deploy

Repo: **https://github.com/ThisKingpin/kingpin-ai-vehicle-bot**

1. [Railway](https://railway.app) → New Project → Deploy from GitHub → `kingpin-ai-vehicle-bot`
2. **Variables** sekmesine yukaridaki zorunlu + onerilen degiskenleri ekle (tirnak kullanma, bosluk birakma)
3. **Settings → Networking** → Generate Domain → cikan URL'yi FiveM `ai_vehicle_bot_url` olarak yaz
4. Deploy sonrasi logda `API dinleniyor: https://...` ve slash komut kaydi gorulmeli

Ornek Railway Variables (degerleri kendi urettiklerinle doldur):

```
DISCORD_TOKEN=MTIz...
DISCORD_CLIENT_ID=1514764198062850159
GEMINI_API_KEY=AIza...
AI_VEHICLE_SECRET=guclu-rastgele-secret
SERVER_NAME=Kingpin RP
GUILD_ID=1506648168870318090
ADMIN_ROLE_ID=1508953858737704990
LOG_CHANNEL_ID=...
OPENAI_API_KEY=sk-proj-...   # opsiyonel yedek
```

**Not:** `dist/` git'e girmez; Railway build sirasinda `npm run build` calistirir.

---

## Pull modu (port acmaya gerek yok)

1. Bot Railway'de HTTPS API sunar (`/api/fivem/pull`, `/api/fivem/complete`)
2. FiveM periyodik olarak Railway'e **cikar** ve isleri ceker
3. FiveM localhost'ta bile calisir — `FIVEM_BASE_URL` ve firewall port acma **gerekmez**

---

## Komutlar

- `/aracal` — Hikaye analizi + otomatik en uygun arac garaja eklenir

**Uzun hikaye (forum):** Forumda karakter hikayeni yaz, konuya sag tik → **Konu ID'sini Kopyala**:

```
/aracal karakter_adi:Ahmet Yilmaz konu_id:1234567890123456789
```

Veya forum linkini yapistir:

```
/aracal karakter_adi:Ahmet Yilmaz mesaj_linki:https://discord.com/channels/...
```

Bot forum konusunun ilk mesajini (ve PDF/DOCX/TXT eklerini) okur — varsayilan **20000** karaktere kadar (`STORY_MAX` env ile artirilabilir).

Slash komutundaki dogrudan `hikaye` alani Discord limiti nedeniyle en fazla **4000** karakter; uzun metinler icin forum kullan.

- `/arac-log` — Yetkili gecmis (`ADMIN_ROLE_ID`)
- `/arac-yeniden-analiz` — Yetkili: yeniden analiz + otomatik ver

Staff onay adimi yok. `LOG_CHANNEL_ID` audit kaydi icin onerilir.

---

## Discord 401 hatasi (slash komut kaydi)

`401 Unauthorized` = Discord token veya Application ID gecersiz.

1. **Bot Token kullan** — Client Secret veya user token **degil**
2. Token sifirlandiysa Railway Variables'i guncelle
3. Tirnak/bosluk yok: `DISCORD_TOKEN=MTIz...` (yanlis: `"MTIz..."`)
4. Bot sunucuda mi? OAuth2 ile `bot` + `applications.commands` scope

---

## Test

```bash
npm test
npm run build
```

## Ilgili resource

[`kingpin-ai-vehicles`](../kingpin-ai-vehicles/) — FiveM sunucu tarafi (karakter dogrulama, arac verme, whitelist).
