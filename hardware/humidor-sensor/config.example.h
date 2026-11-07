// Copy to config.h (which is git-ignored) and fill in.
#pragma once

#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"
#define DEVICE_NAME "humidor"  // reachable as http://humidor.local

// Google Sheet backend (backend-google/README.md). Leave "" to skip.
#define SHEET_URL "https://script.google.com/macros/s/XXXX/exec"
#define SHEET_TOKEN "same-token-as-in-the-app"

// Push alerts: install the ntfy app, subscribe to this topic. Use something long and random.
#define NTFY_TOPIC "humidor-change-me-7f3k9q"

// Target range — keep in sync with the app's Settings.
#define RH_MIN 65.0
#define RH_MAX 70.0
#define TEMP_MIN 62.0
#define TEMP_MAX 72.0
#define ALERT_AFTER_MIN 10   // must be out of range this long before alerting
#define ALERT_REPEAT_MIN 120 // re-alert every 2 h while still out of range

// Calibration (e.g. after a 75% salt test: if it reads 77%, set RH_OFFSET -2.0)
#define RH_OFFSET 0.0
#define TEMP_OFFSET_F 0.0

// I2C pins. ESP32-C3 SuperMini: SDA 8, SCL 9. Classic ESP32 DevKit: SDA 21, SCL 22.
#define I2C_SDA 8
#define I2C_SCL 9
