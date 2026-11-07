# Roadmap & integration notes

## Research findings that shape the design

### Cigar Oasis Plus 4.0 (humidor monitoring)
- The 4.0 units connect over Wi-Fi to the **Cigar Oasis SmartHumidor** app
  (subscription ≈ $3.99/mo or $19.99/yr per Halfwheel). The 4.0's upgraded
  Wi-Fi chip enables real-time data and push notifications in *their* app.
- **No public API, documented local protocol, or Home Assistant integration
  was found.** Options, in order of preference:
  1. Ask Cigar Oasis for API/partner access (cleanest; worth an email).
  2. Inspect the SmartHumidor app's cloud traffic from your own account and
     poll that endpoint from our server — works, but can break without notice
     and may conflict with their terms.
  3. Check whether the unit exposes anything on the local network.
  4. Fallback: an inexpensive standalone Wi-Fi/BLE hygrometer (e.g. one with a
     documented API) placed in the humidor, giving us full control of alerts.
- The app side (thresholds, history charts, push alerts) doesn't depend on
  which path wins; it reads from a `HumidorSource` interface.

### Auctions & purchasing
- **CigarBid (the main cigar auction site) has no public API.** Third-party
  price trackers exist (cigarpricetracker.com) but bidding is only possible
  through the site itself.
- Automated bidding would mean scripting a logged-in browser session —
  fragile and very likely against the site's terms. Recommended: the app
  tracks lots, shows historical "good price" guidance, lets you set your max
  bid, and opens the lot on the site to place it (one tap), with alerts
  before close.
- Retail prices: no common API across Famous Smoke, Cigars International,
  JR, Holt's, Atlantic, Cigar Page, etc. Plan is server-side price lookups
  (search + page fetch) cached per SKU, refreshed daily for wishlist items.
- Tobacco sales are age-restricted; checkout itself must stay on the retailer.

## Next phases
1. **Inventory** — counts per cigar & size, purchase price/date/vendor,
   aging, auto-decrement on smoke, collection value.
2. **Pipe tobacco** — tin photo → blend lookup (blend, maker, components:
   Virginia, Burley, Latakia, Perique, Oriental, aromatic), ratings adapted to
   pipe (flavor, room note, bite, burn, moisture), cellaring dates.
3. **Humidor** — once the data source is decided.
4. **Market** — price comparison, wishlist alerts, auction watching.
5. **Backup / sync** — cloud backup + multi-device; export to CSV.
