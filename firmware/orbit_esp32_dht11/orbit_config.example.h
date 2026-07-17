// ORBIT firmware configuration — copy this file to orbit_config.h (gitignored)
// in the same folder and fill in real values. Never commit orbit_config.h.
#pragma once

// WiFi
#define WIFI_SSID     "your-ssid"
#define WIFI_PASSWORD "your-wifi-password"

// MQTT broker — the ORBIT host's LAN IP (not a Tailscale 100.x address:
// the ESP32 is not a tailnet member and cannot route to it).
#define MQTT_HOST "192.168.1.100"
#define MQTT_PORT 1883

// From POST /api/v1/devices registration response (shown exactly once).
// MQTT_USERNAME must stay "dev-{device_id}" — the client id reuses it.
#define DEVICE_ID     "00000000-0000-0000-0000-000000000000"
#define MQTT_USERNAME "dev-00000000-0000-0000-0000-000000000000"
#define MQTT_PASSWORD "device-password-from-registration"

// Hardware
#define DHTPIN  4
#define DHTTYPE DHT11

#define PUBLISH_INTERVAL_MS 30000UL
