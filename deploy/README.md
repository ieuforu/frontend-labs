# Static deployment

The landing page and four labs are configured for the existing Caddy service at:

- [Home](https://labs.selena.ink/) (default entry)
- [Virtual List](https://labs.selena.ink/virtual-list/)
- [Task Slicer](https://labs.selena.ink/task-slicer/)
- [Thread Pool](https://labs.selena.ink/thread-pool/)
- Infinite Canvas: `/infinite-canvas/` (available after deploying this revision)

No application process, database or model API is required. Computation runs in
the visitor's browser. The VPS only serves static files.

## Build

Run checks first, then build and assemble the final site with its public path prefixes:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build:site
```

`build:site` builds `labs/home` at `/` and the four labs at `/virtual-list/`,
`/task-slicer/`, `/thread-pool/` and `/infinite-canvas/`. It assembles a complete deployment in root
`dist/`, including the hashed assets and Worker scripts. All navigation uses
these public paths. Individual lab dev servers only serve the current lab.

The script records the current Git commit in Virtual List exports. Build after
committing the source being deployed, or explicitly provide `VITE_SOURCE_REVISION`
when building a source archive without Git metadata. CI runs both `pnpm check`
and `pnpm build:site`.

Copy the contents of root `dist/` into a new release's `site/` directory. Keep
release metadata and checksums outside `site/`. Package root `dist/`, not the
individual lab build directories, which ordinary build commands can overwrite.

## Server layout

- Releases: `/srv/frontend-labs/releases/<commit>/site/`
- Active site: `/srv/frontend-labs/current`, a symlink to a release's `site/`
- Caddy include: `/etc/caddy/sites/frontend-labs.caddy`
- Site configuration: [Caddyfile](Caddyfile)

Upload locally built assets, verify checksums, then atomically replace `current`.
Install the Caddy include only on the first deployment or when its configuration
changes; validate the complete `/etc/caddy/Caddyfile` before reloading Caddy.
Preserve other sites and keep the prior release for rollback.

When updating from the original three-lab deployment, remove the old root-to-
Virtual-List redirect by installing the updated Caddy include. `/` now serves the
landing document directly. Root `/assets/*` uses the same immutable cache policy
as the lab asset directories; documents use `no-cache`.

The canvas asset prefix is included in the updated Caddy cache rules. Install
this include when deploying the fourth lab; keep document caching unchanged.

Thread Pool requires HTTPS and the COOP/COEP headers on both its document and
Worker assets. Keep the URL prefixes intact; `handle_path` would strip them.
There is no SPA fallback: missing scripts must return 404, not HTML.

## Verify and roll back

Verify all five HTTPS entries, navigation between pages, asset checksums/MIME
types and missing asset 404s. `/` must return the landing page with HTTP 200; lab
paths without a trailing slash must redirect to their directory URLs. Check that
Thread Pool reports cross-origin isolation and completes
successive Worker batches. Run a Virtual List comparison and confirm the exported
source revision. Confirm Task Slicer can run, prioritize and cancel work.
Check canvas panning, cursor-anchored zoom, marquee selection and group dragging;
verify page scrolling and navigation do not operate the canvas. Resize the window
and check that canvas coordinates still align with the pointer.

To roll back an update, atomically point `current` to the previous release's
`site/`. Static content updates need no Caddy restart. Restore the previous Caddy
include and reload only if the configuration changed. On first-install failure,
remove the new include from the import directory and reload the prior full
configuration; retain release files for diagnosis.
