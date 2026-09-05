# Gateway → Cloud Kafka Integration

Contract between `aiot-gate` (local gateway, aggregates devices on a private
MQTT broker) and this backend. The gateway is responsible for normalizing
raw device data into this format before publishing — the backend does not
parse device-specific payload shapes for Kafka-sourced data.

## The gateway is itself a device

`aiot-gate` registers itself (`POST /devices/register`) against the seeded
**"aiot-gate Gateway"** template (`DeviceTemplateType.GATEWAY`), the same way
any physical device registers against a sensor/relay template. It then
reports its own health as telemetry (`uptimeSeconds`, `bridgedDeviceCount`,
`cpuLoadPercent`, `cpuTemperatureCelsius`, `memoryUsagePercent`,
`diskUsagePercent`, `kafkaConnected`) and status
(`ONLINE`/`OFFLINE`) via the same `devices.telemetry`/`devices.status` Kafka
topics used for every other device, using its *own* `deviceId` — this is
what makes gateway health visible on the Devices page alongside the devices
it bridges. There is no separate "gateway API" — it's a regular device from
the backend's point of view, set to `pushChannel: "KAFKA"`.

The template also defines one action, `restart` (`BUTTON`) — triggering it
(`POST /devices/:id/actions`) publishes to `devices.gateway.commands` as
usual; the gateway should treat a command whose `deviceId` matches its own as
self-directed (restart itself) rather than something to relay downstream.

## Connection

Gateway connects as its own Kafka client (own `clientId`/consumer group),
producing to the shared broker at `KAFKA_BROKERS`. Registering a device via
`POST /devices/register` is what makes its `deviceId` accepted — that's
unrelated to the Kafka connection itself, which the gateway authenticates
separately if the broker requires it.

The backend supports connecting to a broker with SASL auth over TLS (e.g. a
managed/hosted Kafka), configured via env vars — not per-device:

| Env var | Purpose |
|---|---|
| `KAFKA_SSL_ENABLED` | `true` to connect over TLS |
| `KAFKA_SASL_ENABLED` | `true` to enable SASL auth |
| `KAFKA_SASL_MECHANISM` | `plain` \| `scram-sha-256` \| `scram-sha-512` |
| `KAFKA_SASL_USERNAME` / `KAFKA_SASL_PASSWORD` | SASL credentials |

`aiot-gate` should use the same broker/SSL/SASL settings — fetch them via
`GET /devices/{deviceId}/boot-config` (see below): the `kafka` field on the
response carries `username`/`password` alongside `brokers`, so the gateway
doesn't need its own separate copy of these secrets configured out of band.

## Topics

Seven shared topics, **not** per-device. Devices are distinguished by the
`deviceId` field inside the payload, and every message must be produced with the device id as the
**Kafka message key** (`kafkajs`: `{ key: deviceId, value: JSON.stringify(payload) }`)
so all messages for one device land in the same partition and are processed
in order.

| Topic | Direction | Constant |
|---|---|---|
| `devices.telemetry` | gateway → cloud | `KAFKA_TELEMETRY_TOPIC` |
| `devices.status` | gateway → cloud | `KAFKA_STATUS_TOPIC` |
| `devices.gateway.commands` | cloud → gateway | `KAFKA_GATEWAY_COMMANDS_TOPIC` |
| `devices.gateway.events` | cloud → gateway | `KAFKA_GATEWAY_EVENTS_TOPIC` |
| `devices.events` | gateway → cloud | `KAFKA_DEVICE_EVENTS_TOPIC` |
| `devices.commands` | gateway → cloud | `KAFKA_COMMAND_TOPIC` |
| `devices.cloud.alerts` | gateway/device → cloud | `KAFKA_ALERT_TOPIC` |

`devices.commands`'s name is a holdover from before it changed direction (see its own section
below) — don't let the name mislead: it's gateway → cloud now, same as the four other topics
sharing that direction.

Defined in `src/constants/kafka-topics.ts`.

