<div align="center">

# ✳ Daylight

**A sleek, minimalist task management workspace powered by an intelligent conversational AI assistant.**

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Flash%20Lite-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)

<br/>

[Key Features](#-key-features) • [Tech Stack](#-tech-stack) • [Quickstart](#-quickstart-guide) • [Architecture](#-project-architecture) • [Security](#-security--privacy)

<br/>

</div>

---

## 🌟 Overview

**Daylight** combines the speed and elegance of a distraction-free to-do app with the brainpower of a conversational AI assistant. 

Whether planning your week, breaking down complex projects into actionable milestones, or dictating tasks on-the-go with your voice, Daylight is designed to keep you in flow state without cognitive overload.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🧠 Daylight AI Companion** | Built-in conversational AI with real-time SSE streaming. Daylight understands your current task list, drafts plans, and can create tasks directly on your board. |
| **🎙️ Voice Chat & Audio Dictation** | Speak naturally to your assistant. Features 16kHz uncompressed PCM WAV capture, live audio visualizer meter, and automatic 30x gain normalization for Bluetooth headsets (AirPods). |
| **⚡ Smart Task Management** | Prioritize tasks with visual badges (*Urgent*, *High*, *Medium*, *Low*), set due dates with countdown tags, and organize your workspace effortlessly. |
| **📌 Pin Important Chats** | Anchor your most valuable AI prompts, strategy sessions, and project briefs to the top of your sidebar for instant access. |
| **🔐 Multi-User Authentication** | Secure local email/password sign-in with bcrypt password hashing, CSRF tokens, 30-day "Remember Me" persistent sessions, plus optional Google and Facebook OAuth sign-in. |
| **🌓 Adaptive Dark & Light Modes** | Automatic system theme detection with manual toggle, tailored color palettes, and buttery-smooth micro-animations. |
| **📱 Fully Responsive** | Designed edge-to-edge for desktop, tablets, and mobile devices with slide-out navigation drawers. |

---

## 🛠️ Tech Stack

### **Frontend**
- **HTML5 & CSS3 Variables** — Native theme tokens, fluid typography, zero bulky UI libraries.
- **Vanilla ES6+ JavaScript** — Modular client controllers (`ai-voice.js`, `ai-models.js`, `ai-account.js`).
- **Web Audio API** — Real-time microphone audio processing, VAD silence detection, live visualizer canvas.

### **Backend**
- **Node.js (ESM)** & **Express 4.x** — High-performance RESTful API + Server-Sent Events (SSE) streaming.
- **Better-SQLite3** — Embedded ACID-compliant database with Write-Ahead Logging (WAL) mode for near-instant reads/writes.
- **Security Middleware** — Express Session, Bcrypt.js, CSRF header token validation, and rate limiting.

### **AI Engine**
- **Google Gemini API** (`gemini-2.5-flash-lite` default) — Native multimodal audio transcription and high-speed chat streaming.
- **OpenAI API Fallback** — Drop-in support for `gpt-4o-mini` or compatible endpoints.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Node.js** `v20.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **npm** (comes bundled with Node)

### 2. Clone & Install
```bash
# Clone the repository
git clone https://github.com/Souma-122s/To-Do-List-App.git
cd To-Do-List-App

# Install dependencies
npm install
```

### 3. Configure Environment Variables
Copy the example environment template:
```bash
cp .env.example .env
```

Open `.env` in your text editor and configure:
```env
PORT=3000
SESSION_SECRET=create_a_long_random_secret_string_here

# AI Configuration (Google Gemini)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
```
> 💡 *Need a Gemini API key? Get a free key at [Google AI Studio](https://aistudio.google.com/).*

### 4. Start the Application
```bash
npm start
```
Open **`http://localhost:3000`** in your browser!

---

## 📁 Project Architecture

Daylight is structured into clean, modular layers separating routing, business logic, storage, and presentation:

```text
To-Do-List-App/
├── index.html              # Main tasks board application
├── ai.html                 # Daylight AI conversation canvas
├── app.js                  # Frontend tasks controller
├── ai.js                   # Frontend AI chat orchestrator
├── server.js               # Express application entrypoint
│
├── server/                 # Backend Modular Architecture
│   ├── config.js           # Environment and runtime configuration
│   ├── db.js               # SQLite database schemas and migrations
│   ├── auth.js             # Session management & CSRF protection
│   ├── ai-service.js       # Gemini/OpenAI streaming & tool calling
│   └── routes/
│       ├── tasks.routes.js # Task CRUD endpoints
│       ├── ai.routes.js    # AI conversation, chat, & voice endpoints
│       └── auth.routes.js  # Sign-up, login, logout, & OAuth routes
│
├── js/                     # Frontend Client Modules
│   ├── ai-voice.js         # Audio recording, gain boost, & visualizer
│   ├── ai-models.js        # Model selector dropdown controller
│   └── ai-account.js       # User menu & account modal logic
│
└── styles/                 # Modular Design System
    ├── base.css            # CSS variables, typography, reset
    ├── tasks.css           # Task cards, inputs, filters, badges
    ├── ai.css              # AI chat bubbles, sidebar, streaming UI
    ├── ai-controls.css     # Voice buttons, live audio visualizer
    ├── account.css         # User profile menu & modals
    └── intro.css           # Welcome onboarding animation
```

---

## 🛡️ Security & Privacy

- **Zero Key Leaks**: All AI calls and API tokens are kept strictly on the backend. The browser never receives or touches provider keys.
- **CSRF Protection**: All state-modifying requests (`POST`, `PATCH`, `DELETE`) require custom `X-CSRF-Token` validation.
- **Password Safety**: User passwords are encrypted with salted `bcrypt` hashes before hitting SQLite.
- **Local-First Storage**: Your database stays on your server inside `daylight.sqlite`—no third-party cloud data harvesting.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

<div align="center">
  <sub>Daylight • Built with care by <a href="https://github.com/Souma-122s">Soumapriya Roy</a> ✳</sub>
</div>
