// Humidor sensor — ESP32 (C3 / S3 / classic) + Sensirion SHT45.
//
// • Samples every minute, keeps 24 h of 5-minute averages in RAM
// • Serves them on your Wi-Fi at http://humidor.local/readings (JSON)
// • Logs each 5-minute reading to the Google Sheet backend (works away from home)
// • Sends push alerts through ntfy.sh when out of range for 10+ minutes,
//   and an "all clear" when it recovers — even if the phone app is closed
//
// Libraries (Arduino Library Manager): "Adafruit SHT4x Library" (+ its Adafruit BusIO / Unified Sensor deps)
// Board package: "esp32" by Espressif. Copy config.example.h to config.h and fill it in.

#include <Adafruit_SHT4x.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <time.h>

#include "config.h"

Adafruit_SHT4x sht4;
WebServer server(80);

struct Reading {
  time_t t;
  float rh;
  float tempF;
};

const int SLOTS = 288;  // 24 h at 5-minute resolution
Reading history[SLOTS];
int head = 0, count = 0;

float sumRh = 0, sumT = 0;
int samples = 0;
unsigned long lastSample = 0, lastFlush = 0;

int outOfRangeMinutes = 0;
bool alerted = false;
unsigned long lastAlertMs = 0;
float lastRh = NAN, lastTempF = NAN;

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_NAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(500);
}

String iso(time_t t) {
  char buf[25];
  struct tm tmv;
  gmtime_r(&t, &tmv);
  strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return String(buf);
}

void handleReadings() {
  String out = "{\"device\":\"" DEVICE_NAME "\",\"readings\":[";
  for (int i = 0; i < count; i++) {
    const Reading &r = history[(head - count + i + SLOTS) % SLOTS];
    if (i) out += ',';
    out += "{\"t\":\"" + iso(r.t) + "\",\"rh\":" + String(r.rh, 1) + ",\"tempF\":" + String(r.tempF, 1) + "}";
  }
  out += "]}";
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", out);
}

bool postJson(const String &url, const String &body, const char *contentType) {
  WiFiClientSecure client;
  client.setInsecure();  // Simplest option for a hobby device; pin a root CA for stronger security.
  HTTPClient http;
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);  // Apps Script answers with a 302
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", contentType);
  int code = http.POST(body);
  http.end();
  return code > 0 && code < 400;
}

void logToSheet(const Reading &r) {
  if (strlen(SHEET_URL) == 0) return;
  String body = String("{\"token\":\"") + SHEET_TOKEN + "\",\"action\":\"reading\",\"device\":\"" DEVICE_NAME "\",\"rh\":" +
                String(r.rh, 1) + ",\"tempF\":" + String(r.tempF, 1) + "}";
  postJson(SHEET_URL, body, "text/plain");
}

void notify(const String &title, const String &msg, const char *priority) {
  if (strlen(NTFY_TOPIC) == 0) return;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String("https://ntfy.sh/") + NTFY_TOPIC)) return;
  http.addHeader("Title", title);
  http.addHeader("Priority", priority);
  http.addHeader("Tags", "droplet");
  http.POST(msg);
  http.end();
}

bool inRange(float rh, float tf) { return rh >= RH_MIN && rh <= RH_MAX && tf >= TEMP_MIN && tf <= TEMP_MAX; }

void checkAlerts(float rh, float tf) {
  if (inRange(rh, tf)) {
    if (alerted) notify("Humidor back in range", String(rh, 1) + "% RH, " + String(tf, 1) + "°F", "default");
    outOfRangeMinutes = 0;
    alerted = false;
    return;
  }
  outOfRangeMinutes++;
  bool cooldownOver = millis() - lastAlertMs > ALERT_REPEAT_MIN * 60000UL;
  if (outOfRangeMinutes >= ALERT_AFTER_MIN && (!alerted || cooldownOver)) {
    String what = rh < RH_MIN ? "Humidity low" : rh > RH_MAX ? "Humidity high" : tf < TEMP_MIN ? "Temperature low" : "Temperature high";
    notify("Humidor: " + what,
           String(rh, 1) + "% RH, " + String(tf, 1) + "°F (target " + String(RH_MIN, 0) + "–" + String(RH_MAX, 0) + "%, " +
               String(TEMP_MIN, 0) + "–" + String(TEMP_MAX, 0) + "°F)",
           "high");
    alerted = true;
    lastAlertMs = millis();
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!sht4.begin()) {
    Serial.println("SHT4x not found — check wiring");
  }
  sht4.setPrecision(SHT4X_HIGH_PRECISION);
  sht4.setHeater(SHT4X_NO_HEATER);

  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  if (MDNS.begin(DEVICE_NAME)) MDNS.addService("http", "tcp", 80);
  server.on("/readings", handleReadings);
  server.on("/", [] {
    server.send(200, "text/plain", String(DEVICE_NAME) + ": " + String(lastRh, 1) + "% RH, " + String(lastTempF, 1) + " F");
  });
  server.begin();
}

void loop() {
  server.handleClient();
  unsigned long now = millis();

  if (now - lastSample >= 60000UL || lastSample == 0) {
    lastSample = now;
    sensors_event_t humidity, temp;
    if (sht4.getEvent(&humidity, &temp)) {
      float tf = temp.temperature * 9.0 / 5.0 + 32.0 + TEMP_OFFSET_F;
      float rh = humidity.relative_humidity + RH_OFFSET;
      lastRh = rh;
      lastTempF = tf;
      sumRh += rh;
      sumT += tf;
      samples++;
      checkAlerts(rh, tf);
    }
  }

  if (samples && (now - lastFlush >= 300000UL || lastFlush == 0)) {
    lastFlush = now;
    Reading r = {time(nullptr), sumRh / samples, sumT / samples};
    sumRh = sumT = 0;
    samples = 0;
    history[head] = r;
    head = (head + 1) % SLOTS;
    if (count < SLOTS) count++;
    connectWifi();
    logToSheet(r);
  }
  delay(10);
}