### `devices.telemetry` (gateway → cloud)

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "temperature": 26.4,
  "humidity": 58.2,
  "current_ch1": 0.42
}
```

- `deviceId` (string, required) — must match the `deviceId` the device was
  registered with (`POST /devices/register`). Everything except `deviceId`
  is stored verbatim as the telemetry row's JSON `payload`.
- No unit/shape restrictions on the remaining fields — the gateway sends
  whatever fields the device template expects (mirrors what the ESP32 would
  otherwise publish over MQTT telemetry).
- Ingestion timestamp is stamped server-side (`recordedAt = now()`); include
  a `timestamp` field in the payload if the gateway needs to preserve the
  original sample time — it will be stored as-is inside `payload` but is not
  interpreted by the backend.
- Consumed by `KafkaController.handleTelemetry` → `DeviceService.recordTelemetry`.

### `devices.status` (gateway → cloud)

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "status": "ONLINE"
}
```

- `status` — `"ONLINE"` or `"OFFLINE"` (case-insensitive, trimmed server-side).
  Any other value is logged and ignored.
- Send `"ONLINE"` when a device (re)connects to the gateway's local MQTT
  broker, `"OFFLINE"` when its LWT fires or the gateway otherwise detects it
  dropped.
- Consumed by `KafkaController.handleStatus` → `DeviceService.handleDeviceStatusMessage`.

### `devices.gateway.commands` (cloud → gateway)

The shared per-gateway inbox topic — every gateway (any device registered with
`pushChannel: "KAFKA"`) has a fixed subscription to this topic name, **not** overridden by
`config.kafka.commandTopic`. Carries two message shapes, distinguished by which fields are
present:

**Actuator command to relay** — published by `DeviceService.triggerDeviceAction` for any device
with no `config.kafka.commandTopic` of its own (e.g. MQTT-only relay nodes, bridged by a separate
gateway device that IS listening on this shared inbox):

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "key": "relay_1",
  "value": "ON",
  "topic": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/channel/1/command"
}
```

- `topic` (string, optional) — the device's own downlink MQTT command topic
  for this channel (NOT the Kafka topic the message itself was sent on),
  resolved server-side from the device's stored config: the per-channel
  topic matching `key` in `config.mqtt.topics.channels`, falling back to
  `config.mqtt.topics.command`. Omitted for devices with no MQTT config of
  their own.
- The gateway consumes this, looks up `deviceId` among the devices it
  bridges, and relays `{ key, value }` to that device over its own local
  MQTT — publishing on `topic` directly rather than re-deriving it from a
  separately-cached boot-config.
- Alongside this, `triggerDeviceAction` also publishes to `devices.gateway.events` (below, for
  gateway-side observability) and self-publishes an optimistic `{ deviceId, key, value, status: "ok" }`
  onto `devices.events` itself, so the dashboard sees the change immediately via the same path a
  real gateway confirmation takes, without waiting on the round trip to the physical device. The
  gateway's own (authoritative) confirmation on `devices.events` follows shortly after.

**Config-sync nudge** — published by `DeviceService.pushConfigSync`, a "re-fetch your boot-config
now" signal, not an actuator command:

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "type": "config_sync",
  "configVersion": 4
}
```

- Published when a user clicks "Push to device" on the Device Config dialog, or whenever else the
  cloud wants a gateway to pick up a config change immediately instead of
  waiting for its own poll/reboot cycle.
- `type` (string) — always `"config_sync"` for now; treat an unrecognized
  `type` as a no-op rather than an error, in case new push types are added
  later.
- `configVersion` (number) — the config version the backend had at publish
  time, informational only (e.g. for logging "was asked to sync to v4"). The
  gateway should still re-fetch `GET /devices/{deviceId}/boot-config` as the
  actual source of truth rather than trust this number alone — it's a nudge
  to check, not the new config itself.
