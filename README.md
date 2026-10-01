# Business Card Scanner + WhatsApp Engine

## Important architecture notes

- OCR is on-device with `@react-native-ml-kit/text-recognition`.
- This native OCR module is not usable in stock Expo Go. Build a native Expo development client / prebuild.
- Direct WhatsApp mode opens WhatsApp with recipient + prefilled text. The user completes the send.
- Direct URI mode does not reliably pre-attach a local image to a specific recipient.
- Automated mode sends text and optional media through a separate `whatsapp-web.js` process.
- `whatsapp-web.js` is an unofficial WhatsApp Web automation library. Treat it as an optional internal automation engine, not as an official WhatsApp Business API replacement.
- The automated server must not be exposed unauthenticated to the public internet.
- A local `file://` URI from the phone cannot be fetched by a different server. Automated media must be a URL reachable by the server, or the API must later be extended to accept an authenticated upload.
- `expo-image-manipulator` performs resize/JPEG normalization here. It does not expose a contrast adjustment primitive.

## Mobile setup

Requires Node.js compatible with the selected Expo SDK, Android Studio for Android, and Xcode/macOS for iOS.

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor
npx expo prebuild --clean
```

Android:

```bash
npx expo run:android
```

iOS (macOS only):

```bash
npx expo run:ios
```

After the native development build exists:

```bash
npx expo start --dev-client
```

Use a real phone for contact, camera, WhatsApp, and LAN server testing.

## Server setup

```bash
cd server
npm install
npm start
```

On first launch, scan the terminal QR with the WhatsApp account used by the engine. `LocalAuth` persists the session under `.wwebjs_auth`.

For basic LAN development the API key can be omitted. For any shared network, set an API key and add the same header support to the mobile client before use:

Windows PowerShell:

```powershell
$env:API_KEY="replace-with-a-long-random-secret"
npm start
```

macOS/Linux:

```bash
export API_KEY="replace-with-a-long-random-secret"
npm start
```

Check:

```bash
curl http://localhost:3000/health
```

## Recommended production hardening

1. Put the engine behind authenticated HTTPS or a private VPN.
2. Add rate limiting, idempotency keys, audit logs, request IDs, and a send queue.
3. Never expose `.wwebjs_auth`; protect and back it up securely.
4. Add duplicate-contact detection before insertion.
5. Add parser confidence and a mandatory human verification gate.
6. Add retry policy only for transient failures; do not blindly resend.
7. Add server-side media size/type limits and SSRF protection before accepting arbitrary URLs.
8. Add unit tests for international phone numbers and OCR/parser edge cases.
9. Verify the OCR native package against the exact Expo/RN native architecture before store release.
10. Review WhatsApp terms and platform/app-store requirements for your intended deployment.
