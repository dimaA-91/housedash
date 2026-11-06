# DHT11 room sensor

The *Innen* tile on Home shows temperature, relative humidity and the time of the measurement from a DHT11 sensor
on the Pi's GPIO. *Draußen* next to it is the weather forecast (Open-Meteo), not a second sensor.

## Wiring

Typical module: **VCC → pin 1 (3.3 V), DATA → pin 7 (BCM GPIO4), GND → pin 6**. Check the labels on your module;
pin order differs between modules. Power the Pi off before wiring. Never feed 5 V into a GPIO. A bare four-pin sensor
needs a pull-up resistor from DATA to 3.3 V; three-pin modules usually have one.

## Setup (on the host)

```bash
sudo bash ~/housedash/scripts/setup-housedash-dht11.sh
```

The script backs up `/boot/firmware/config.txt`, adds `dtoverlay=dht11,gpiopin=4` under `[all]` and loads the overlay
at once (`dtoverlay dht11 gpiopin=4`). No packages, no reboot, no privileged container. Running it again adds nothing;
it stops if it finds a different existing configuration.

The kernel driver exposes an IIO device named `dht11` or `dht11@4` under `/sys/bus/iio/devices/` with
`in_temp_input` (milli-degrees Celsius) and `in_humidityrelative_input` (milli-percent). The device number is not
fixed; HouseDash finds it by name.

## How HouseDash reads it

`GET /api/family/room-climate` (authenticated, not cached) reads the two values directly as the unprivileged
container user: no shell, no cloud, no extra service.

- At most one measurement every 30 seconds, shared by all clients; one retry after 2.1 s on a checksum or timing
  error; a measurement is aborted after 6 s.
- The last valid value stays in memory only. From an age of two minutes it is marked as old; without a valid value
  the tile shows placeholders and a status message.
- Response: `sample: { temperatureC, humidityPercent, measuredAt } | null`, `status: ok | stale | unavailable`,
  `lastAttemptAt`, `message`.

To remove it, delete the marked DHT11 line from `config.txt` and unload only that overlay (`dtoverlay -l`).

Source: [Raspberry Pi overlays README](https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README).
