/*
 * ORBIT — Stage 3 firmware: ESP32-S3-Zero + DHT11 (temperature + humidity)
 *
 * Wiring: DHT11 VCC -> 3V3, GND -> GND, DATA -> GPIO4.
 *
 * Libraries (Arduino IDE > Library Manager):
 *   - "MQTT" by Joel Gaehwiler (256dpi/arduino-mqtt) — QoS 1 publish, per
 *     docs/decisions/0001-firmware-mqtt-library.md. NOT PubSubClient, which
 *     can only publish QoS 0 while mqtt-topics.md requires QoS 1.
 *   - "DHT sensor library" by Adafruit (+ dependency "Adafruit Unified Sensor")
 *
 * Board (Boards Manager > esp32 by Espressif): "ESP32S3 Dev Module"
 *
 * Credentials/config live in orbit_config.h (gitignored — copy
 * orbit_config.example.h and fill in the values from device registration).
 * MQTT client ID MUST equal MQTT_USERNAME ("dev-{device_id}"): the broker's
 * per-device dynamic-security role is bound to that client id.
 *
 * Behaviour per docs/specs/mqtt-topics.md:
 *   - state topics  orbit/devices/{id}/{capability}/state — retained, QoS 1,
 *     JSON {"value": <float>, "ts": "<ISO8601 UTC>"} (ts omitted if NTP failed;
 *     the backend substitutes receive time)
 *   - availability  orbit/devices/{id}/availability — retained, QoS 1,
 *     plain "online" on connect; "offline" registered as the LWT so the broker
 *     announces an unclean disconnect automatically
 */

#include <WiFi.h>
#include <MQTT.h>
#include <DHT.h>
#include <time.h>

#include "orbit_config.h"

DHT dht(DHTPIN, DHTTYPE);
WiFiClient net;
MQTTClient mqtt(256);

String TOPIC_TEMPERATURE = String("orbit/devices/") + DEVICE_ID + "/temperature/state";
String TOPIC_HUMIDITY    = String("orbit/devices/") + DEVICE_ID + "/humidity/state";
String TOPIC_AVAILABILITY = String("orbit/devices/") + DEVICE_ID + "/availability";

unsigned long lastPublish = 0;

void connectWifi() {
  Serial.printf("Connecting to WiFi '%s'", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi connected, IP: %s\n", WiFi.localIP().toString().c_str());
}

void syncTime() {
  // ts must be ISO 8601 UTC; the backend tolerates a missing ts, but a real
  // clock is easy to get right.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  Serial.print("Syncing time via NTP");
  int attempts = 0;
  while (!getLocalTime(&timeinfo) && attempts < 20) {
    Serial.print(".");
    delay(500);
    attempts++;
  }
  Serial.println(attempts < 20 ? " done." : " failed — ts omitted, backend falls back.");
}

bool nowIso8601(char* out, size_t outLen) {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 1000)) return false;
  strftime(out, outLen, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return true;
}

void connectMqtt() {
  // LWT must be registered before connect().
  mqtt.setWill(TOPIC_AVAILABILITY.c_str(), "offline", true, 1);
  while (!mqtt.connect(MQTT_USERNAME /* client id == username */, MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.printf("MQTT connect failed (err %d), retrying in 3s\n", mqtt.lastError());
    delay(3000);
  }
  Serial.println("MQTT connected.");
  mqtt.publish(TOPIC_AVAILABILITY.c_str(), "online", true, 1);
}

void publishReading(const String& topic, float value) {
  char tsBuf[25];
  char payload[96];
  if (nowIso8601(tsBuf, sizeof(tsBuf))) {
    snprintf(payload, sizeof(payload), "{\"value\": %.1f, \"ts\": \"%s\"}", value, tsBuf);
  } else {
    snprintf(payload, sizeof(payload), "{\"value\": %.1f}", value);
  }
  bool ok = mqtt.publish(topic.c_str(), payload, true, 1);  // retained, QoS 1
  Serial.printf("%s -> %s (%s)\n", topic.c_str(), payload, ok ? "ok" : "FAILED");
}

void publishSensors() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  if (isnan(temperature) && isnan(humidity)) {
    Serial.println("DHT11 read failed, skipping this cycle.");
    return;
  }
  if (!isnan(temperature)) publishReading(TOPIC_TEMPERATURE, temperature);
  if (!isnan(humidity)) publishReading(TOPIC_HUMIDITY, humidity);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  connectWifi();
  syncTime();
  mqtt.begin(MQTT_HOST, MQTT_PORT, net);
  mqtt.setKeepAlive(15);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishSensors();
  }
}