- On receipt, re-fetch this gateway's own boot-config (`GET
  /devices/{deviceId}/boot-config` using its own `deviceId`) and apply
  whatever changed (alert rules, failsafe, MQTT/Kafka settings, etc.).
- Only published for devices on the KAFKA push channel — a plain MQTT-push
  node returns `400` from `POST /devices/:id/config/push` since there's no
  Kafka connection of its own to receive this on; a bridged MQTT node's
  owning gateway would need to be synced instead.

**Either shape:** consume-only for the gateway — never publish/echo back here; report an applied
(or failed) result on `devices.events` instead, or, for a change the gateway makes entirely on its
own initiative with no preceding command from here, publish on `devices.commands` (see below).

### `devices.gateway.events` (cloud → gateway)

A companion to the actuator-command shape of `devices.gateway.commands` above, published right
alongside it whenever a user triggers a device action via `POST /devices/:id/actions` — same
trigger, same payload shape, different topic.

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "key": "relay_1",
  "value": "ON",
  "topic": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/channel/1/command",
  "requestedAt": "2026-09-02T10:15:00.000Z"
}
```

- **Not consumed by this backend at all** — produce-only, mirroring `devices.gateway.commands`.
  Every gateway should subscribe to this fixed topic name (not overridden by
  `config.kafka.commandTopic`) the same way it does for `devices.gateway.commands`.
- Audit/observability-only — the gateway is **not** expected to relay an actuator command from
  here. The actual relay instruction is still `devices.gateway.commands`; this just lets the
  gateway (or any other listener) tell "a dashboard user just dispatched this" apart from its own
  relay bookkeeping without parsing a second copy of the command out of `devices.gateway.commands`.
- `requestedAt` (ISO timestamp) — when the backend dispatched the command, informational only.
- Best-effort: a failure publishing here is logged but does **not** fail the
  `POST /devices/:id/actions` request — the real command on `devices.gateway.commands` already
  went out by the time this is attempted.

### `devices.events` (gateway → cloud)

Reports whether a `devices.gateway.commands` relay actually landed on the device — published by
the gateway's `publishEventResult` right after it relays a command down to the device's local
MQTT.

The backend itself also self-publishes here (`DeviceService.triggerDeviceAction`, always with
`status: "ok"`) right after dispatching a command, purely to get an immediate optimistic update to
the dashboard through the same `handleDeviceChannelEvent` path — see `devices.gateway.commands`
above. The gateway's own message for the same `{ deviceId, key }` follows shortly after and is the
authoritative one (it can still flip the result to `status: "error"` if the command didn't
actually apply — see the `status` field below).

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "key": "relay1",
  "value": "ON",
  "topic": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/channel/1/command",
  "status": "ok"
}
```

On failure, `status` is `"error"` and an `error` field carries what went wrong instead of the
command actually applying:

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "key": "relay1",
  "value": "ON",
  "status": "error",
  "error": "device did not ack within timeout"
}
```

- A per-channel command-result envelope, separate from `devices.telemetry`/`devices.status`
  — used for reporting the applied result of something the gateway did locally, rather than a
  periodic telemetry sample.
- `deviceId` (string, required) — must match a registered device the same way the other topics do.
- `key`/`value` (strings, required on `status: "ok"`) — the channel and the actuator state the
  gateway applied, e.g. `{ key: "relay1", value: "ON" }`. Merged into the device's persisted
  `channelStates` (`{ relay1: "ON" }`), which is broadcast to the dashboard over the `channelState`
  websocket event.
- `topic` (string, optional) — the device's own downlink MQTT topic the command was relayed to,
  when the gateway resolved one from an explicit per-channel relay topic; omitted when it instead
  fell back to resolving the device via boot-config. Stored as-is for unclaimed-device debugging,
  not otherwise interpreted by the backend.
- `status` (string, optional, defaults to `"ok"`) — `"ok"` or `"error"`. On `"error"`, `key`/`value`
  describe the command that was *attempted*, not one that took effect — `channelStates` is left
  untouched and the failure is just logged server-side.
- `error` (string, optional) — present on `status: "error"`, a message describing what went wrong
  (e.g. a device ack timeout).
- Either way, receiving the event at all marks the device `ONLINE` (same as telemetry) since it
  proves the gateway is actively bridging it.
