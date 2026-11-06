# iPad as a wall display

An older iPad in landscape works as a second or alternative wall display. Notes are based on an iPad 6 (2018);
statements from forums are marked as such.

## Layout

- Width 900–1400 px (iPad landscape, 1024×768): tablet layout. The stage is 1360 px wide and as tall as the screen
  allows, scaled to about 75 %. No borders, no scrolling.
- Below 900 px (iPad portrait): phone layout with the bottom bar.
- From 1400 px (14″ display): fixed 1536×960 stage.
- Implementation: `fit` in `src/app/family/FamilyCalendar.tsx` (`TABLET_W`, `TABLET_MIN_H`), centering in
  `src/app/family/design.css` (`.family-stage`).
- The iPad uses its own keyboard; the on-screen keyboard of the wall display never appears there.

## Setup on the iPad

1. Same Wi-Fi as the Pi. Address `https://<hostname>.local/family`.
2. Microphone: install and trust the Pi's certificate ([HTTPS.md](HTTPS.md)).
3. *Share → Add to Home Screen* for full screen without the Safari bar (`apple-mobile-web-app-capable`). If the
   microphone still fails after installing the certificate, delete and re-add the icon (forums report that the web
   app caches an earlier trust decision).
4. *Display & Brightness → Auto-Lock → Never*; fixed brightness.
5. *Accessibility → Guided Access* on, set a code, open the page, triple-press the Home button. Set *Display Auto-Lock*
   inside Guided Access to *Never* as well.
6. Turn off automatic updates and use a Focus so notifications do not cover the dashboard.
7. In HouseDash *Mehr → Ruhe-Ansicht*: let the app dim itself instead of locking the screen.

## Battery and power

Running on the charger all the time is the main risk.

- An old battery can swell under permanent charging
  ([openHAB thread](https://community.openhab.org/t/bloated-battery-in-tablet-fire-hazard/145821)); others say cycling
  mostly costs lifetime ([Loxone forum](https://groups.google.com/g/loxone-english/c/p4K8_63wows)).
- Forum advice: put the charger on a smart plug or timer so the battery does not sit at 100 % (reports mention
  20–80 % or 50–70 %; not from Apple). Whether the iPad 6 limits charging itself has not been checked.
- Leave air around the iPad and mount it so a gap is visible; a swollen battery shows early. Unplug and stop using it
  immediately if it swells. Use the original charger.

## Limits

- iPad 6 stays on iPadOS 17.7.x ([Apple forum](https://discussions.apple.com/thread/256228719)); use it for the
  dashboard on the home network only.
- HouseDash does not use the Wake Lock API; the screen stays on because of *Auto-Lock: Never*.
- Guided Access has no schedule for switching off at night.
- Microphone and speaker on the iPad have not been tested with the realtime voice.

Sources: [Guided Access as kiosk](https://help.virtualfrontdesk.com/en/article/ipad-kiosk-mode-guided-access),
[iPadOS kiosk mode](https://vizito.eu/faq/get-started/ios-kiosk),
[Keeping an older iPad safe](https://appleinsider.com/inside/ipad/tips/how-to-keep-an-older-ipad-safe-reliable-useful-over-time),
[Self-signed certificate and home screen apps](https://mifi.no/blog/ios-web-app-cache-manifest-self-signed-ssl-problem/).
