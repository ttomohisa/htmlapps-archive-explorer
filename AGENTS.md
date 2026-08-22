# AGENTS.md — Archive Explorer

Read `APP_SPEC.md` before editing.

Non-negotiable constraints:
- release remains a single self-contained HTML
- no runtime CDN / API / analytics / telemetry
- `connect-src 'none'`
- light-only UI
- Japanese and English in one HTML
- smartphone and desktop are both first-class
- edit `src/index.template.html`, then rebuild `dist/`
- keep archive content inert: never execute extracted HTML / JS / SVG
- changing the selected source invalidates stale async work
- run `scripts/check-repository.ps1` before completion
