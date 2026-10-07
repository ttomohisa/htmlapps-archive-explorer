# APP_SPEC.md — Archive Explorer

## Product

Archive Explorer is a local-first single-HTML archive inspector for Browser Kitty.

Primary promise:

> Inspect an archive before extracting it, understand where space is used, identify notable risks, and extract only what is needed.

## v1.0.0 supported formats

- ZIP: Stored (method 0), Deflate (method 8), including traditional ZipCrypto encryption
- 7z: single-folder / solid LZMA streams
- RAR5: Stored entries
- TAR
- GZIP
- TAR.GZ / TGZ
- CAB: uncompressed folders
- ISO 9660: including Rock Ridge names
- LZH / LHA: level 0 / `-lh0-`

Known unsupported / partial:

- AES-encrypted ZIP: metadata only / extraction unsupported
- Deflate64 and other ZIP methods: metadata only
- Large ZIP64 edge cases: partial
- 7z LZMA2, BCJ chains, multiple folders/coders: unsupported
- RAR4 and compressed RAR5: unsupported
- CAB MSZIP/LZX and compressed LZH methods: unsupported

## Trust boundary

- No user-selected file is uploaded.
- No runtime network request is allowed.
- Archive passwords are held only in JavaScript memory for the active archive and are never written to LocalStorage, SessionStorage, IndexedDB or export manifests.
- HTML/code inside archives is rendered as text, never executed.
- SVG is treated as text/code rather than rendered as active content.
- Safety findings are heuristic warnings, not malware verdicts.

## State

- `empty`: no source file.
- `processing`: detecting format, indexing entries, then analyzing structure / notes with visible progress.
- `ready`: entries available.
- `previewing`: selected entry is being decompressed for preview.
- `error`: source is invalid or unsupported.

Changing the source increments a generation token and invalidates stale async work. Opening a different top-level archive clears any cached archive password. Nested archives have separate in-memory password state; returning to a parent restores only that parent's in-memory state.

## Explorer

Desktop:
- left: compact hierarchical folder tree with disclosure controls, readable labels and descendant-file counts
- center: search/filter/sort/list with a contextual selection action bar
- right: Inspector with Preview / Details / Notes tabs
- left and right panes can be resized and collapsed at desktop widths

Smartphone:
- file list is primary
- selecting a file switches the Explorer area to Inspector
- Back returns to the list
- bottom bar provides Explorer / Analysis / Notes / Save

## Search / navigation

- Free-text search matches name/path within the current subtree.
- Query shortcuts: `*.ext`, `ext:js`, `>10MB`, `<500KB`.
- Additional filters: type, min/max size, encrypted-only, notes-only.
- Breadcrumb includes nested archive ancestry and folder ancestry.
- Supported nested ZIP / 7z / RAR5 / TAR / GZIP / CAB / ISO / LZH archives can be opened in place and returned from.
- Keyboard: Up/Down, Enter, Backspace, Space, Ctrl/Cmd+F.

## Analysis

Show:
- file count
- unpacked size
- packed size
- savings
- largest top-level folders/items
- type distribution
- drill-down Archive Map (folder-first, clickable hierarchy)

## Safety heuristics

Detect:
- path traversal (`../`)
- absolute paths
- executable/script extensions
- suspicious double extensions
- extreme per-entry compression ratio
- encrypted entries
- nested archives
- unsupported compression methods

## Duplicate candidates

For ZIP entries, group by `uncompressed size + CRC32`. Do not claim cryptographic identity.

## Capability status

- Archive header reports all-extractable, partial, or list-only.
- Unsupported, password-required, unlocked and unsupported-encryption states are visible without opening Inspector.
- Entry extraction controls are disabled only when extraction is unavailable. Supported encrypted ZIP entries remain actionable and request a password only when content is actually needed.

## Encrypted archive UX

- Traditional ZipCrypto ZIP entries are listed without asking for a password.
- Password dialog appears only when preview, extraction, multi-file export, Hex preview or nested-archive opening requires encrypted bytes.
- A successful password is cached only in memory for the current archive.
- Wrong passwords keep the flow in-place and allow retry.
- Cancel leaves the archive open and does not store a password.
- AES ZIP and other unsupported encryption schemes show a clear unsupported-encryption state instead of repeatedly prompting.

## Large-list virtualization

- File lists with 250+ visible results use fixed-row virtualization.
- Search, filtering, sorting, selection and keyboard navigation still operate over the full result set.
- Desktop and smartphone use different fixed row heights.

## Preview

Supported:
- common raster images
- text
- source code / markup as plain text
- unknown/binary files as a first-4-KiB Hex + ASCII dump with common magic-signature detection

Limits:
- images: 20 MiB
- text/code: 4 MiB
- no PDF iframe or active HTML execution

## Export

- one selected file: download original content
- multiple selected files: create a Store-only ZIP with UTF-8 paths
- manifest: JSON / CSV / TXT
- output filename is user-editable for manifest export

## Accessibility

- keyboard-accessible file chooser and controls
- visible focus
- reduced-motion support
- Japanese / English in one HTML
- The language button shows the target as EN / JA, with a localized action label and tooltip.
- The version badge uses `vMAJOR.MINOR.PATCH` and matches `app.config.json`.
- The privacy badge reads 完全ローカル処理 / Fully local processing.
- light-only appearance

## Interaction links

- Notes and duplicate candidates link back to the exact file in Explorer and clear conflicting filters so the target remains visible.
- Selecting files reveals a contextual extraction bar.
- File list headers sort name, size and compression ratio.
