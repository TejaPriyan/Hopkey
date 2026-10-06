# Security Policy

## Reporting a Vulnerability

Security is a core focus of HOPKEY. Because HOPKEY operates without accounts, central databases, or server-side file storage, user privacy is designed into the architecture.

If you believe you have discovered a security vulnerability in HOPKEY, please report it responsibly:

- **Email**: Reach out directly to [teja1616150@gmail.com](mailto:teja1616150@gmail.com)
- **Subject**: `[SECURITY VULNERABILITY] HOPKEY`
- Please provide details on the nature of the issue and steps to reproduce.
- Allow reasonable time for response and remediation before any public disclosure.

## Security Architecture

- **Direct WebRTC (Mode A)**: Direct peer-to-peer data channel secured with standard WebRTC DTLS encryption. Signalling servers only exchange initial SDP offers/answers and never touch payloads.
- **Offline QR Streams (Mode B)**: Data travels solely via photons from screen to camera. Optional AES-256-GCM encryption with PBKDF2 key derivation (150,000 iterations).
- **Integrity**: Every transfer verifies file hashes using incremental SHA-256 checks before finalizing.
- **Local-Only**: Data never hits third-party clouds or external databases.
