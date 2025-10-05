# Deployment Guide

Your Classic Games Portal can be deployed to various cloud platforms. All games work online except multiplayer Asteroids requires a WebSocket server.

## Quick Deploy Options

### Option 1: Render (Recommended - Free tier available)

1. Go to https://render.com and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (or upload files)
4. Settings:
   - **Name**: classic-games-portal
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Click "Create Web Service"
6. Your games will be live at: `https://classic-games-portal.onrender.com`

### Option 2: Railway.app

1. Go to https://railway.app
2. Click "Start a New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway auto-detects Node.js and deploys
5. Live at: `https://yourapp.up.railway.app`

### Option 3: Fly.io

```bash
# Install flyctl
npm install -g flyctl

# Login
flyctl auth login

# Deploy
flyctl launch
flyctl deploy
```

### Option 4: Netlify/Vercel (Static hosting - Asteroids multiplayer won't work)

For single-player games only:

**Netlify:**
1. Drag and drop your folder to https://app.netlify.com/drop
2. Portal and all single-player games work instantly

**Vercel:**
```bash
npm install -g vercel
vercel
```

## Environment Variables

No environment variables required! The server uses `process.env.PORT || 8080`.

## Custom Domain

After deploying, you can add a custom domain in your platform's settings.

## What Works Where

| Game | Static Host (Netlify/Vercel) | Node Host (Render/Railway) |
|------|------------------------------|----------------------------|
| Galaga | ✅ | ✅ |
| Berzerk | ✅ | ✅ |
| Pac-Man | ✅ | ✅ |
| Space Invaders | ✅ | ✅ |
| Frogger | ✅ | ✅ |
| Asteroids (Desktop) | ❌ | ✅ |
| Asteroids (Mobile) | ❌ | ✅ |

## Troubleshooting

**Port issues**: Make sure your platform sets the PORT environment variable

**WebSocket not connecting**: Ensure you're using a platform that supports WebSocket (Render, Railway, Fly.io)

**404 errors**: Run `python tools/build-manifest.py` to rebuild the game manifest

## Local Testing

```bash
npm install
npm start
# Visit http://localhost:8080
```

## Updates

After making changes:
```bash
git add .
git commit -m "Your update message"
git push
```

Your platform will automatically redeploy!
