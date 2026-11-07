/**
 * Humidor app backend — Google Apps Script bound to a Google Sheet.
 * Free, lives in your own Google Drive. See README.md for setup.
 *
 * Sheet tabs (created automatically on first use):
 *   Catalog  — one row per cigar line; edit freely by hand.
 *   Readings — humidor log written by the sensor.
 *
 * GET  ?action=ping|catalog|readings&token=…[&hours=168]
 * POST {"token": …, "action": "upsertCatalog", "row": {...}}
 * POST {"token": …, "action": "reading", "rh": 67.2, "tempF": 68.1, "device": "humidor-1"}
 * POST {"token": …, "action": "backup", "filename": "...json", "content": "..."}
 */
var VERSION = '1';
var CATALOG_HEADERS = [
  'brand', 'line', 'aliases', 'manufacturer', 'wrapper', 'binder', 'filler', 'origin', 'strength',
  'sizes', 'flavors_maker', 'flavors_reviews', 'description', 'updated_by', 'updated_at',
];
var READING_HEADERS = ['t', 'rh', 'tempF', 'device'];
var BACKUP_FOLDER = 'Humidor Backups';
var KEEP_READING_DAYS = 90;

function doGet(e) {
  return handle_(function () {
    var p = e.parameter || {};
    checkToken_(p.token);
    switch (p.action) {
      case 'ping':
        return { ok: true, version: VERSION };
      case 'catalog':
        return { rows: readRows_(sheet_('Catalog', CATALOG_HEADERS)) };
      case 'readings':
        return { readings: readings_(Number(p.hours) || 168) };
      default:
        throw new Error('Unknown action');
    }
  });
}

function doPost(e) {
  return handle_(function () {
    var body = JSON.parse(e.postData.contents);
    checkToken_(body.token);
    switch (body.action) {
      case 'upsertCatalog':
        upsertCatalog_(body.row);
        return { ok: true };
      case 'reading':
        appendReading_(body);
        return { ok: true };
      case 'backup':
        return backup_(body.filename, body.content);
      default:
        throw new Error('Unknown action');
    }
  });
}

// ---------- helpers ----------

function handle_(fn) {
  var out;
  try {
    out = fn();
  } catch (err) {
    out = { error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('Set a TOKEN in Project Settings → Script Properties');
  if (token !== expected) throw new Error('Bad token');
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  return values
    .filter(function (r) { return r.join('') !== ''; })
    .map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : String(r[i]); });
      return o;
    });
}

function key_(brand, line) {
  return (String(brand) + '|' + String(line)).toLowerCase().trim();
}

/** Sizes are "Name LxRG [shape]" separated by ';' — merge by name+dimensions. */
function mergeSizes_(a, b) {
  var seen = {};
  var out = [];
  (String(a || '') + ';' + String(b || '')).split(';').forEach(function (s) {
    s = s.trim();
    if (!s) return;
    var k = s.toLowerCase().replace(/\s+/g, ' ');
    if (!seen[k]) { seen[k] = true; out.push(s); }
  });
  return out.join('; ');
}

function mergeList_(a, b) {
  var seen = {};
  var out = [];
  (String(a || '') + ',' + String(b || '')).split(',').forEach(function (s) {
    s = s.trim();
    if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = true; out.push(s); }
  });
  return out.join(', ');
}

/** New rows are added; existing rows only gain sizes/flavors and fill blanks — hand edits win. */
function upsertCatalog_(row) {
  if (!row || !row.brand || !row.line) throw new Error('brand and line are required');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_('Catalog', CATALOG_HEADERS);
    var values = sh.getDataRange().getValues();
    var headers = values[0];
    var col = {};
    headers.forEach(function (h, i) { col[h] = i; });
    var k = key_(row.brand, row.line);
    for (var r = 1; r < values.length; r++) {
      if (key_(values[r][col.brand], values[r][col.line]) !== k) continue;
      var cur = values[r];
      headers.forEach(function (h, i) {
        if (h === 'sizes') cur[i] = mergeSizes_(cur[i], row.sizes);
        else if (h === 'flavors_maker' || h === 'flavors_reviews' || h === 'aliases') cur[i] = mergeList_(cur[i], row[h]);
        else if (h === 'updated_at') cur[i] = new Date().toISOString();
        else if (h === 'updated_by') cur[i] = row.updated_by || cur[i];
        else if (cur[i] === '' && row[h]) cur[i] = row[h];
      });
      sh.getRange(r + 1, 1, 1, headers.length).setValues([cur]);
      return;
    }
    sh.appendRow(headers.map(function (h) { return h === 'updated_at' ? new Date().toISOString() : row[h] || ''; }));
  } finally {
    lock.releaseLock();
  }
}

function appendReading_(b) {
  var rh = Number(b.rh);
  var tempF = Number(b.tempF);
  if (!isFinite(rh) || !isFinite(tempF)) throw new Error('rh and tempF must be numbers');
  sheet_('Readings', READING_HEADERS).appendRow([new Date().toISOString(), rh, tempF, String(b.device || 'humidor')]);
}

function readings_(hours) {
  var since = Date.now() - hours * 3600000;
  var sh = sheet_('Readings', READING_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  // Readings are appended in time order; only scan the tail we need (5-minute cadence).
  var n = Math.min(last - 1, Math.ceil(hours * 12) + 50);
  var values = sh.getRange(last - n + 1, 1, n, 4).getValues();
  return values
    .map(function (r) {
      var t = r[0] instanceof Date ? r[0].toISOString() : String(r[0]);
      return { t: t, rh: Number(r[1]), tempF: Number(r[2]), device: String(r[3]) };
    })
    .filter(function (r) { return new Date(r.t).getTime() >= since; });
}

function backup_(filename, content) {
  if (!filename || !content) throw new Error('filename and content are required');
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  var file = folder.createFile(String(filename).replace(/[^\w.\-]/g, '_'), content, 'application/json');
  return { ok: true, url: file.getUrl() };
}

/** Optional: add a daily time-driven trigger on this to keep the Readings tab small. */
function pruneReadings() {
  var sh = sheet_('Readings', READING_HEADERS);
  var values = sh.getDataRange().getValues();
  var cutoff = Date.now() - KEEP_READING_DAYS * 86400000;
  var drop = 0;
  for (var r = 1; r < values.length; r++) {
    if (new Date(values[r][0]).getTime() < cutoff) drop++;
    else break;
  }
  if (drop) sh.deleteRows(2, drop);
}
