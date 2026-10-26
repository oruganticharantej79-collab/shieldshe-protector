# ShieldShe Protector — first working PWA prototype

This is a responsive web app/PWA starter. It includes:
- Mobile-friendly safety dashboard
- Simulated voice fake call using the browser's speech synthesis
- SOS and check-in message preparation (the user must review/send; no automatic dispatch)
- Trusted contacts saved locally in the browser
- User-selected Low / Moderate / High risk guidance
- Nearby mapped public facilities using OpenStreetMap / Overpass
- Google Maps directions links
- PWA manifest, service worker and install prompt

## Run locally
Because location and service workers require a secure context, use localhost rather than opening `index.html` directly.

With Python installed:
```bash
python -m http.server 8000
```
Then open http://localhost:8000

## Publish publicly
1. Create a GitHub repository and upload all files in this folder.
2. In repository Settings → Pages, deploy from the main branch / root folder; or deploy the folder to Netlify or Cloudflare Pages.
3. Open the generated HTTPS URL on your phone.
4. Android Chrome may show “Install app”; on iPhone Safari use Share → Add to Home Screen.
5. Test location permission, voice playback, map lookup, SMS links and installation on real devices.

## Important limitations before a real-world launch
- This is a prototype, not a certified emergency service. SOS does not automatically call police or dispatch help.
- Browser SMS links open the user's messaging app; the user must press Send. A browser cannot silently send SMS.
- Trusted contacts are stored in local browser storage and do not sync between devices. Do not use this prototype to store sensitive information on a shared device.
- The fake call is an on-screen simulation with spoken text, not an actual incoming cellular call. Speech synthesis voice and availability vary by browser/device.
- Nearby places come from OpenStreetMap/Overpass and may be incomplete or stale. It does not verify opening hours, safety, accessibility, or crime risk.
- Low/Moderate/High are user self-assessments, not live risk scores. No route is certified safe.
- The map, fonts and place search need internet. Browser location requires user permission and HTTPS (or localhost).
- Before a production launch, add secure backend storage, account/authentication if needed, consent and privacy policy, abuse prevention, monitoring, backups, and real-device security testing. Never promise emergency response without a dependable service integration.
