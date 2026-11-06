# HTTPS for microphones on phones

Browsers only allow the microphone on HTTPS pages or on loopback. The wall display uses
`http://127.0.0.1:3000/family`; phones and tablets use `https://<hostname>.local/family` after installing the Pi's own
certificate once. The HTTP address on port 3000 keeps working.

## iPhone and iPad

1. On the home Wi-Fi open `http://<hostname>.local/housedash-root.crt` in Safari and download the profile.
2. *Settings → Profile Downloaded*: install it.
3. *Settings → General → About → Certificate Trust Settings*: enable full trust for the HouseDash authority.
4. Open `https://<hostname>.local/family` (for the home screen: *Share → Add to Home Screen*).

Other devices: add the certificate to the user or browser certificate store and allow the microphone for the page.
Only install the certificate generated on your own Pi. Its fingerprint, in `~/housedash` on the Pi:

```sh
docker compose cp https:/data/caddy/pki/authorities/local/root.crt /tmp/housedash-root.crt
openssl x509 -in /tmp/housedash-root.crt -noout -fingerprint -sha256
```

## How it works

- Container `housedash-https` (Caddy) on IPv4 ports 80/443, running as UID 1000 on internal ports 8080/8443 without
  capabilities. Port 80 serves only the public certificate and redirects to HTTPS; port 443 proxies to the app.
- `tls internal`: Caddy's own local certificate authority, no ACME, no public certificate service, no port forwarding.
- The host name comes from `HOUSEDASH_HOSTNAME` (set by `deploy-pi.sh` from `hostname`).
- The authority keeps the name it was created with ("FamilyOS Local Authority" on older installations), so devices
  that already trust it keep working.
- The volumes `housedash_https-data` and `housedash_https-config` survive image changes. `setup-housedash-https.sh`
  archives them on each deployment as `backups/https-*.tar.gz`. These archives contain the private CA key: store
  them protected. Without the original authority every device has to trust a new one.

References: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [Apple: trust certificates](https://support.apple.com/102390).
