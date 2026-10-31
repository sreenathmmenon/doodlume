# Capture and guided page alignment — October 31, 2026

This increment completes the browser-to-browser capture and guided correction flow. It advances the original capture/update milestones; it does not establish physical-camera reliability or complete live Meta interpretation.

## Delivered

- A QR/link pairing flow for first drawings and revisions bound to the selected world ID and revision.
- A small separate phone page: take/choose a photo, rotate, preview, send, and see delivery confirmation. A failed send retains the photo for retry; sends time out after 30 seconds.
- A connection accepts one drawing, expires after ten minutes, and can be revoked. The sender can upload only; a separate owner capability receives the image. The server holds pairing data only in memory, with hashed capabilities. The phone capability stays in the URL fragment rather than the server request URL. Retry identifiers cannot overwrite a previously received drawing.
- Wi-Fi mode starts an opt-in capture-only server on the next port. The studio remains on loopback; the phone gateway serves capture assets and authorized upload/status routes only. Model APIs, owner APIs, arbitrary file routes, and unrecognized hosts/origins are rejected. It closes after the last connection is revoked or expires. The feature requires a built studio and an IPv4 local network; no public hosting or HTTPS service was configured.
- Local preview pairing tests the same capture and owner delivery path without enabling a network listener.
- Guided four-corner selection, numeric/keyboard corner adjustment, rotation, page shape selection, projective perspective correction, and bilinear sampling in a worker. Crossed, collapsed, or out-of-bounds corner selections are rejected. Updates lock the output aspect ratio to the current source page.
- Before/after review and explicit acceptance. Raw photos can also be used unchanged. Import and revision flows preserve their prior state when correction is cancelled.
- The capture page loads separately from the game scene; it does not eagerly load Phaser.

## Verification

- Sixteen focused checks pass: the existing twelve plus two geometry/pixel checks and two capture authorization/lifecycle/gateway checks. These include exact corner mapping, unchanged-pixel preservation, perspective sampling, sender/owner separation, session binding, expiry, idempotency, closed-session late upload rejection, real PNG normalization, and inaccessible model/owner routes on the capture gateway.
- TypeScript and the production build pass after integration and dependency updates.
- Two-browser capture: created a pairing, opened its actual capture page, selected a synthetic tilted drawing through the real file chooser, sent it, and received it in the owner studio. Guided correction produced an accepted 1440 × 820 first-drawing source. Both browser consoles were clear.
- Revision capture: opened the saved version-3 world with two collected sunseeds, paired a revised capture, and received the drawing in that update flow. Correction matched the existing page at 1440 × 935. Accepting the corrected photo into the pending update and then cancelling left the authored page and two collected sunseeds unchanged.
- The phone capture UI and final alignment review were inspected at 390 × 844. The alignment document width stayed at 390 pixels with no horizontal overflow. Before/after cards were visible with acceptance controls after automatic scrolling. Cancelling first-drawing alignment left the original example source unchanged. Final browser console checks were clear.

The perspective fixture is explicitly synthetic, with known page corners. It is not a physical camera photo or a model result. Test scripts and screenshots are outside the repository; no active pairing capability is committed.

## Dependency maintenance

Added local QR encoding with qrcode 1.5.4. Updated the existing image decoder to sharp 0.35.5 and static serving to @fastify/static 10.1.8 for fixes relevant to accepting images and serving the gateway. The focused tests and build pass with those versions. The production dependency audit reports no high/critical findings; a moderate minimatch/glob amplification advisory remains in the static-server dependency chain. This application does not accept user-provided glob patterns. Review upstream fixes before internet hosting; no incompatible forced downgrade was applied.

## Still to verify

- An actual phone camera, QR scan, same-Wi-Fi connectivity, operating-system firewall behavior, and interrupted real-device uploads. Browser viewport checks are not substitutes for those trials.
- Several real photographs with shadows, blur, curved paper, and different lenses. Guided planar correction is not automatic page detection, lens calibration, nonrigid registration, or semantic object matching.
- Live original-drawing creation and paper comparison through Meta. No key is configured and no provider inference was performed in this increment.
- The agreed 5–20 unfamiliar drawing pairs and the remaining craft/final-video milestones.

Run the built studio with `npm run studio`, open **Use phone camera**, and choose **Connect on Wi-Fi** when ready for a real-device trial. Keep both devices on the same network. Camera selection uses the browser's file-capture hint; support and behavior vary by mobile browser. Upload remains available.

References: [HTML media capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture), [local QR encoder](https://github.com/soldair/node-qrcode), [Fastify static compatibility](https://github.com/fastify/fastify-static#compatibility), and [sharp installation](https://sharp.pixelplumbing.com/install/).
