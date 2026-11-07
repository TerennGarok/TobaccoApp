# Humidor — a cigar & pipe tobacco journal

A cross-platform (iOS, Android, web) app for logging, rating, stocking and shopping
cigars and pipe tobacco, plus live humidor monitoring. Expo / React Native +
TypeScript; everything is stored on the phone (SQLite) and works offline.
**Runs at $0**: band reading happens on the phone, and the shared catalog,
humidor log and backups live in a Google Sheet on your own Drive.

## Features

**Cigars**
- Photograph the band → on-device text recognition reads it → matched against
  the shared catalog (fuzzy, tolerant of OCR slips). Offline-safe queue.
- Mandatory verification: pick among matches or search the catalog by typing,
  edit brand/line, choose the size from the line's vitolas (or add a new size,
  which is contributed back to the catalog).
- "I smoked it" → 5-star Flavor / Aroma / Burn / Construction / Draw → body
  slider + spice toggle → color-coded flavor buttons (maker / reviewers / both /
  yours) → pairing, occasion, smoke time, notes (with an optional
  first/second/final-third template).
- "I bought some" → straight to inventory with quantity, price and vendor.
- One-page profile: averaged ratings, body/spice, flavor frequency, outside
  scores next to yours, sizes smoked, stock on hand and resting time, shop
  links, smoking log. Search across everything.

**Pipe tobacco** — blend, cut, leaf components, aromatic; ratings for flavor,
room note, burn, bite-free, consistency; strength and moisture sliders; pipe
used; flavor notes; cellar inventory by the ounce.

**Inventory** — stock by size, price paid, vendor, resting/cellar age, total
value; logging a smoke deducts one automatically (toggle on the notes page).

**Market** — wishlist as a price board: one row per retailer with the
single-stick price for your chosen size, when it was checked, and the best
price starred; "Check" opens that store's search for the exact cigar + size.
Also "Try next" recommendations (similar flavor/body/wrapper
to cigars you rated 4★+), and one-tap links to **CigarBid** and the top five
retailers (Cigars International, Famous Smoke Shop, JR Cigar, Cigar Page,
Pipes and Cigars).

**Humidor** — current RH / °F, 24 h and 7 day charts against your target band,
in-app alerts, plus push alerts from the sensor itself via ntfy (work with the
app closed). Uses a ~$10–20 DIY sensor: `hardware/humidor-sensor/`.

**Your data** — CSV export of both journals, full JSON backup/restore,
automatic weekly backup (on the device and to Google Drive).

## Running it

```bash
npm install
npx expo start          # Expo Go on your phone, or press w for the web
npm run typecheck
```

### Install on your Android phone (free)

On-device band reading needs the installed app (Expo Go doesn't include the
text-recognition module). Build an APK in Expo's cloud — free tier, no Android
Studio needed:

```bash
npx eas-cli@latest login            # free Expo account
npx eas-cli@latest build --profile preview --platform android
```

When the build finishes (≈10–20 min) open the link it prints on your phone,
download the APK and install it (allow "install unknown apps" for your
browser when Android asks). Friends can install the same APK.

## Set-up checklist

1. **Google Sheet backend** — `backend-google/README.md` (10 minutes, free).
2. **Humidor sensor** — `hardware/humidor-sensor/README.md`.
3. Settings in the app: paste the Sheet URL + token, set humidor limits.

## Claude band lookup

Two ways, both on the verify screen under **Ask Claude**:

- **Claude app (free with your Claude plan):** tap *Ask the Claude app* — the
  research prompt goes on your clipboard and the band photo opens in Android's
  share sheet. Pick Claude, paste, send. When Claude answers, tap Copy on its
  reply, come back and tap *Paste Claude's answer*: brand, line, every size,
  flavors (color-coded) and review scores fill in for you to verify.
- **Automatic (Anthropic API key):** add a key in Settings → *Automatic Claude
  lookup* and choose a model. Photos the catalog doesn't already match well go
  straight to Claude (with web search) — no copy/paste. Billed per lookup to
  your Anthropic API account (separate from a Claude subscription); the key
  stays in the phone's secure storage.

Whatever you verify is added to your shared catalog, so each cigar only needs
looking up once. `server/` holds the same lookup as a hosted service, for a
later phase where the key shouldn't live on each phone.

## Layout

```
src/app/            screens: (tabs)/ cigars, pipe, inventory, humidor, market; review/*, pipe/*, cigar/[id], settings
src/components/     UI kit: buttons, stars, flavor chips, size picker, range chart
src/data/           flavor taxonomy, pipe vocabulary, retailers, sample catalog
src/db/             SQLite schema & queries
src/lib/            pure logic: matching, catalog text format, recommendations, aggregation
src/services/       OCR, identification, catalog sync, offline queue, humidor, backup
backend-google/     Apps Script for the Google Sheet backend
hardware/           ESP32 + SHT45 humidor sensor firmware
server/             optional Claude-based identification service
docs/ROADMAP.md     phases, decisions, open questions
```
