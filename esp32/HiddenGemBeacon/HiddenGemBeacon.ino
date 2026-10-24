#include <NimBLEDevice.h>

class BeaconCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& info) override {
    Serial.println("BLE client connected.");
  }

  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& info, int reason) override {
    Serial.printf("BLE client disconnected (reason %d). Advertising will restart.\n", reason);
  }
};

static BeaconCallbacks serverCallbacks;
// The website accepts only BLE devices whose advertised name starts with this.
static const char* DEVICE_NAME = "HiddenGem-ESP32";
static const char* SERVICE_UUID = "f3641400-00b0-4240-ba50-05ca45bf8abc";

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Hidden Gem BLE beacon...");

  // Start a connectable BLE GATT server. The website only uses the connection
  // to unlock the experience; no checkpoint or personal data is sent.
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);
  server->advertiseOnDisconnect(true);

  // A primary service makes this a GATT server. No characteristic is needed
  // because the website does not read or write beacon data.
  NimBLEService* service = server->createService(SERVICE_UUID);
  service->start();

  // Explicitly advertise the name because NimBLE 2.x does not include it by
  // default. Put the local name in scan response data for browser discovery.
  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->clearData();
  if (!advertising->setName(DEVICE_NAME)) {
    Serial.println("Could not add the BLE device name to the advertisement.");
  }
  // Keep the name in the primary advertisement. The website connects by name
  // and does not need the service UUID in the advertisement; adding both can
  // exceed the legacy BLE packet's 31-byte payload.
  advertising->enableScanResponse(false);

  if (advertising->start()) {
    Serial.println("Advertising as HiddenGem-ESP32. Ready for a browser connection.");
  } else {
    Serial.println("Could not start BLE advertising.");
  }
}

void loop() {
  delay(1000);
}
