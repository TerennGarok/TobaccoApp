# Roadmap & decisions

## Phases

| Phase | Who | Shape |
|---|---|---|
| 1 — now | Just you | Data on your phone; free Google Sheet backend in your Drive; DIY humidor sensor; on-device band reading. $0/month. |
| 2 | Close friends, free | Same app build shared (Android APK / TestFlight). Friends point Settings at the same Sheet URL + token, so everyone grows one catalog; journals stay private on each phone. |
| 3 | Possibly paid | Replace the Sheet with a real backend (accounts, sync, sharing, moderation of the catalog), turn on the AI research service as a premium feature, App Store / Play Store listings. |

Design choices made now so phase 3 isn't a rewrite: all storage goes through
`src/db/*`, all network access through `src/services/*` interfaces, and the
identifier is pluggable (local matcher today, remote service later).

## Decisions

- **Identification (free):** on-device OCR (ML Kit / Apple Vision via
  `expo-text-extractor`) + fuzzy matching against the catalog. No per-lookup
  cost, works offline. The catalog starts small and grows with every
  verification (yours and friends'). Optional Claude-based web research is
  ready in `server/` for when costs are acceptable.
- **CigarBid:** no public bidding API exists, so the app links to CigarBid
  (profile button, Market wishlist, recommendations). Bidding happens on the site.
- **Retailers:** Cigars International, Famous Smoke Shop, JR Cigar, Cigar Page,
  Pipes and Cigars. Traffic sources (Similarweb, Semrush, Grips) disagree on
  order; Best Cigar Prices, Atlantic Cigar and Holt's are close alternates.
  Links open a site-restricted Google search until each site's own search URL
  is confirmed (one line each in `src/data/retailers.ts`).
- **Prices:** no free retailer price API exists. Phase 1 uses link-outs and
  records what you paid. Automated price checks would mean scraping retailer
  pages (fragile, and against most sites' terms) — deferred.
- **Humidor:** Cigar Oasis offers no API, so a DIY ESP32 + SHT45 sensor logs to
  the Sheet and sends its own ntfy push alerts. Off-the-shelf alternative with
  an API: SensorPush HT1 + G1 gateway (~$150).

## Next up
- Confirm each retailer's and CigarBid's search URL for direct links.
- Seed the shared catalog with the cigars you smoke most (paste into the Sheet).
- Photo of a tin label → match against a pipe-tobacco catalog tab (same as cigars).
- Pipe-tobacco tab in the Sheet; friends' catalog contributions review queue.
- Humidor: multiple sensors (e.g. a tupperdor + cabinet), Cigar Oasis water-refill reminders.
