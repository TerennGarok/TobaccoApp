# Humidor — a cigar & pipe tobacco journal

A cross-platform (iOS, Android, web) app for logging, rating and researching
cigars and pipe tobacco. Built with Expo / React Native + TypeScript, storing
everything on the device in SQLite so it works without a signal.

## What works today (cigars)

1. **Photograph the band** (camera or library). The photo is saved to an
   on-device queue first.
2. **Identification** — the band is read and the cigar researched on the web
   (brand, line, wrapper/binder/filler, strength, **every vitola**, maker
   tasting notes, review scores). **No connection?** The photo stays queued
   and is identified automatically when connectivity returns; it waits at the
   top of the Journal until you verify it.
3. **Verify** — always required. Choose among the best matches, edit brand /
   line, and pick the **size from a drop-down** of the line's vitolas (or enter
   a custom size — a band can't reveal length or ring gauge).
4. **Ratings** — 5-star Flavor, Aroma, Burn, Construction, Draw (pull).
5. **Character** — Mild ↔ Full body slider and a Yes/No spice toggle, both
   pre-set from the manufacturer's profile.
6. **Flavors** — 80 push-button notes in 11 families (earth, wood, spice,
   sweet, coffee & cocoa, nut, cream, bread, fruit, floral/herbal, smoke).
   Expected notes are pre-selected and **color-coded**: brass = manufacturer,
   blue = reviewers, green = both, cream = your own addition.
7. **Notes** — free text, then a summary and save.
8. **Cigar profile** — one page combining your averaged ratings, body/spice,
   flavor frequency, "expected but not noted", outside review scores next to
   yours, specs, sizes you've smoked, and the full smoking log.
9. **Search** across brand, line, wrapper, origin, flavors and your notes.

Inventory, Humidor monitoring and Market (prices / auctions) tabs are
placeholders — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Running it

```bash
npm install
npx expo start          # scan the QR code with Expo Go, or press w for web
npm run typecheck
```

Without a backend the app runs in **demo mode**: identification returns a
small sample catalog so the whole flow can be tried.

### Identification server

`server/` is a small Node service that sends the photo to Claude with web
search and returns structured results. The API key lives only on the server.

```bash
cd server && npm install
ANTHROPIC_API_KEY=... npm start         # listens on :8787
```

Then point the app at it: `EXPO_PUBLIC_IDENTIFY_URL=http://<your-ip>:8787 npx expo start`.

## Layout

```
src/app/            screens (Expo Router): (tabs)/, capture, review/*, cigar/[id]
src/components/     UI kit: buttons, stars, flavor chips, size picker
src/data/           flavor taxonomy, sample catalog
src/db/             SQLite schema + queries (cigars, reviews, id_queue)
src/services/       identification providers, offline queue, photo storage
server/             identification API (Claude + web search)
```
