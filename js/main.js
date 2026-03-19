const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const keys = {};

document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
});

function rectsOverlap(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

const world = {
    width: 2200,
    height: 1400
};

const camera = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
};

const game = {
    isDay: true,
    timeCounter: 0,
    timeLimit: 1100,
    gameOver: false,
    win: false
};

const cellArea = { x: 60, y: 280, width: 140, height: 120 };
const cellEntrance = { x: 190, y: 320, width: 28, height: 45 };
const cellDoorClosed = { x: 204, y: 330, width: 10, height: 24 };
let activeCellDoor = null;

const exitZone = { x: 2060, y: 1180, width: 70, height: 120 };

const hidingSpots = [
    {
        area: { x: 350, y: 210, width: 70, height: 70 },
        door: { x: 378, y: 274, width: 14, height: 6 }
    },
    {
        area: { x: 760, y: 500, width: 70, height: 70 },
        door: { x: 788, y: 494, width: 14, height: 6 }
    },
    {
        area: { x: 1160, y: 280, width: 70, height: 70 },
        door: { x: 1154, y: 308, width: 6, height: 14 }
    },
    {
        area: { x: 1600, y: 860, width: 70, height: 70 },
        door: { x: 1628, y: 854, width: 14, height: 6 }
    },
    {
        area: { x: 1880, y: 260, width: 70, height: 70 },
        door: { x: 1908, y: 324, width: 14, height: 6 }
    },
    {
        area: { x: 1850, y: 1090, width: 70, height: 70 },
        door: { x: 1844, y: 1118, width: 6, height: 14 }
    }
];

const walls = [
    { x: 0, y: 0, width: 2200, height: 20 },
    { x: 0, y: 1380, width: 2200, height: 20 },
    { x: 0, y: 0, width: 20, height: 1400 },
    { x: 2180, y: 0, width: 20, height: 1400 },

    { x: 260, y: 220, width: 20, height: 420 },
    { x: 260, y: 220, width: 220, height: 20 },

    { x: 520, y: 360, width: 20, height: 500 },
    { x: 520, y: 860, width: 260, height: 20 },

    { x: 820, y: 120, width: 20, height: 500 },
    { x: 820, y: 620, width: 240, height: 20 },

    { x: 1100, y: 260, width: 20, height: 440 },
    { x: 1100, y: 260, width: 240, height: 20 },

    { x: 1400, y: 520, width: 20, height: 560 },
    { x: 1400, y: 520, width: 280, height: 20 },

    { x: 1760, y: 140, width: 20, height: 420 },
    { x: 1760, y: 900, width: 20, height: 280 },

    { x: 1780, y: 540, width: 240, height: 20 },
    { x: 1780, y: 900, width: 260, height: 20 },

    { x: 640, y: 1080, width: 500, height: 20 },
    { x: 1140, y: 820, width: 20, height: 280 },

    { x: 1540, y: 1180, width: 420, height: 20 },

    { x: 1200, y: 1120, width: 20, height: 180 },
    { x: 1320, y: 980, width: 260, height: 20 },
    { x: 1700, y: 1120, width: 20, height: 180 },
    { x: 1840, y: 1020, width: 20, height: 180 },
    { x: 1900, y: 1240, width: 180, height: 20 },
    { x: 1960, y: 980, width: 20, height: 180 }
];

const player = new Player(100, 320, 24, 2.6);