- Consumed by `KafkaConsumerService.handleDeviceEvent` → `DeviceService.handleDeviceChannelEvent`.

### `devices.commands` (gateway → cloud)

Same envelope shape as `devices.events` above (`{ deviceId, key, value }`, no `status`/`error`)
and handled by the exact same code path — but for a channel/state change the gateway decided to
make **on its own initiative**, with no preceding `devices.gateway.commands` relay to confirm. Use
this for a locally-fired automation rule flipping a relay, a physical/local input changing a
channel, or any other gateway-initiated change the cloud should know about.

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "key": "relay1",
  "value": "ON"
}
```

- `deviceId`/`key`/`value` — same meaning as on `devices.events`'s `status: "ok"` case: merged into
  the device's persisted `channelStates`, broadcast over the `channelState` websocket event, and
  marks the device `ONLINE`.
- No `status`/`error` fields — there's no "failed to apply" case to report here, since by
  definition the gateway is reporting a change it already made, not confirming one the cloud asked
  for. Always treated as a success.
- The topic's name (`devices.commands`, and the `cloud` in its underlying constant
  `KAFKA_COMMAND_TOPIC = 'devices.cloud.commands'`) is a holdover from an earlier version of this
  contract where it was the cloud → gateway downlink bus — don't let that mislead: **this topic is
  gateway → cloud only now.** A gateway built against the old (cloud → gateway) contract needs
  updating to publish here instead of consuming.
- Consumed by `KafkaConsumerService.handleDeviceEvent` → `DeviceService.handleDeviceChannelEvent`
  (same handler as `devices.events`).

### `devices.cloud.alerts` (gateway/device → cloud)

Rule-fired shape — the device/gateway evaluated one of its own rules locally and it fired:

```json
{
  "deviceId": "G25admrd7c63",
  "metric": "sensor",
  "reading": {
    "apms": 11.6,
    "co2": 564.8,
    "humidity": 61.2,
    "pm25": 18.2,
    "temperature": 28.5
  },
  "rule": "sensor.apms>10:relay2=ON"
}
```

- Distinct from the threshold breaches the backend derives itself from `devices.cloud.telemetry`
  (see `DeviceWarningListener.handleTelemetry`) — here the device/gateway already decided the rule
  fired; the backend just renders and forwards it.
- `metric` (string, optional) — a label for the reading group (e.g. `"sensor"`); falls back to the
  metric segment of `rule` when omitted.
- `reading` (object, optional) — the full sensor snapshot at the time the rule fired; the field the
  rule references (`reading[field]`, e.g. `reading.apms`) is read out and included in the rendered
  message. Extra fields are accepted but otherwise unused.
- `rule` (string, required for this shape) — a
  `"<metric>.<field><op><threshold>[:<key>=<value>]"` expression, e.g. `"sensor.apms>10:relay2=ON"`:
  the condition that fired (`sensor.apms > 10`) and, after the optional `:`, the resulting action
  taken (`relay2=ON`, parsed the same way as `devices.cloud.events`'s `key=value` message). The
  action segment is informational only — the backend does not itself publish a command from it.
  A `rule` that doesn't parse is logged and ignored.
- Renders to e.g. `[Alert] {device name}: sensor.apms = 11.6 (rule: apms > 10) → relay2=ON`.

Pre-rendered shape — for publishers that don't want to encode a rule:

```json
{
  "deviceId": "G25admrd7c63",
  "message": "Vibration exceeded safe limit"
}
```

- `message` (string) — forwarded as-is, prefixed with `[Alert] {device name}: `. Takes precedence
  over `rule`/`reading` when both are present.

Either shape accepts an optional `channels` field:

```json
{ "channels": ["ZALO", "WEB_PUSH"] }
```

- `channels` (array of `NotificationChannelType` — `"ZALO"` \| `"WEB_PUSH"` — optional) — restricts
  delivery to these channels; unrecognized values are dropped, and an empty/omitted list falls
  back to every enabled, linked channel (same fallback `NotificationService.sendWarning` uses
  elsewhere).
- Consumed by `KafkaConsumerService.handleAlert` → `DeviceService.handleDeviceAlert`, which emits
  a `device.alert` domain event picked up by `DeviceWarningListener.handleAlert` →
  `NotificationService.sendWarning`. An unregistered `deviceId` is recorded as an unclaimed device
  like the other topics, rather than dropped.

### `devices.cloud.ota` (gateway/device → cloud)

OTA (over-the-air) firmware update progress/result — the uplink counterpart of the `ota_update`
message on `devices.gateway.commands` above:

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "status": "DOWNLOADING",
  "progress": 42
}
```

