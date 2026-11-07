# Free backend: Google Sheet + Apps Script

This runs on your own Google account at no cost. It holds three things:

- **Catalog tab**: the shared cigar catalog. The app's band matcher searches it for brand, line, sizes and flavors. You can edit it by hand, and every cigar or size you verify in the app is added to it.
- **Readings tab**: the humidor log, written by the sensor every 5 minutes.
- **"Humidor Backups" folder in Drive**: JSON backups sent from the app.

## Setup (about 10 minutes)

1. Create a new Google Sheet and name it something like **Humidor**.
2. Open **Extensions → Apps Script**. Delete the sample code, then paste in the contents of `Code.gs`. Save.
3. Create the access token:
   1. Open **Project Settings** (the gear icon), then **Script Properties**.
   2. Click **Add property**, with the name `TOKEN` and a long random value. A password generator works well for this.
   3. Keep the value handy. The app and the sensor both need it.
4. Deploy the script:
   1. Click **Deploy → New deployment**, and pick **Web app** as the type.
   2. Set *Execute as* to **Me**, and *Who has access* to **Anyone**. The token is what keeps other people out.
   3. Click **Deploy** and approve the permissions it asks for (Sheets and Drive).
   4. Copy the **Web app URL**. It ends in `/exec`.
5. In the app, open **Settings**:
   1. Paste the URL and the token.
   2. Enter your name.
   3. Tap **Test**, then **Sync now**.

**When you change `Code.gs` later:** open **Deploy → Manage deployments**, edit the deployment, and choose *New version*. The URL stays the same.

## Sharing with friends (phase 2)

Give friends the same URL and token. Everyone's verified cigars then go into one catalog. Each person's journal, ratings and inventory stay on their own phone.

If you'd rather they couldn't edit the catalog, give them a separate script deployment with its own token.

## Catalog columns

| Column | Example |
|---|---|
| brand | Padrón |
| line | 1964 Anniversary Series Maduro |
| aliases | 1964 Maduro, Padron 64 |
| wrapper / binder / filler / origin | Nicaraguan Maduro / Nicaraguan / … |
| strength | mild, mild-medium, medium, medium-full, full |
| sizes | `Principe 4.5x46; Exclusivo 5.5x50 box-pressed; Torpedo 6x52 torpedo` |
| flavors_maker | Cocoa, Coffee, Earth |
| flavors_reviews | Black Pepper, Leather |
| description | free text |

**Matching:** the `aliases` column helps the matcher with nicknames and the exact words printed on a band.

**Flavors:** use the names shown on the app's flavor buttons.

**Color coding:** a flavor listed in both `flavors_maker` and `flavors_reviews` shows as "maker & reviewers" (green) in the app.

## Limits

Apps Script's free quotas (about 20,000 URL calls and 6 minutes of run time per call per day) are far above what one humidor and a few friends will use.

## Optional: prune old readings

**Triggers → Add trigger** → run `pruneReadings`, set to *Time-driven, daily*. This keeps the last 90 days.
