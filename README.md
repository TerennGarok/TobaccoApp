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

**Market** — wishlist, "Try next" recommendations (similar flavor/body/wrapper
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

On-device band reading needs a **development build** (Expo Go doesn't include
the text-recognition module). Until then the verify screen lets you type what
the band says. Build for your own phone for free:

```bash
npx eas-cli@latest build --profile development --platform android   # installable APK
npx eas-cli@latest build --profile development --platform ios       # needs an Apple Developer account
```

## Set-up checklist

1. **Google Sheet backend** — `backend-google/README.md` (10 minutes, free).
2. **Humidor sensor** — `hardware/humidor-sensor/README.md`.
3. Settings in the app: paste the Sheet URL + token, set humidor limits.

## Optional: AI research service (later phases)

`server/` sends the photo to Claude with web search for richer results (every
size, review scores, tasting notes) on cigars not yet in the catalog. It costs
per lookup, so it's off unless `EXPO_PUBLIC_IDENTIFY_URL` is set.

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