- `status` (string, required) — one of `PENDING` \| `DOWNLOADING` \| `INSTALLING` \| `SUCCESS` \|
  `FAILED` (case-insensitive). An unrecognized value is logged and ignored, same as an unrecognized
  `devices.status` payload.
- `progress` (number, optional) — 0-100.
- `version` (string, required on `"SUCCESS"`) — the firmware version now running; stored as the
  device's new `firmwareVersion`.
- `error` (string, optional, on `"FAILED"`) — what went wrong.
- Consumed by `KafkaConsumerService.handleOtaStatus` → `DeviceOtaService.handleOtaStatusReport`,
  which updates the device's cached `ota*` fields, the matching `device_ota_updates` history row,
  and broadcasts a `otaStatus` websocket/SSE event.
- A device connected directly over MQTT (not bridged by a gateway) reports the same shape on its
  own `devices/{deviceId}/ota/status` topic instead — see `defaultOtaStatusTopic`'s doc comment.

An `ota_update` instruction going the other way is carried on `devices.gateway.commands` (see
above), distinguished by `type: "ota_update"`:

```json
{
  "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
  "type": "ota_update",
  "version": "1.4.2",
  "url": "https://example.com/uploads/firmware/abc123.bin",
  "checksum": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "size": 1048576
}
```

- Published by `DeviceOtaService.triggerUpdate` when a user dispatches an update from the
  dashboard. `url` is wherever the binary is actually hosted — this backend never proxies or
  streams the firmware itself, only the instruction to fetch it.
- A device can also *pull* this information itself instead of only reacting to a push — see
  `GET devices/{deviceId}/ota/manifest` below.

## Fetching device config (REST)

