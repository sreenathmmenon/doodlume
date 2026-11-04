# Doodlume live deployment

Deployment preserves the current application, the original uploaded artwork, Meta Muse Spark Open through Fireworks, Meta SAM 2.1 cutouts, and the existing LaMa background reconstruction. LaMa is a separate non-Meta model. The first target is one Railway service running the complete Node/Python container; no static-only substitute and no desktop tunnel.

## Release checklist

- [x] Hosted port and binding, exact HTTPS origin/Host boundary, internal health probes.
- [x] Server-only provider credentials; allowlisted Docker and deployment contexts exclude local credentials, outputs, recordings and Git history.
- [x] Container recipe installs pinned CPU model runtime and verifies downloaded model checksums. Build-time model loading is required before the image can succeed.
- [x] Hosted phone pairing uses the same HTTPS address, keeps separate owner/sender tokens, and does not open a private LAN listener.
- [x] Existing IndexedDB saving, backup import/export and local-only operation retained.
- [ ] Linux container built successfully on the deployment host.
- [ ] Runtime Fireworks secret configured securely through stdin; never in source, build arguments, image layers, browser bundle or logs.
- [ ] Single replica, generation allowance, health check and public HTTPS domain configured.
- [ ] Live fresh drawing and photo generation; inspect source art, actions, completion and latency.
- [ ] Live desktop play, save/reload, backup import/export and phone capture verified.
- [ ] Release URL and exact deployed revision recorded; rollback revision retained.

## Hosting configuration

`PUBLIC_ORIGIN` is one HTTPS origin, or the Railway-provided `RAILWAY_PUBLIC_DOMAIN` supplies it. `PORT` takes precedence over the existing local `API_PORT`. Without a public origin, development still binds to 127.0.0.1; production refuses to start. The deployment listener binds 0.0.0.0 behind the hosting service's TLS endpoint. No wildcard CORS is enabled.

`/healthz` reports process liveness. `/readyz` checks the built frontend, inference credential, local cutout runtime files and LaMa weights. These two read-only endpoints accept internal platform probes; all other routes retain exact Host/Origin checks. Readiness does not claim provider credit availability or completed gameplay. Those require the live exercise below.

Set `MODEL_PROVIDER=fireworks`, `FIREWORKS_API_KEY` through the host secret interface, and an explicit `MAX_MODEL_REQUESTS`. The current safeguard is per process and includes reserved inference calls; it resets on restart. It is not a durable billing ledger, per-user quota, authentication mechanism or unlimited public generation service. Keep one replica until request scheduling and phone-pairing state have a shared durable store. The staged generation experiment remains disabled.

The container runs as the unprivileged node user. Its CPU models are installed during the private build, never fetched while handling a user's upload. Do not publish the container image or redistribute pretrained weights as commercially cleared; see the existing source-background provenance document. Image processing has bounded input sizes and timeouts. CPU hosting performance must be measured, not inferred from Mac results.

## Saved worlds and deployment changes

Worlds and progress are saved in the browser's IndexedDB, not in the service filesystem. A service restart preserves that browser data. A different origin, browser or device has a separate library: export a backup from localhost and import it at the live URL. There is currently no account-based cloud sync. Phone pairing is temporary process memory, expires after ten minutes, and needs a new link after a service restart.

## Verification and rollback

After the build and readiness check succeed, open the actual HTTPS URL and verify: homepage/assets; one backup import and actual completion; save/reload; real image interpretation and source correction; a phone sender/owner exchange; rejection of unrelated Origin/Host requests; no secrets in delivered scripts. Log actual durations and defects. A successful health response alone is not a launch pass.

Record project, environment, service and deployment IDs without credentials. Roll back to the preceding successful deployment if a live acceptance check regresses. The browser library remains independent of service rollback; do not delete or migrate it for deployment.

Official hosting references: [Docker builds](https://docs.railway.com/builds/dockerfiles), [deployment health checks](https://docs.railway.com/deployments/healthchecks). Configuration is applied to the service directly; new deprecated railway.json/toml configuration is deliberately not introduced.
