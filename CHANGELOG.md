# Changelog

## 1.0.1 - 2026-10-07

- Standardize the privacy badge as 完全ローカル処理 / Fully local processing.
- Keep EN / JA language targets and add localized accessible action labels and tooltips.
- Synchronize the displayed semantic version with the release configuration.

## 1.0.0 - 2026-08-23

First stable release of Archive Explorer.

### Highlights

- Inspect archives locally before extracting files to folders.
- Browse ZIP / 7z / RAR5 / TAR / GZIP / CAB / ISO / LZH archives in a single-HTML Browser Kitty app.
- Use a three-pane desktop Explorer with a compact folder tree, sortable file list and Inspector tabs.
- Search with patterns such as `*.png`, `>10MB` and `ext:js`, plus filters for size, encryption and notes.
- Preview images, text, code and unknown binaries with a 4 KiB Hex view and magic-signature detection.
- Visualize archive structure with Archive Map, type distribution and size analysis.
- Detect notable findings such as path traversal, absolute paths, executable/script files, double extensions, extreme compression ratios, encryption and nested archives.
- Open supported nested archives in place and return to the parent archive.
- Extract individual files or package multiple selected files into a new ZIP.
- Export JSON / CSV / TXT manifests.
- Show extraction capability status for the current archive and for each entry.
- Virtualize large file lists for smooth browsing while keeping full-result search, sort and keyboard navigation.
- Prompt for a password only when needed for traditional ZipCrypto ZIP entries; keep it in memory only until the current archive is closed.
- Keep all processing local in the browser with runtime network access blocked by CSP.
