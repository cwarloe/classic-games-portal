# Turn-Based Multiplayer Implementation Guide

This document summarizes the turn-based multiplayer system implemented across all classic arcade games.

## Games Completed
- ✅ Pac-Man
- ✅ Galaga
- ✅ Space Invaders
- ⏳ Berzerk (in progress)
- ⏳ Frogger (in progress)
- ⏳ Battlezone (in progress)
- ⏳ Missile Command (in progress)

## Implementation Pattern

### 1. Add Multiplayer State Variables
```javascript
let twoPlayerMode = false;
let currentPlayer = 1;
let player1Score = 0;
let player2Score = 0;
let player1Lives = 3;
let player2Lives = 3;
let showTurnMessage = false;
let turnMessageTimer = 0;
```

### 2. Add Status Display Function
```javascript
function updateStatusDisplay() {
    if (twoPlayerMode) {
        statusEl.textContent = `P1: ${player1Score} | P2: ${player2Score} | Current: P${currentPlayer}`;
    } else {
        statusEl.textContent = 'Press T for 2-Player Mode';
    }
}
```

### 3. Add T Key Toggle
```javascript
if ((e.key === 't' || e.key === 'T') && !gameOver) {
    twoPlayerMode = !twoPlayerMode;
    if (twoPlayerMode) {
        currentPlayer = 1;
        player1Score = score;
        player2Score = 0;
        player1Lives = lives;
        player2Lives = 3;
    }
    updateStatusDisplay();
}
```

### 4. Update Score Tracking
Whenever score increases:
```javascript
if (twoPlayerMode) {
    if (currentPlayer === 1) player1Score = score;
    else player2Score = score;
    updateStatusDisplay();
}
```

### 5. Turn Switching on Death
```javascript
if (lives <= 0) {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    if (currentPlayer === 1) {
        score = player1Score;
        lives = player1Lives;
    } else {
        score = player2Score;
        lives = player2Lives;
    }
    if (player1Lives <= 0 && player2Lives <= 0) {
        gameOver = true;
        // Show winner
    } else {
        showTurnMessage = true;
        turnMessageTimer = 180;
        updateStatusDisplay();
    }
}
```

### 6. Turn Message Display
```javascript
if (showTurnMessage) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0';
    ctx.font = '40px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText(`PLAYER ${currentPlayer}'S TURN`, canvas.width / 2, canvas.height / 2);
    ctx.font = '16px "Courier New"';
    ctx.fillStyle = '#fff';
    ctx.fillText('Press SPACE to continue', canvas.width / 2, canvas.height / 2 + 40);
}
```

### 7. Winner Display
```javascript
if (twoPlayerMode) {
    const winner = player1Score > player2Score ? 1 : (player2Score > player1Score ? 2 : 0);
    ctx.fillText(winner === 0 ? 'TIE GAME!' : `PLAYER ${winner} WINS!`, ...);
    ctx.fillText(`P1: ${player1Score}  |  P2: ${player2Score}`, ...);
}
```

## Bug Fixes Completed
1. ✅ Pac-Man: Added invincibility period after ghost collision (180 frames)
2. ✅ Missile Command: Fixed collision detection array splicing issue
3. ✅ Frogger: Implemented grid-aligned movement, reduced speeds (0.5-0.7)
4. ✅ Berzerk: Reduced player speed from 3 to 2
