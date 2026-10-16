# Social Saver

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Framework-Flask%203.x-27272a?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Architecture](https://img.shields.io/badge/Architecture-Desktop%20%2F%20Embedded%20Web-blue?style=flat-square)](https://github.com/furkanndev/Social-Saver)
[![Reverse Engineering](https://img.shields.io/badge/Engine-Direct%20CDN%20Stream-4EAA25?style=flat-square)](https://github.com/furkanndev/Social-Saver)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

An anonymous Instagram story, highlight, and original-resolution profile media viewer and exporter. Built with Python and Flask, Social Saver intercepts direct CDN media streams to guarantee zero read receipt beacons (`seen = false`) and provides automated session authentication.

---

## Technical Highlights

- **Anonymous CDN Streaming:** Direct extraction of high-bitrate media URLs from CDN edge endpoints. Read receipt endpoints are never polled, ensuring viewing sessions remain untracked.
- **Automated Session Ingestion:** Integrated lightweight browser window (`login_window.py`) that captures authentic session cookies on login and persists them locally to `config.json` with zero manual devtools inspection required.
- **Bulk Compression Pipeline:** In-memory and streaming packaging of active profile stories into clean `.zip` archives.
- **Original Resolution Rendering:** Bypasses aggressive client-side downsampling to fetch uncompressed 1080p+ avatars with pan/zoom inspection.
- **Story Player Component:** In-browser custom player featuring segmented progress bars, pause/resume, audio attenuation, and highlight navigation.
- **Client Cache Management:** Dedicated local cache pruning mechanisms with real-time byte counters and session isolation.

---

## Architecture Overview

```
Social-Saver/
├── app.py                  # Flask server, route controllers & static serving
├── ig_api.py               # Reverse-engineered Instagram web API client
├── login_window.py         # Automated webview session & cookie interceptor
├── run.py                  # Standalone application entrypoint (starts server & native window)
├── start.bat               # Windows single-click launcher
├── config.example.json     # Configuration template
├── requirements.txt        # Python dependencies
└── static/                 # Embedded frontend assets (JS player, styles, icons)
```

---

## Installation & Quick Start

### Prerequisites
- Python 3.10 or higher
- Modern web browser (Chrome, Edge, Firefox)

### Manual Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/furkanndev/Social-Saver.git
   cd Social-Saver
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows
   .\venv\Scripts\activate
   # Linux / macOS
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Launch the application:
   ```bash
   python run.py
   ```

*On Windows, you can also launch directly by double-clicking `start.bat`.*

The application initializes the local Flask server at `http://127.0.0.1:5055` and opens an isolated application window.

---

## Authentication & Privacy Workflow

1. Click **Auto Login** on the application top bar.
2. Complete standard login inside the official Instagram authentication dialog.
3. The application intercepts the active `sessionid` and CSRF tokens, writes them securely to local `config.json`, and closes the login viewport automatically.
4. All media extraction now runs using authenticated sessions.

> **Privacy Notice:** Authentication tokens and cookies are exclusively stored locally on your machine in `config.json`. No credentials or credentials data are transmitted to any external third-party server.

---

## Disclaimer

This software is for personal educational and archival research purposes only. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Instagram, Meta Platforms, Inc., or any of its affiliates. Use responsibly and in accordance with applicable terms of service.

---

## License

This project is licensed under the [MIT License](LICENSE).
