# Drishti

**Business Card Scanner & WhatsApp Automation**

Drishti is an internal mobile application for scanning business cards, extracting contact information, saving contacts, and sending personalized WhatsApp greetings.

## Features

- Business-card scanning using camera or gallery
- On-device OCR using ML Kit
- Contact information extraction and review
- Native contact saving
- Configurable greeting template and signature
- Direct/manual WhatsApp mode
- Automated WhatsApp mode
- No employee login required
- Secure per-installation identity
- Per-installation WhatsApp sessions
- Persistent WhatsApp connection restoration
- Android release build support

## Architecture

```text
Business Card
      |
      v
Camera / Gallery
      |
      v
On-device OCR
      |
      v
Extract Contact
      |
      v
Review / Edit
      |
      v
Save Contact
      |
      v
Personalized Greeting
      |
      +-----------------------+
      |                       |
      v                       v
 Direct Mode            Automation Mode
      |                       |
      v                       v
Open WhatsApp          Drishti Backend
      |                       |
      v                       v
Employee taps Send     Employee WhatsApp Session
                              |
                              v
                         Automatic Send
```

## Direct Mode

Direct Mode does not use the backend to send the WhatsApp message.

Drishti creates the personalized greeting and opens WhatsApp with the recipient and message prefilled. The employee completes the send manually.

The WhatsApp account installed on the phone is the sender.

## Automation Mode

Automation Mode sends the greeting through the Drishti backend.

The mobile application sends an authenticated request to the backend. The backend selects the WhatsApp session belonging to that installation and sends the message automatically.

There is no shared company WhatsApp sender. Each employee installation owns its own WhatsApp connection.

## Greeting

Both modes use the same configurable greeting template.

Example:

```text
Hi {name}, it was great connecting with you today.

Regards,
{sender}
```

The signature can be configured separately, for example:

```text
Spineverse Private Limited
```

## Installation Identity

Drishti does not require a username/password login.

On first launch:

1. The application generates a cryptographically random installation ID.
2. The installation is registered with the backend.
3. The backend returns an installation token.
4. The mobile application stores the credentials using `expo-secure-store`.
5. The backend stores only a SHA-256 hash of the token.

Authenticated requests use the installation ID together with a bearer token.

Installation tokens must never be logged or committed to Git.

Uninstalling the application or clearing application data creates a new installation identity unless a recovery mechanism is implemented later.

## WhatsApp Sessions

Automated WhatsApp functionality uses `whatsapp-web.js`.

Each installation has an isolated WhatsApp session.

Persistent state allows connected sessions to restore after backend/server restart without requiring normal re-pairing.

A manual Disconnect action intentionally disconnects the installation's WhatsApp session.

Sensitive runtime state is stored under:

```text
server/.drishti-data/
server/.wwebjs_personal_auth/
```

These directories must never be committed.

> `whatsapp-web.js` is an unofficial WhatsApp Web automation library and is not the official Meta WhatsApp Business Platform/API.

## Technology

### Mobile

- React Native
- Expo
- TypeScript
- ML Kit Text Recognition
- Expo Contacts
- Expo Image Picker
- Expo Image Manipulator
- Expo Secure Store
- Expo Crypto

### Backend

- Node.js
- Express
- whatsapp-web.js
- Puppeteer
- Persistent installation and connection stores

## Project Structure

```text
business-card-automation/
├── mobile/
│   ├── android/
│   ├── src/
│   │   ├── screens/
│   │   ├── services/
│   │   └── types/
│   ├── App.tsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── services/
│   │   └── store/
│   ├── index.js
│   └── package.json
│
├── README.md
└── .gitignore
```

## Mobile Setup

```bash
cd mobile
npm install
npx tsc --noEmit
```

For Android development:

```bash
npx expo run:android
```

Because ML Kit OCR uses native code, stock Expo Go is not sufficient for complete application testing.

A physical Android device is recommended for camera, OCR, contacts, SecureStore, and WhatsApp testing.

## Backend Setup

```bash
cd server
npm install
npm start
```

Development health check:

```bash
curl http://localhost:3000/health
```

For local Android USB development, ADB reverse can be used:

```bash
adb reverse tcp:3000 tcp:3000
```

ADB reverse is development-only and must not be required in production.

## Android Release

Android signing credentials are intentionally excluded from Git.

Never commit:

```text
mobile/release-keys/
*.jks
mobile/android/local.properties
```

Release signing credentials must be supplied securely through the local build environment.

Release build:

```powershell
cd mobile\android
.\gradlew assembleRelease
```

## Production Deployment

Production hostname:

```text
https://drishti-spineverse.duckdns.org
```

Planned deployment architecture:

```text
Android App
     |
   HTTPS
     |
     v
drishti-spineverse.duckdns.org
     |
     v
   Nginx
     |
     v
127.0.0.1:3100
     |
     v
Drishti Backend
     |
     v
Per-installation WhatsApp Sessions
```

The Drishti backend is intended to run independently from other applications on the VPS.

Planned deployment directory:

```text
/opt/drishti
```

Planned PM2 process:

```text
drishti-backend
```

The Node.js backend should be exposed through Nginx/HTTPS rather than exposing its internal application port publicly.

## Persistent Production Data

These directories contain runtime state that must survive normal application deployments:

```text
server/.drishti-data/
server/.wwebjs_personal_auth/
```

They must not be stored in GitHub.

Only one active backend should use a particular copied WhatsApp LocalAuth session at a time.

## Git Security

The following must remain outside source control:

```text
server/.drishti-data/
server/.wwebjs_auth/
server/.wwebjs_cache/
server/.wwebjs_personal_auth/

mobile/release-keys/
*.jks
mobile/android/local.properties

BACKUP_*/
*.before-*
STEP*.txt
DRISHTI_*_AUDIT*.txt
```

Never commit passwords, tokens, private keys, installation credentials, WhatsApp authentication files, Android signing credentials, or VPS credentials.

## Automated Media

A phone-local URI such as:

```text
file://...
```

cannot be fetched directly by a remote VPS.

Automated media therefore requires an authenticated upload mechanism or a validated HTTP(S) resource accessible to the backend.

Remote media handling should include size/type validation and SSRF protection.

## Production Hardening

Before larger-scale deployment, verify:

- HTTPS-only external communication
- installation authentication
- rate limiting
- request/body size limits
- persistent runtime storage
- controlled logging and log rotation
- graceful shutdown
- startup session recovery
- bounded session restoration concurrency
- per-installation lifecycle locking
- duplicate-send protection
- SSRF protection for remote media
- PM2/system startup recovery
- backup and recovery procedures

Do not blindly retry an uncertain WhatsApp `sendMessage()` operation because doing so can generate duplicate messages.

## Capacity

Automated WhatsApp sessions are substantially heavier than normal API connections because WhatsApp Web/Puppeteer browser resources are involved.

The production server must therefore be capacity-tested before deploying dozens of concurrent employee sessions.

## Verification Status

The Android application has been tested end-to-end locally on a physical device.

Verified:

- business-card image acquisition
- OCR
- contact extraction and review
- contact saving
- greeting personalization
- Direct Mode
- Automation Mode
- actual automated WhatsApp message delivery
- persistent WhatsApp session restoration after backend restart
- installation identity persistence

Current milestone:

**Local Android Direct Mode and Automation Mode are end-to-end verified.**

Next milestone:

**Deploy the isolated backend behind HTTPS and verify the Android application against the production endpoint without ADB reverse.**