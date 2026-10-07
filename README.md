# HOPKEY

> Hop text, links, images and files directly between devices. **No accounts, no API keys, nothing stored on a server.**

**Live Web App:** [https://hopkey.vercel.app/](https://hopkey.vercel.app/)  
**GitHub Pages Mirror:** [https://tejapriyan.github.io/Hopkey/](https://tejapriyan.github.io/Hopkey/)

[![Live App](https://img.shields.io/badge/Live%20App-hopkey.vercel.app-blue.svg?logo=vercel)](https://hopkey.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready-success.svg)](https://vite-pwa-org.netlify.app/)
[![Zero Cloud Storage](https://img.shields.io/badge/Cloud%20Storage-Zero%20Bytes-brightgreen.svg)](#security--privacy)

---

## Overview

**HOPKEY** is a lightweight, privacy-first data transfer progressive web application designed for fast, frictionless sharing between devices. Whether transferring multi-gigabyte video files between laptops on the same Wi-Fi, or beaming encrypted passwords and notes across air-gapped devices via animated QR streams, HOPKEY handles the transfer directly with zero intermediary server storage.

---

## Transfer Modes

| Mode | Transport | Network Requirement | Ideal For |
|---|---|---|---|
| **A. Online Code** | Direct WebRTC DataChannel (PeerJS) | Internet required only for initial peer signaling | Transfers up to 2 GiB total (current limit), multi-file folders, images, archives |
| **B. Offline QR** | Animated fountain-coded (LT) QR stream | Completely offline / Air-gapped (after initial app load) | Notes, URLs, passwords, small images, air-gapped devices |
| **C. Instant QR** | Single static QR with URL fragment payload | Fully local decoding | Text snippets and links under 1 KB |

---

## Key Features

- **Zero Cloud Storage**: Payloads travel exclusively peer-to-peer or camera-to-screen. Data never hits a database or cloud bucket.
- **No Sign-Up or Accounts**: Simply compose your payload, create a code or QR, and receive instantly.
- **Cryptographic Integrity**: Every file is verified with incremental **SHA-256** checksum verification before being finalized on the receiving device.
- **Air-Gapped & Airplane Mode**: Offline QR fountain mode works seamlessly without internet connectivity or local network access.
- **Single-Use & PIN Protection**: Online codes expire after 10 minutes, default to single-use, and can require an optional 4-digit PIN with brute-force lockout.
- **Camera Scanner & Image Upload**: Built-in QR scanner with automatic hardware fallback, image/screenshot upload, drag-and-drop, and clipboard paste (`Ctrl+V`) decoding.
- **Memory-Safe Streaming**: Files are chunked in 16 KiB blocks with backpressure controls (`bufferedAmountLowThreshold`) to prevent memory exhaustion. Chromium browsers support direct-to-folder streaming via the File System Access API.
- **Wake Lock Protection**: Keeps device screens awake throughout active transfers to prevent mobile browsers from sleeping.
- **Adaptive UI & Themes**: Responsive design with light, dark, and system auto themes, tactile micro-interactions, and visual transfer progress.

---

## How Mode A Works (Online Code)

1. **Code Generation**: The sender adds items and requests a code. The app reserves a short 6-character identifier from an unambiguous alphabet (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`) formatted as `XXX-XXX`.
2. **Signaling & Handshake**: The receiver enters the 6-character code (or scans the sender's join QR code). The signaling server only acts as an introduction broker to negotiate WebRTC SDP offers and answers.
3. **Authorization**: The sender receives an explicit permission prompt (**"Allow this device?"**) detailing incoming device connection requests.
4. **Binary Streaming Protocol**:
   - `hello` (+ optional PIN validation)
   - `manifest` containing file metadata and inline text/links
   - Receiver `accept` / `decline`
   - 16 KiB binary chunks with adaptive backpressure flow control
   - Incremental per-file SHA-256 verification
   - `complete` signal
5. **Direct DTLS Channel**: All transfer traffic flows over encrypted WebRTC data channels directly between the two browser engines.

---

## How Mode B Works (Offline QR Fountain Stream)

1. **Payload Container**: Items are packed into a binary container (`manifest length | JSON manifest | raw bytes`).
2. **Compression**: Payloads are compressed with `deflate-raw` via the browser's native `CompressionStream` (automatically skipped if compression increases size).
3. **Optional Encryption**: When a passphrase is provided, payloads are encrypted with **AES-256-GCM** using a key derived via PBKDF2-SHA-256 (150,000 iterations).
4. **Luby Transform (LT) Fountain Code**:
   - The payload is split into $K$ source blocks of size $B$.
   - The encoder streams $K$ original source blocks followed by an endless sequence of XOR-combined droplets generated via a robust soliton degree distribution.
   - The receiver only needs any $K + \epsilon$ droplets (in any order, even mid-stream) to reconstruct the entire payload.
5. **Base45 QR Encoding**: Frames are packed into a 24-byte binary header with CRC-32 and encoded into **Base45**, ensuring 100% data fidelity with QR code alphanumeric mode without byte corruption.
6. **Peeling Decoder**: The receiver camera or uploaded screenshots capture frames dynamically. A visual block matrix displays real-time reconstruction progress until complete.

---

## Architecture & Project Structure

```
src/
├── lib/
│   ├── lt/             # Luby Transform fountain codec (PRNG, soliton, CRC32, Base45, encoder, decoder)
│   ├── pipeline/       # Compression (deflate), AES-GCM crypto, container packaging, Instant QR
│   ├── qr/             # Canvas QR renderer, camera scanner, jsQR worker decoder, scan routing
│   ├── config.ts       # Central system constants and tuning limits
│   ├── protocol.ts     # P2P wire protocol message definitions
│   ├── senderHost.ts   # P2P sender lifecycle & session manager
│   ├── sessions.ts     # State machines for sender & receiver sessions
│   ├── transportPeer.ts# PeerJS WebRTC adapter
│   ├── chunker.ts      # Chunking, backpressure & File System Access streaming
│   └── code.ts         # Code generation, normalization & extraction helpers
├── components/         # Modular UI kit, Composer, QR canvas, BlockGrid, StreamPlayer
├── pages/              # Home, Send, SendOnline, SendOffline, Receive, ReceiveOnline, ScanPanel, Instant
├── dev/                # Dev-only loopback testbench (/dev/loopback)
└── hooks.ts            # Reactive hooks (theme, online status, wake lock, routing)
```

---

## Security & Privacy

- **No Remote Storage**: Payloads never leave local device memory except to travel directly to the designated peer.
- **End-to-End Encryption**: WebRTC channels enforce standard DTLS encryption; Offline QR streams support authenticated AES-256-GCM encryption.
- **Integrity Guarantee**: Every received item undergoes independent SHA-256 hash verification before being presented to the user.
- **Brute-Force Lockout**: 5 incorrect PIN attempts permanently close an active code session.
- **Automatic Expiration**: Unclaimed codes automatically expire after 10 minutes.

---

## Author & License

Created by **Teja Priyan** ([@TejaPriyan](https://github.com/TejaPriyan)).

Released under the [MIT License](LICENSE).
