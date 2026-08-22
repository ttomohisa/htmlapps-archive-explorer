# Security

Archive Explorer is designed for local-only inspection.

- Files are not uploaded.
- Runtime network access is blocked with `connect-src 'none'`.
- HTML, JavaScript and SVG from archives are not executed.
- Archive entry paths are never written directly to the local filesystem by path.
- Multi-file export creates a new ZIP using sanitized browser downloads.
- Opening a nested archive only parses bytes already extracted in browser memory; it does not execute embedded content or make network requests.
- Archive passwords are never persisted. A successful password is held only in JavaScript memory for the active archive and is cleared when the archive is replaced or closed. Password fields are cleared when the dialog closes.
- Traditional ZipCrypto decryption is performed locally in browser memory. AES-encrypted ZIP and unsupported encrypted archive methods are not silently attempted.

The built-in Notes view only performs heuristic checks. It is not an antivirus scanner and must not be presented as a malware verdict.
