# See2Talk

A real-time global open chat website.

## Run in VS Code

1. Open this `See2Talk` folder in VS Code.
2. Open Terminal.
3. Run:

```bash
npm install
npm start
```

4. Open http://localhost:3000
5. Open the same URL in two browser tabs to test the real-time global chat.

## Project structure

- `server.js` — Express + Socket.IO server
- `public/index.html` — website structure
- `public/style.css` — responsive animated UI
- `public/app.js` — chat functionality

The current version stores names/messages only in memory while the server is running. It does not include accounts, permanent message history, private messaging, moderation, or a database yet.
