# Changelog

## Unreleased

- New settings page *Mehr → Audio*: one place for microphone, speaker, volume and test tone, shared by the AI voice
  and the phone. At the wall display the devices come from the Pi (including HDMI); elsewhere from the browser.
- Calls at the Pi no longer crackle: the microphone is read with a steady buffer instead of the 0.5 ms buffer that
  NTgCalls asks the USB microphone for.
- Echo and noise suppression for calls at the Pi (WebRTC, switchable, about 20 % of one core during a call).
- The phone in a browser uses the devices chosen under Audio.

## 0.0.4 (2026-11)

- Fixed settings switches that showed a stray grey pill behind the label (clashing `.family-switch` rules).

## 0.0.3 (2026-11)

- Updates are downloaded in the background after each check; a manual install then skips the download.
- Optional switch *Updates automatisch installieren* (off by default): installs at night between 3 and 5 o'clock,
  never during a phone call.
- The updater finds new releases through the GitHub API instead of the cached `latest` redirect.
- Backup archives: `minimatch` in `readdir-glob` raised to 11 (GHSA-g3hv-75wg-m249).

## 0.0.1 (2026-11)

First release as **HouseDash** (previously developed as FamilyOS on top of Home Screens).

- Wall display (1536×960), tablet and phone layouts; three Home layouts.
- Calendar with day/week/month, recurrences, birthdays, automatic icons, Apple subscriptions and a private ICS feed;
  read-only event details with an edit button.
- Tasks, tram (Transitous), weather, DHT11 room sensor, bin collection, idle screen with photos.
- Family Brain voice and text assistant (OpenAI realtime or local Vosk/Piper) with confirmations and undo.
- Telegram phone; audio on the calling device or a headset on the Pi.
- Grouped settings with a list/detail layout.
- Signed updates from GitHub Releases with automatic backup and rollback; installer for new Pis.
- Removed the Home Screens editor, modules, translations and integrations that HouseDash does not use.
- Automatic migration of FamilyOS installations (volumes, services, settings).
