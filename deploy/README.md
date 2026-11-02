# Static deployment

The three labs are served by the existing Caddy service at:

- [Virtual List](https://labs.selena.ink/virtual-list/) (default entry)
- [Task Slicer](https://labs.selena.ink/task-slicer/)
- [Thread Pool](https://labs.selena.ink/thread-pool/)

No application process, database or model API is required. Computation runs in
the visitor's browser. The VPS only serves static files.

## Build

Run checks first, then build the final assets with their public path prefixes:

```sh
pnpm install --frozen-lockfile
pnpm check
VITE_SOURCE_REVISION=$(git rev-parse HEAD) pnpm --filter virtual-list-lab exec vite build --base=/virtual-list/
pnpm --filter task-slicer-lab exec vite build --base=/task-slicer/
pnpm --filter thread-pool-lab exec vite build --base=/thread-pool/
```

`pnpm check` and ordinary build commands use `/` as the base and would overwrite
these artifacts. Do not run them after the final prefixed build when packaging.

Copy each `labs/<name>/dist/` into the matching `<name>/` directory under a new
release's `site/` directory. Keep release metadata and checksums outside `site/`.

## Server layout

- Releases: `/srv/frontend-labs/releases/<commit>/site/`
- Active site: `/srv/frontend-labs/current`, a symlink to a release's `site/`
- Caddy include: `/etc/caddy/sites/frontend-labs.caddy`
- Site configuration: [Caddyfile](Caddyfile)

Upload locally built assets, verify checksums, then atomically replace `current`.
Install the Caddy include only on the first deployment or when its configuration
changes; validate the complete `/etc/caddy/Caddyfile` before reloading Caddy.
Preserve other sites and keep the prior release for rollback.

Thread Pool requires HTTPS and the COOP/COEP headers on both its document and
Worker assets. Keep the URL prefixes intact; `handle_path` would strip them.
There is no SPA fallback: missing scripts must return 404, not HTML.

## Verify and roll back

Verify all three HTTPS entries, redirects, asset checksums/MIME types and missing
asset 404s. Check that Thread Pool reports cross-origin isolation and completes
successive Worker batches. Run a Virtual List comparison and confirm the exported
source revision. Confirm Task Slicer can run, prioritize and cancel work.

To roll back an update, atomically point `current` to the previous release's
`site/`. Static content updates need no Caddy restart. Restore the previous Caddy
include and reload only if the configuration changed. On first-install failure,
remove the new include from the import directory and reload the prior full
configuration; retain release files for diagnosis.
