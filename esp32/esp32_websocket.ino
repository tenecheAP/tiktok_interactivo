#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// Configuración WiFi
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";

// Configuración Servidor Backend
const char* ws_host = "192.168.1.XX"; // IP de tu PC corriendo el backend
const int ws_port = 3000;

WebSocketsClient webSocket;

// Pines de Actuadores
const int RELAY_PIN = 18;
const int LED_PIN = 2; // LED interno

void webSocketEvent(WStype_t type, uint8_t * payload, length_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WSc] Desconectado!");
      break;
    case WStype_CONNECTED:
      Serial.println("[WSc] Conectado al backend");
      break;
    case WStype_TEXT:
      {
        Serial.printf("[WSc] Mensaje recibido: %s\n", payload);
        
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (error) {
          Serial.print(F("deserializeJson() failed: "));
          Serial.println(error.f_str());
          return;
        }

        // Estructura esperada: ["action", {"action": "relay_1", "duration": 1000, ...}]
        // Socket.io envía arrays. El primer elemento es el nombre del evento.
        const char* eventName = doc[0];
        if (strcmp(eventName, "action") == 0) {
          JsonObject data = doc[1];
          const char* action = data["action"];
          int duration = data["duration"];

          if (strcmp(action, "relay_1") == 0) {
            Serial.println("Activando Relé...");
            digitalWrite(RELAY_PIN, HIGH);
            delay(duration); // Para simplicidad, pero mejor usar timers no bloqueantes
            digitalWrite(RELAY_PIN, LOW);
          } else if (strcmp(action, "led_pulse") == 0) {
            digitalWrite(LED_PIN, HIGH);
            delay(duration);
            digitalWrite(LED_PIN, LOW);
          }
        }
      }
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi conectado!");
  Serial.println(WiFi.localIP());

  // Configuración de WebSocket (Socket.io usa una ruta específica /socket.io/)
  webSocket.begin(ws_host, ws_port, "/socket.io/?EIO=4&transport=websocket");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();
}