const guards = [
    new Guard(420, 300, 24, { x: 300, y: 80, width: 420, height: 520 }),
    new Guard(900, 300, 24, { x: 860, y: 80, width: 360, height: 520 }),
    new Guard(1510, 700, 24, { x: 1260, y: 560, width: 420, height: 520 }),
    new Guard(1880, 260, 24, { x: 1800, y: 80, width: 260, height: 420 }),
    new Guard(1880, 1040, 24, { x: 1700, y: 920, width: 360, height: 300 }),
    new Guard(1460, 1180, 24, { x: 1220, y: 960, width: 520, height: 320 })
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function updateCamera() {
    camera.x = player.x + player.size / 2 - camera.width / 2;
    camera.y = player.y + player.size / 2 - camera.height / 2;

    camera.x = clamp(camera.x, 0, world.width - camera.width);
    camera.y = clamp(camera.y, 0, world.height - camera.height);
}

function updateDayNightCycle() {
    game.timeCounter++;

    if (game.timeCounter >= game.timeLimit) {
        game.timeCounter = 0;
        game.isDay = !game.isDay;
    }

    if (game.isDay) {
        activeCellDoor = null;
    } else {
        const playerInsideCell =
            player.x + player.size > cellArea.x &&
            player.x < cellArea.x + cellArea.width &&
            player.y + player.size > cellArea.y &&
            player.y < cellArea.y + cellArea.height;

        activeCellDoor = playerInsideCell ? null : cellDoorClosed;
    }
}

function isPlayerMoving() {
    return !!(keys["w"] || keys["a"] || keys["s"] || keys["d"]);
}

function anyGuardChasing() {
    return guards.some(guard => guard.fsm.getState() === "CHASE");
}

function resetGuardsAfterCapture() {
    for (const guard of guards) {
        guard.x = guard.startX;
        guard.y = guard.startY;
        guard.pauseTimer = 0;
        guard.searchTimer = 0;
        guard.suspiciousTimer = 0;
        guard.investigationTarget = null;
        guard.lastKnownPlayerPosition = null;
        guard.knowsHiddenSpot = false;
        guard.knownHiddenSpot = null;
        guard.currentRoamTarget = guard.getRandomPointInZone();
        guard.fsm.setState("RETURN");
    }
}

function handleCapture() {
    if (game.isDay) return;

    for (const guard of guards) {
        if (guard.fsm.getState() === "CAPTURE") {
            player.lives--;

            if (player.lives <= 0) {
                game.gameOver = true;
                return;
            }

            player.resetToCell();
            resetGuardsAfterCapture();
            break;
        }
    }
}

function checkWin() {
    if (!game.isDay && rectsOverlap(player.getRect(), exitZone)) {
        game.win = true;
    }
}

function updateGuards() {
    const moving = isPlayerMoving();

    for (const guard of guards) {
        guard.beginFrame();
    }

    for (const guard of guards) {
        guard.update(player, walls, moving, game.isDay);
    }

    if (game.isDay) return;

    const alerts = [];

    for (const guard of guards) {
        if (guard.alertTriggered && guard.alertPosition) {
            alerts.push({
                source: guard,
                position: guard.alertPosition
            });
        }
    }

    for (const alert of alerts) {
        for (const otherGuard of guards) {
            if (otherGuard !== alert.source) {
                otherGuard.receiveAlert(alert.position);
            }
        }
    }
}

function update() {
    if (game.gameOver || game.win) return;

    updateDayNightCycle();

    const beingChased = !game.isDay && anyGuardChasing();

    player.update(
        keys,
        walls,
        activeCellDoor,
        game.isDay,
        cellArea,
        beingChased,
        hidingSpots,
        cellEntrance
    );

    player.x = clamp(player.x, 20, world.width - 20 - player.size);
    player.y = clamp(player.y, 20, world.height - 20 - player.size);

    updateGuards();
    handleCapture();
    checkWin();
    updateCamera();
}

function drawRectWorld(rect, color) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x - camera.x, rect.y - camera.y, rect.width, rect.height);
}

function strokeRectWorld(rect, color) {
    ctx.strokeStyle = color;
    ctx.strokeRect(rect.x - camera.x, rect.y - camera.y, rect.width, rect.height);
}

function drawBackground() {
    ctx.fillStyle = game.isDay ? "#2a2a2a" : "#131320";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawZones() {
    drawRectWorld(cellArea, "rgba(100, 100, 130, 0.35)");

    if (game.isDay) {
        drawRectWorld(exitZone, "rgba(180, 80, 80, 0.55)");
    } else {
        drawRectWorld(exitZone, "rgba(0, 180, 90, 0.6)");
    }
}

function drawHidingSpots() {
    for (const spot of hidingSpots) {
        drawRectWorld(spot.area, "rgba(70, 140, 160, 0.45)");
        strokeRectWorld(spot.area, "rgba(160, 230, 255, 0.8)");
        drawRectWorld(spot.door, "rgba(220, 220, 220, 0.95)");
    }
}

function drawWalls() {
    for (const wall of walls) {
        drawRectWorld(wall, "#6b6b6b");
    }
}

function drawCellDoor() {
    drawRectWorld(cellEntrance, "rgba(220, 220, 220, 0.95)");

    if (activeCellDoor) {
        drawRectWorld(activeCellDoor, "#bbbbbb");
    }
}

function drawPlayer() {
    player.draw(ctx, camera);
}

function drawGuardLabels() {
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";

    for (const guard of guards) {
        ctx.fillText(guard.fsm.getState(), guard.x - camera.x - 8, guard.y - camera.y - 8);
    }
}

function drawHUD() {
    ctx.fillStyle = "white";
    ctx.font = "18px Arial";
    ctx.fillText(`Lives: ${player.lives}`, 20, 30);
    ctx.fillText(`Time: ${game.isDay ? "DAY" : "NIGHT"}`, 20, 55);
    ctx.fillText(`Hidden: ${player.isHidden ? "YES" : "NO"}`, 20, 80);
    ctx.fillText(`Map: ${Math.floor(player.x)}, ${Math.floor(player.y)}`, 20, 105);

    let message = "";

    if (player.waitingForDay) {
        message = "Caught! Wait for daytime to leave the cell.";
    } else if (game.isDay) {
        message = "Day: guards allow roaming, but escape is blocked.";
    } else {
        message = "Night: guards will chase you and escape is possible.";
    }

    ctx.fillText(message, 20, 130);
    ctx.fillText("Hiding spots and cell must be entered through doors.", 20, 155);
}

function drawEndScreen() {
    ctx.fillStyle = "white";
    ctx.font = "48px Arial";

    if (game.gameOver) ctx.fillText("GAME OVER", 355, 300);
    if (game.win) ctx.fillText("YOU ESCAPED!", 330, 300);
}

function draw() {
    drawBackground();
    drawZones();
    drawHidingSpots();
    drawWalls();
    drawCellDoor();
    drawPlayer();

    for (const guard of guards) {
        guard.draw(ctx, camera);
    }

    drawHUD();
    drawGuardLabels();

    if (game.gameOver || game.win) {
        drawEndScreen();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

player.canMove = true;
player.state = "FREE_ROAM";

gameLoop();