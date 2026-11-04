# Doodlume live deployment

Primary URL: https://doodlume-production-9df2.up.railway.app

Modal backup: https://10xng--doodlume.us-east.modal.run

The complete Node/Python application now runs in the owner’s existing Railway account; the Modal deployment remains available as a backup. It retains original uploaded artwork, Meta Muse Spark Open through Fireworks, Meta SAM 2.1 cutouts, and LaMa background reconstruction. LaMa is a separate non-Meta model. This is a hosted application, with no dependency on a desktop tunnel.

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

## Modal backup and resource boundaries

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

## Correct Railway account — 4 November 2026

The CLI was reauthenticated as `sreenathmmmenon@gmail.com`. The account contains the owner’s existing projects. The Railway connector still identifies the newly created `zreenathmenon@gmail.com` account, so all operations for this release used the corrected CLI session with explicit project/service/environment IDs. Do not use the connector for this project until its account is reconnected.

- Workspace: `Sreenath's Projects`, `dd6999e0-b89d-4c0f-9bb1-3c3b78fe48c1`.
- Project: `doodlume`, `e4a2daf4-a02f-4168-9c13-b67feb894787`.
- Production environment: `70591b5b-bbb8-42f5-ac82-87c30bd82bec`.
- Service: `5cbe59a9-ec02-465a-be75-a08b5f9c9c69`.
- Successful deployment: `79fe8438-feca-466e-a05c-5fea638f7e14`, source `3b478e8`.
- Public URL: https://doodlume-production-9df2.up.railway.app.
- Existing Hobby plan; no subscription upgrade. Resource limits explicitly set and read back as 4 CPUs and 8,000,000,000 bytes RAM; one replica, readiness check `/readyz`.
- Runtime Fireworks credential supplied through stdin. Production origin is the new Railway HTTPS address. Local credentials and verification artifacts remain excluded from the upload context.

Railway's GitHub app currently rejects access to private repository `sreenathmmenon/doodlume`. This release uses a direct CLI source upload; GitHub autodeploy is **not** configured. Grant repository access to Railway's GitHub integration before claiming future pushes deploy automatically. Existing unrelated services and projects were not modified.

The first unconfigured upload crashed because required hosting configuration had not yet been supplied. The configured deployment built successfully, passed its readiness probe, and serves the homepage and APIs. Hosted phone pairing/upload, owner delivery, sender isolation, revocation and unrelated-origin/private-source rejection passed. Fresh rough robot drawing generation completed on Railway in 50.688 seconds with actual Meta inference, local SAM and background reconstruction. The returned world was imported normally with empty progress, played by keyboard through lever activation, gate opening, jumping and star completion, saved and fully reloaded with completion intact. No game state was injected. Deployment status is SUCCESS.

Local evidence is ignored under `outputs/verification/railway-correct-account-2026-11-04/`. Saved worlds remain per origin: export from the Modal or local studio and import at the Railway address to retain artwork and progress.


## Compact photo planning release — 4 November 2026

Deployment `5be03fe6-0250-4ca5-9e84-a10628832665` reached **SUCCESS** on the correct Railway project/service above. `PHOTO_PLANNING=compact` was read back after deployment. The Modal backup remains unchanged. This release separates physical inventory from game design, supplies actual source/geometry facts, preserves original lossless artwork while sending smaller model-only images, and bounds planning calls/body reads within the shared request budget. See `GAME-FEEL.md` for retained failures and limitations.

- [x] Typecheck, frontend build and 97 focused regression checks passed.
- [x] Credential scan passed; provider values remain absent from tracked files/staged blobs/browser build.
- [x] Hosted readiness, liveness and homepage returned 200; private environment/source paths returned 404; unrelated Origin returned 403.
- [x] Fresh public bookshelf photograph, empty studio-default intent: actual hosted creation returned 200 in **33.017 seconds**, with no outline review. Its generated source-detail investigation was completed using normal controls, saved and fully reloaded with completion intact.
- [x] Local final photo runs compiled toy vehicles, carpentry, vegetables and table scene in 20.742, 35.095, 42.383 and 62.541 seconds respectively. Requests differ as recorded; these are individual observations, not a benchmark success rate.
- [ ] Universal unfamiliar-photo creation and consistent generation latency remain open. Occluded/misrecognized subjects may require user correction. Rich automatic roleplay and strategy are not established by source-detail investigations.

