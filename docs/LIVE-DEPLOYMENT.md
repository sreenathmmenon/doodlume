# Doodlume live deployment

Primary URL: https://10xng--doodlume.us-east.modal.run

The complete Node/Python application runs on Modal using the existing credits. It retains original uploaded artwork, Meta Muse Spark Open through Fireworks, Meta SAM 2.1 cutouts, and LaMa background reconstruction. LaMa is a separate non-Meta model. This is a hosted application, with no dependency on a desktop tunnel.

## Release checklist — 4 November 2026

- [x] Linux container built on Modal; pinned CPU runtime, downloaded model checksum verification and build-time model loading passed.
- [x] Public HTTPS, production origin restrictions, health endpoints, single container.
- [x] Fireworks credential supplied only as a Modal runtime secret. Docker/deployment allowlists exclude local secrets, outputs, recordings and Git history.
- [x] Homepage and studio load; actual example gameplay completed, saved and reloaded.
- [x] Exported a completed example through the UI, imported it at the Modal origin, and confirmed completion after a full reload.
- [x] Fresh rough robot drawing generated on Modal in 66.769 seconds. Its untouched generated world was imported through normal backup UI with empty progress; keyboard movement, lever activation, jumping and destination completion were exercised successfully; save and full reload retained completion.
- [x] Fresh photograph processing exercised: returned recognition review after 116.754 seconds, without the previous host's memory crash. This was not automatic game completion.
- [x] Hosted phone pairing/upload/owner delivery and sender isolation exercised through actual HTTPS endpoints; private source and unrelated-origin requests rejected.
- [x] Final deployed UI phone-link closure verified: pairing 200, revocation 204, subsequent sender access 404.
- [ ] General unfamiliar-photo automatic creation and consistently compelling gameplay across inputs remain product work, not satisfied by deployment.
- [ ] Physical phone camera capture remains untested; the server exchange and QR interface have been tested.

## Hosting and resource boundaries

Modal app `doodlume-studio`, function `web`, profile/workspace `10xng`. Deploy definition: `scripts/deploy-modal.py`. Four CPU cores, 4 GiB reserved RAM, 8 GiB maximum, one container, up to 32 concurrent HTTP inputs. The application still permits only one generation at a time. The container scales down after ten idle minutes; a measured initial readiness request took 6.9 seconds. That is one observation, not a latency guarantee.

Supply `FIREWORKS_API_KEY` in the deployer's process environment using the existing private credential loader. The script creates a runtime Secret, not an image build argument. Modal authentication uses the user's private profile file. Do not paste credential values into command arguments, source, logs or documentation.

`PUBLIC_ORIGIN` comes from Modal's actual `web.get_web_url()` so generated phone links use the correct regional HTTPS origin. `PORT=8080` takes precedence over local `API_PORT`. Development remains bound to localhost; the production listener binds 0.0.0.0 behind platform TLS. No wildcard CORS is enabled. The Node service drops to the unprivileged `node` user even if Modal starts its Python entrypoint as root.

`/healthz` checks process liveness. `/readyz` checks the frontend, inference credential and local model files. Neither establishes provider credit availability, sufficient RAM or successful gameplay. The fresh input exercises above are separate evidence.

The 20-model-request allowance is per process, includes reserved calls, and resets when the container restarts. It is not a durable spending cap, authentication mechanism, per-user quota or unlimited public generation service. Keep one container until phone sessions and scheduling have shared storage. The staged planning experiment is disabled by default. Models load from the private image; weights are not downloaded per request. Do not publish the image or represent pretrained weights as cleared for commercial redistribution.

## Browser saves

Worlds and progress live in browser IndexedDB. A service restart does not delete them. Different origins, browsers and devices have separate libraries: export a backup from the old address and import at the primary URL. There is no account-based cloud sync. Phone links expire after ten minutes and need recreation after a container restart.

## Deployment findings and fixes

The temporary Railway trial service provided only 1 GiB memory. Two real photograph requests returned 502; the container's cgroup recorded an OOM kill in the SAM worker. Moving the complete pipeline to Modal preserved image quality rather than weakening extraction checks. Railway's temporary deployment was stopped after Modal was available; its project/history remain recoverable.

Modal's proxy rejected an empty-body DELETE for phone-link revocation with 415. An explicit JSON content type and `{}` body returns 204 and makes subsequent sender requests return 404. The frontend now sends that form; the final live UI recheck passed.

Railway recovery identifiers: project `06826daf-31fc-45ff-b28d-372f1b8e70f4`, environment `e3604d55-1302-41c0-b76c-de4ea252cf46`, service `cf8b7a98-efc2-4ee4-bdd7-c4381eb4f8b7`. Its address is not the primary launch URL and its 1 GiB trial configuration is unsuitable for this pipeline.

Application source baseline was `4e8350f`; this release adds Modal deployment and explicit phone-link revocation requests. Redeploy a known-good Git revision using the same Modal app definition to roll back. Do not delete browser libraries during rollback.

## Evidence

Local verification artifacts are ignored under `outputs/verification/live-deploy-2026-11-04/`. They include HTTP boundaries, phone exchange, actual fresh-input responses and durations, build logs and credential scan. Screenshots are under `output/playwright/`. No API keys are recorded in reports.

Before hosting: a 245-check run had two image-worker timeouts under concurrent local load; both affected files subsequently passed separately (54 checks). Three focused hosting/diagnostic checks passed after the logging change. Local type checking and cloud production builds passed. These are bounded verification results, not a universal production-quality rating.

Official references: [Modal web endpoints](https://modal.com/docs/guide/webhooks), [CPU and memory](https://modal.com/docs/guide/resources), [runtime secrets](https://modal.com/docs/guide/secrets).

## Photo pipeline follow-up

The next release corrects picture background writeback, gathers all failed moving outlines in one review, adds a bounded source-preserving design correction, and reuses extraction facts within one request. The exact-source raster test improved from 103,955 altered initial pixels to zero. The repaired generated photo activity was played through all four actions, saved and reloaded. Extraction replay improved from 10.057 seconds to 106 milliseconds; this does not remove hosted model latency. The staged planner remains opt-in; the service continues Fireworks/default planning. Fresh neutral-photo requests can still require review or reach the 120-second model deadline. See GAME-FEEL.md for the successful, failed and replayed runs without treating them as equivalent evidence.

Hosted follow-up verified on the released pipeline: fresh table photo with explicit fixed-mug/plant watering intent compiled in 35.353 seconds, played to completion, saved and reloaded. Readiness returned 200. The prior failed neutral-photo runs remain recorded; automatic unfamiliar-photo creation and stable model response time remain open quality gates.
