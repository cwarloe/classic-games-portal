# Classic Games Portal

🎮 **A retro arcade game portal featuring 7 classic games with authentic sounds and gameplay!**

## Games Included

- 🚀 **Asteroids** (Multiplayer) - Classic space shooter with asteroid splitting and physics
- 👾 **Space Invaders** - Alien invasion with destructible bunkers and formations
- 🐸 **Frogger** - Navigate traffic and rivers to reach home safely
- 👻 **Pac-Man** - Maze chase with ghosts, power pellets, and strategic gameplay
- 🛸 **Galaga** - Space shooter with dive-bombing enemies and wave progression
- 🤖 **Berzerk** - Maze shooter with robots and the infamous Evil Otto
- 📱 **Asteroids Mobile** - Touch-optimized with virtual joystick and tilt controls

**All games feature retro arcade sound effects** generated with Web Audio API for authentic 80s arcade feel!

## Run locally
```bash
npm install
npm start
# then open http://localhost:3000  (server.js redirects "/" → /portal.html)
```
If you add or remove games under `/games`, regenerate the manifest:
```bash
python tools/build-manifest.py
```

## Add a game
1. Create `games/<game-folder>/` and put the game's HTML/JS/CSS inside.
2. Ensure there is an `index.html` (or any `.html` file—manifest tool will pick the first).
3. Optionally add `game.json` with fields:
```json
{ "title": "My Game", "system": "Arcade", "year": 1982, "tags": ["shooter"] }
```

## Deploy
- Any Node host (Render, Railway, Fly.io) works: it’s a single `node server.js` process.
- Static hosts like Netlify/Vercel are fine for the portal UI, but WebSockets for multiplayer require a Node server.

## Notes
- `node_modules/` is intentionally not in the repo. Run `npm install`.
- Multiplayer Asteroids is in `games/asteroids/` and uses `/ws` on the same origin.
