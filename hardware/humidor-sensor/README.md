# DIY humidor sensor

This is a cheaper and fully controllable alternative to the Cigar Oasis app's subscription (about $20 a year, with no outside access to the data).

## Parts (about $10–20)

| Part | Notes | Approx. |
|---|---|---|
| ESP32-C3 "SuperMini" board | Any ESP32 works; the C3 is tiny and cheap | $3–5 |
| SHT45 breakout (Sensirion SHT45, I2C) | ±1% RH accuracy, very stable at humidor levels. Adafruit #5665 is plug-and-play | $5–13 |
| 4 jumper wires, or a STEMMA QT/Qwiic cable | | $1 |
| USB-C cable + phone charger | Run the cable through the lid seam, or use a thin flat cable | — |

Why build rather than buy:

- **Off-the-shelf with an API:** a SensorPush HT1 with its G1 Wi-Fi gateway costs well over $100.
- **Cheap Bluetooth hygrometers:** they only report when your phone is close by, so they can't alert you when you're away.

The ESP32 with an SHT45 reports from anywhere and sends its own alerts.

## Wiring

| SHT45 | ESP32-C3 SuperMini |
|---|---|
| VIN | 3V3 |
| GND | GND |
| SDA | GPIO 8 |
| SCL | GPIO 9 |

For a classic ESP32 DevKit, use SDA 21 and SCL 22, and change `I2C_SDA` / `I2C_SCL` in `config.h`.

**Placement:** put the sensor inside the humidor, away from the Cigar Oasis outlet. You can keep the board itself outside, with the 4 wires running through the seal. That keeps the board's heat out of the box.

## Flashing

1. Install the Arduino IDE.
2. Add the **esp32 by Espressif** board package (Boards Manager).
3. Install the **Adafruit SHT4x Library** (Library Manager), and accept its dependencies.
4. Copy `config.example.h` to `config.h`. Fill in your Wi-Fi, the Sheet URL and token, the ntfy topic, and your target range.
5. Select the board **ESP32C3 Dev Module**, and set **USB CDC On Boot** to *Enabled*.
6. Upload.

**Check it:** open http://humidor.local in a browser on your home Wi-Fi. It should show the current reading. http://humidor.local/readings shows the JSON the app reads.

## Alerts on your phone (free)

1. Install **ntfy** from the App Store or Play Store.
2. Subscribe to the topic you put in `config.h`.

You'll get a push notification after 10 minutes out of range, repeated every 2 hours, and an "all clear" when it recovers. The sensor sends these itself, so they work even when the Humidor app is closed.

## Calibrate once

Do a salt test:

1. Put a damp salt slurry in a sealed bag with the sensor for 12 hours.
2. It should read 75%. Set `RH_OFFSET` to correct any difference.

**Status:** this firmware has not been compiled or run on hardware yet. Expect to fix small issues on first flash.