The previous global photo limitations remain deliberately unchecked. A smaller or bounded failed request is never counted as a playable game.

Explicit-object-play hosted regression: “Use the red mug to water the potted plant” returned 200 in **24.622 seconds**, with no outline review and the requested transfer action preserved. The generated fixed mug transfers a game water quantity to the pictured pot; it does not move the photograph, simulate liquid or grow the plant. The action was completed through normal source/target controls, saved and fully reloaded with completion intact. This verifies that the compact route does not force an explicit interaction request into an investigation.


## Source-supported interactions and bounded busy recovery — 4 November 2026

Deployment `31b99731-176c-41e9-a9a1-ff4dc47f722b` reached **SUCCESS** on the same correct-account Railway service. The cloud image passed type checking and the frontend build. Final local verification passed **283/283** regression checks, typecheck and credential scan. Live readiness, liveness and homepage returned 200; environment/source paths returned 404; unrelated-origin API access returned 403. No frontend, persistent-world, editing, gameplay-control, import or storage format was changed. The previously completed rough-robot game reopened and retained completion after a full browser reload on this release.

This release removes exact duplicate segmentation contexts without accepting weaker masks, uses explicit ordered collect/finish steps for investigation planning while retaining legacy response decoding, and favors genuine compatible resource actions when a neutral photographed scene supports them. It introduces one same-payload busy retry only after an explicit HTTP 503, bounded by the existing deadline and paid-attempt quota. Numeric-only model-call timings exclude prompts, images, raw responses and credentials. Fireworks priority remains off; no billing-tier or worker-model configuration was changed.

The fresh robot generation that requested outline review was replayed against both old and new extraction code using identical source/geometry. Both rejected it; an unsafe crop-bound change was rejected rather than shipped. The old saved game remains playable, but this does not make fresh drawing recovery universal. See `GAME-FEEL.md` for accepted and rejected experiments and remaining quality gates.


Final hosted result on deployment `31b99731-176c-41e9-a9a1-ff4dc47f722b`: the unchanged neutral request on the real watering photo returned **200 in 51.866 seconds**, with no outline review. Its generated can-to-pot transfer was completed through the normal source/target/action controls, saved after the save finished, and fully reloaded with completion intact. The action changed game water quantities from can 3/pot 0 to can 0/pot 3; it did not move or repaint the photo. The untouched generated world was imported with empty progress; no response or progress values were injected. This establishes one fresh hosted source-grounded interaction, not general deep gameplay or universal photo reliability.

## November 4 product experience release

Source `119f8d8` deployed to the same correct-account service as deployment `7cea4658-54ca-4d42-89d2-260691523f03`, which reached **SUCCESS**. No runtime secret or resource-limit change. Health, readiness, homepage and the new photo example returned200; environment/source paths returned404; an unrelated-origin API request returned403. The existing saved Patio Succulent Watering completion survived a full hosted reload.

Fresh hosted verification uploaded a different bathroom photograph through the normal form with the intent “Use the faucet to fill the bathtub. Keep the photo recognizable and finish when the tub is full.” `/api/interpret` returned200 in **46.910 seconds**, without outline review. The generated fixed-faucet→basin action changed authored game-water quantities, completed normally, saved after the save finished, and retained completion after full reload. No generated response or game progress was injected. It does not animate photographed water, fill real pixels or bathe the dog. See `PRODUCT-POLISH-VERIFICATION-2026-11-04.md` for the broader local verification and retained generation failures.
