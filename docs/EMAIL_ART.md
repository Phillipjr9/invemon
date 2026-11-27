# Branded email illustration collection

All eight transactional email designs share the homepage logo icon, rasterized from the original Wordmark geometry, and have distinct dimensional illustrations:
welcome envelope, sign-in shield/portrait, password-change padlock/check, support conversation bubbles, saved desktop workspace, preview gift, verification shield/check, and recovery padlock/key.

The PNG artwork is rendered locally with Pillow using `scripts/render-email-collection.py`. No external asset service or runtime Python dependency is required. Rasterized illustrations work without scripts, SVG support, animation, or WebGL. Alt text and HTML/plain-text content preserve the meaning when images are blocked. The original envelope animation remains in the asset archive but is no longer used by these templates.

`npm run emails:preview` generates all eight fictional specimens. Verification and recovery preview buttons return to the studio instead of consuming a token. Real delivery uses the same renderer with the actual single-use link. Notification event types remain restricted to the original six; reset and verification keep their separate secure token flow.

Browser check: `TEST_BASE_URL=http://localhost:5186 node scripts/verify-email-branding.mjs` (start Vite first; optionally specify CHROMIUM_EXECUTABLE_PATH). This checks rendered image decoding and mobile email overflow, not live email-client delivery. Real Outlook/Gmail/Firefox and inbox delivery remain operator verification steps after deployment.