Before bridging a device, the gateway fetches its config to learn the push
channel, per-channel command topics (for relaying `devices.gateway.commands` back to
the device's local MQTT), and any Kafka override.

```
GET /devices/{deviceId}/boot-config
x-device-secret: <shared secret>
```

- Same shared-secret model as MQTT credentials — any non-revoked secret
  works for any `deviceId` (see `DeviceSecretService`/`DeviceSecretGuard`,
  `POST /device-secrets` to mint one). Not per-device, not a user JWT.
- `{deviceId}` must already be registered (`POST /devices/register`) —
  unregistered devices get `404` here, independent of the Kafka
  unclaimed-device flow below (that flow is for telemetry/status uplink
  only, not this config lookup).
- Response (`ResponseCore<DeviceConfigDto>`):

```json
{
  "error": 0,
  "message": "",
  "data": {
    "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
    "apiEndpoint": null,
    "pushChannel": "KAFKA",
    "mqtt": {
      "broker": "mqtt://gateway.local",
      "port": 1883,
      "username": "iot-gateway",
      "password": "***",
      "topics": {
        "telemetry": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/telemetry",
        "command": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/command",
        "status": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/status",
        "channels": [
          { "index": 1, "key": "relay_1", "label": "Relay 1", "topic": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/channel/1/command" },
          { "index": 2, "key": "relay_2", "label": "Relay 2", "topic": "devices/01a04142-ba64-79c2-b29c-6c8ae29af427/channel/2/command" }
        ]
      }
    },
    "http": null,
    "kafka": {
      "brokers": "kafka.internal:9092",
      "topics": ["devices.telemetry", "devices.status", "devices.events", "devices.commands"],
      "commandTopic": "devices.gateway.commands",
      "clientId": "aiot-lab-service-gw-01a04142-ba64-79c2-b29c-6c8ae29af427",
      "username": "cloud-kafka-user",
      "password": "***"
    },
    "configVersion": 3
  }
}
```

- `kafka` is `null` only when `pushChannel` isn't `"KAFKA"`. When it is, and
  the device has no per-device override configured (the common case), the
  backend fills it in from its own `KAFKA_BROKERS`/`KAFKA_SASL_*` env config
  — `username`/`password` are only present when `KAFKA_SASL_ENABLED=true`.
- `topics` — every topic this device (a gateway, in practice) should **produce** to; see the topic
  list above for what each one means. `commandTopic` is separate (produce-only vs. the one topic
  this device should **consume**) — not part of `topics` above.

- `mqtt` is present regardless of `pushChannel` — it always describes the
  device's **local** MQTT topics on the gateway's own broker, since that's
  how the gateway talks to the physical device either way. `pushChannel`
  tells the gateway which **uplink** to cloud to use (`MQTT` direct,
  `KAFKA` via this gateway, `HTTP`).
- `topics.channels[].key` matches the `key` field the gateway will receive
  on `devices.gateway.commands` — use it to look up which local topic to relay a
  given command to (`topics.channels[].topic`).
- Fetch this per device when first seen, and again whenever
  `devices.gateway.commands` (above) delivers a `config_sync` nudge for a
  gateway's own `deviceId` — that's the real-time path. A gateway that also
  wants to self-heal from a missed/dropped push should still poll
  periodically and compare against its last-applied `configVersion` (bumped
  on every `PATCH /devices/:id/config`), since `config_sync` delivery isn't
  guaranteed (e.g. the gateway was offline when it was published).

### Checking for an OTA update (REST, pull-based)

A device/gateway can also check for a firmware update itself instead of only reacting to a
`devices.gateway.commands` push — same auth as `boot-config`:

```
GET /devices/{deviceId}/ota/manifest
x-device-secret: <shared secret>
```

```json
{
  "error": 0,
  "message": "",
  "data": {
    "deviceId": "01a04142-ba64-79c2-b29c-6c8ae29af427",
    "currentVersion": "1.4.1",
    "updateAvailable": true,
    "latestVersion": "1.4.2",
    "fileUrl": "https://example.com/uploads/firmware/abc123.bin",
    "checksum": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "sizeBytes": 1048576,
    "releaseNotes": "Fixes relay debounce"
  }
}
```

- `updateAvailable` is true whenever the latest **active** firmware build registered for this
  device's template (`POST /firmwares` or `POST /firmwares/upload`) has a different `version` than
  `currentVersion` (the device's last self-reported `SUCCESS` version) — `fileUrl`/`checksum`/etc.
  are only populated in that case.
- Poll this on boot and/or on an interval; there's no push notification for "a new build was
  published" the way `config_sync` exists for config changes.
- After downloading and applying an update, report the result on `devices.cloud.ota` (or the MQTT
  `.../ota/status` topic) so `currentVersion` advances and the dashboard reflects it.

## Unregistered devices

If `deviceId` on `devices.telemetry` or `devices.status` doesn't match any
registered device, the backend does **not** drop the message silently — it
upserts an "unclaimed device" record (`unclaimed_devices` table, surfaced via
`GET /devices/unclaimed`) so a user can register it from the web UI. Once
registered, subsequent messages for that `deviceId` are processed normally.

## Why one shared topic per direction (not per-device)

Kafka topics are broker-managed partitioned logs, not free-form per-device
paths like MQTT. Creating a topic per device doesn't scale operationally
(topic count, partition rebalancing) — instead there's one topic per message
type, and devices are distinguished by `deviceId` in the key/payload. This
also means the backend's Kafka consumer never needs to know about a device's
existence ahead of time or dynamically subscribe to new topics as devices
are added — `aiot-gate` only ever needs these fixed topic names.
