const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playButton = document.getElementById("playButton");
const howToPlayButton = document.getElementById("howToPlayButton");
const closeHowToPlayButton = document.getElementById("closeHowToPlayButton");
const resumeButton = document.getElementById("resumeButton");
const restartButton = document.getElementById("restartButton");
const pauseRestartButton = document.getElementById("pauseRestartButton");
const muteButton = document.getElementById("muteButton");
const easyModeButton = document.getElementById("easyModeButton");
const hardModeButton = document.getElementById("hardModeButton");
const roamModeButton = document.getElementById("roamModeButton");

const menuOverlay = document.getElementById("menuOverlay");
const pauseOverlay = document.getElementById("pauseOverlay");
const howToPlayOverlay = document.getElementById("howToPlayOverlay");

const keys = {};
const pointer = { x: 0, y: 0, down: false };
let wheelPulse = 0;

const assets = {
    images: {
        prisoner: new Image(),
        guardPatrol: new Image(),
        guardAlert: new Image(),
        gate: new Image(),
        hide: new Image(),
        cabinet: new Image()
    },
    sounds: {}
};

assets.images.prisoner.src = "assets/images/prisoner.png";
assets.images.guardPatrol.src = "assets/images/guard_patrol.png";
assets.images.guardAlert.src = "assets/images/guard_alert.png";
assets.images.gate.src = "assets/images/icon_gate.png";
assets.images.hide.src = "assets/images/icon_hide.png";
assets.images.cabinet.src = "assets/images/cabinet.png";

const audio = {
    muted: false,
    initialized: false,
    ambient: null,
    menu: null,
    footstep: null,
    alert: null,
    capture: null,
    win: null,
    ui: null
};

function setupAudio() {
    if (audio.initialized) return;

    audio.ambient = new Audio("assets/sounds/ambient_loop.wav");
    audio.ambient.loop = true;
    audio.ambient.volume = 0.22;

    audio.menu = new Audio("assets/sounds/ambient_loop.wav");
    audio.menu.loop = true;
    audio.menu.volume = 0.16;

    audio.footstep = new Audio("assets/sounds/footstep.wav");
    audio.footstep.volume = 0.15;

    audio.alert = new Audio("assets/sounds/alert.wav");
    audio.alert.volume = 0.26;

    audio.capture = new Audio("assets/sounds/capture.wav");
    audio.capture.volume = 0.28;

    audio.win = new Audio("assets/sounds/win.wav");
    audio.win.volume = 0.28;

    audio.ui = new Audio("assets/sounds/ui_click.wav");
    audio.ui.volume = 0.18;

    audio.initialized = true;
}

function syncMuteLabel() {
    muteButton.textContent = `Mute: ${audio.muted ? "On" : "Off"}`;
}

function playSound(name) {
    if (!audio.initialized || audio.muted || !audio[name]) return;
    const sound = audio[name].cloneNode();
    sound.volume = audio[name].volume;
    sound.play().catch(() => {});
}

function startAmbient() {
    if (!audio.initialized || audio.muted || !audio.ambient) return;
    if (audio.menu) audio.menu.pause();
    audio.ambient.play().catch(() => {});
}

function stopAmbient() {
    if (audio.ambient) {
        audio.ambient.pause();
        audio.ambient.currentTime = 0;
    }
}

function startMenuMusic() {
    if (!audio.initialized || audio.muted || !audio.menu) return;
    if (audio.ambient) audio.ambient.pause();
    audio.menu.play().catch(() => {});
}

function stopMenuMusic() {
    if (audio.menu) {
        audio.menu.pause();
        audio.menu.currentTime = 0;
    }
}

function toggleMute() {
    audio.muted = !audio.muted;
    syncMuteLabel();

    if (audio.initialized) {
        audio.ambient.muted = audio.muted;
        if (audio.menu) audio.menu.muted = audio.muted;
    }

    if (!audio.muted && game.running && !game.paused) {
        startAmbient();
        playSound("ui");
    }
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function rectFullyInside(a, b) {
    return a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
}

const map = buildMap();
const world = map.world;
const camera = { x: 0, y: 0, width: canvas.width, height: canvas.height, targetX: 0, targetY: 0 };
const cellArea = map.cellArea;
const cellEntrance = map.cellEntrance;
const cellDoorClosed = map.cellDoorClosed;
let activeCellDoor = null;
let cellDoorUnlocked = false;
const exitZone = map.exitZone;
const hidingSpots = map.hidingSpots;
const cabinets = map.cabinets;
const securityCameras = map.securityCameras;
const walls = map.walls;
const guardWalls = walls.concat([{ x: cellDoorClosed.x - 4, y: cellDoorClosed.y - 8, width: cellDoorClosed.width + 8, height: cellDoorClosed.height + 16 }]);
const mapDecor = map.decor;
const navNodes = map.navNodes || [];
const serviceExit = map.serviceExit;
const sewerExit = map.sewerExit;
const interactables = map.interactables;

const lockedDoors = [
    { id: "cameraRoom", name: "Camera Room", door: { x: 2974, y: 730, width: 8, height: 30 }, promptArea: { x: 2938, y: 756, width: 84, height: 54 }, unlocked: false },
    { id: "controlRoom", name: "Control Room", door: { x: 2298, y: 1332, width: 8, height: 30 }, promptArea: { x: 2262, y: 1284, width: 84, height: 72 }, unlocked: false }
];

const ventPhase = {
    world: { width: 2200, height: 820 },
    exit: { x: 2050, y: 318, width: 86, height: 128 },
    walls: [
        { x: 0, y: 0, width: 2200, height: 26 }, { x: 0, y: 794, width: 2200, height: 26 },
        { x: 0, y: 0, width: 26, height: 820 }, { x: 2174, y: 0, width: 26, height: 820 },
        { x: 220, y: 120, width: 26, height: 540 },
        { x: 220, y: 120, width: 380, height: 26 },
        { x: 520, y: 266, width: 26, height: 360 },
        { x: 520, y: 600, width: 420, height: 26 },
        { x: 760, y: 120, width: 26, height: 360 },
        { x: 760, y: 120, width: 430, height: 26 },
        { x: 1160, y: 266, width: 26, height: 360 },
        { x: 1160, y: 266, width: 420, height: 26 },
        { x: 1554, y: 120, width: 26, height: 520 },
        { x: 1554, y: 614, width: 360, height: 26 },
        { x: 1888, y: 240, width: 26, height: 400 },
    ],
    chasers: []
};

const carPhase = {
    world: { width: 2600, height: 980 },
    exit: { x: 2400, y: 392, width: 120, height: 180 },
    walls: [
        { x: 0, y: 0, width: 2600, height: 120 }, { x: 0, y: 860, width: 2600, height: 120 },
        { x: 0, y: 0, width: 24, height: 980 }, { x: 2576, y: 0, width: 24, height: 980 },
        { x: 520, y: 120, width: 24, height: 220 }, { x: 520, y: 520, width: 24, height: 340 },
        { x: 960, y: 120, width: 24, height: 310 }, { x: 960, y: 610, width: 24, height: 250 },
        { x: 1440, y: 120, width: 24, height: 240 }, { x: 1440, y: 560, width: 24, height: 300 },
        { x: 1920, y: 120, width: 24, height: 300 }, { x: 1920, y: 610, width: 24, height: 250 }
    ],
    chasers: []
};

function getLockedDoorBlockers() {
    if (game.scene !== "prison") return [];
    return lockedDoors.filter(door => !door.unlocked).map(door => ({
        x: door.door.x - 6,
        y: door.door.y - 12,
        width: door.door.width + 12,
        height: door.door.height + 24
    }));
}

function getSceneWorld() {
    if (game.scene === "vent") return ventPhase.world;
    if (game.scene === "car") return carPhase.world;
    return world;
}

function getSceneWalls() {
    if (game.scene === "vent") return ventPhase.walls;
    if (game.scene === "car") return carPhase.walls;
    return walls.concat(getLockedDoorBlockers());
}

function getSceneGuardWalls() {
    if (game.scene !== "prison") return getSceneWalls();
    return guardWalls.concat(getLockedDoorBlockers());
}

function getSceneHidingSpots() {
    return game.scene === "prison" ? hidingSpots : [];
}

function getModeConfig() {
    const configs = {
        easy: { label: "Easy", guardLimit: 6, lives: 4, guardSpeed: 0.94, suspicion: 0.88, days: 5 },
        hard: { label: "Hard", guardLimit: 10, lives: 2, guardSpeed: 1.12, suspicion: 1.18, days: 5 },
        roam: { label: "Roam", guardLimit: 0, lives: 99, guardSpeed: 0, suspicion: 0, days: 99 }
    };
    return configs[game.mode] || configs.easy;
}

function getActiveGuards() {
    if (game.mode === "roam") return [];
    if (game.scene === "prison") {
        const limit = getModeConfig().guardLimit;
        return guards.slice(0, Math.min(limit, guards.length));
    }
    return [];
}

function updateModeButtons() {
    const buttons = [easyModeButton, hardModeButton, roamModeButton];
    buttons.forEach(btn => btn && btn.classList.remove("active-mode"));
    if (game.mode === "easy" && easyModeButton) easyModeButton.classList.add("active-mode");
    if (game.mode === "hard" && hardModeButton) hardModeButton.classList.add("active-mode");
    if (game.mode === "roam" && roamModeButton) roamModeButton.classList.add("active-mode");
}

function setGameMode(mode) {
    game.mode = ["easy", "hard", "roam"].includes(mode) ? mode : "easy";
    updateModeButtons();
}

function resetLockedDoors() {
    for (const door of lockedDoors) door.unlocked = game.mode === "roam";
}

function resetPhaseChasers() {
    ventPhase.chasers = [
        { x: 96, y: 206, width: 42, height: 42, speed: 2.25 },
        { x: 96, y: 560, width: 42, height: 42, speed: 2.4 }
    ];
    carPhase.chasers = [
        { x: 120, y: 242, width: 64, height: 36, speed: 3.55 },
        { x: 80, y: 462, width: 64, height: 36, speed: 3.75 },
        { x: 40, y: 682, width: 64, height: 36, speed: 3.95 }
    ];
}

function setPlayerBaseSpeedForScene() {
    if (game.scene === "car") player.baseSpeed = 4.3;
    else if (game.scene === "vent") player.baseSpeed = 3.0;
    else player.baseSpeed = 2.7;
}

function enterVentPhase() {
    game.scene = "vent";
    setPlayerBaseSpeedForScene();
    player.x = 70;
    player.y = 374;
    player.vx = 0;
    player.vy = 0;
    player.isHidden = false;
    game.nearPrompt = null;
    game.hintText = "VENT ESCAPE: guards know you are gone. Reach the outer grate.";
    setPopup("Vent chase started.", "danger", 120);
    updateCamera(true);
}

function enterCarPhase() {
    game.scene = "car";
    setPlayerBaseSpeedForScene();
    player.x = 96;
    player.y = 454;
    player.vx = 0;
    player.vy = 0;
    player.isHidden = false;
    game.nearPrompt = null;
    game.hintText = "CAR ESCAPE: floor it and break through the final roadblock.";
    setPopup("Vehicle chase started.", "danger", 120);
    updateCamera(true);
}

function leaveRoamPreview(sceneName) {
    game.scene = "prison";
    setPlayerBaseSpeedForScene();
    player.vx = 0;
    player.vy = 0;
    player.isHidden = false;
    game.nearPrompt = null;
    if (sceneName === "vent") {
        player.x = interactables.sewerHatch.x + 18;
        player.y = interactables.sewerHatch.y - 56;
        game.hintText = "Returned from the sewer preview. You can keep exploring roam mode.";
        setPopup("Sewer preview complete.", "success", 120);
    } else {
        player.x = interactables.truck.x - 80;
        player.y = interactables.truck.y + 18;
        game.hintText = "Returned from the vehicle preview. You can keep exploring roam mode.";
        setPopup("Vehicle preview complete.", "success", 120);
    }
    updateCamera(true);
}

function advanceToNextDay(reason = "") {
    if (game.mode === "roam") return false;
    game.scene = "prison";
    setPlayerBaseSpeedForScene();
    game.currentDay++;
    game.isDay = true;
    game.timeCounter = 0;
    activeCellDoor = null;
    cellDoorUnlocked = false;
    player.resetToCell();
    if (reason) game.hintText = reason;
    for (const g of guards) g.resetToPost();
    resetPhaseChasers();
    if (game.currentDay > game.maxDays) {
        game.hintText = "Five days passed. Transfer orders ended the escape chance.";
        endRun(false);
        return true;
    }
    setPopup(`Day ${game.currentDay} begins. Time is running out.`, "empty", 150);
    return false;
}

function entityBlocked(rect, wallsList) {
    for (const wall of wallsList) {
        if (rectsOverlap(rect, wall)) return true;
    }
    return false;
}

function movePhaseChaser(chaser, targetX, targetY, wallsList) {
    const centerX = chaser.x + chaser.width / 2;
    const centerY = chaser.y + chaser.height / 2;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const dist = Math.hypot(dx, dy) || 1;
    const stepX = (dx / dist) * chaser.speed;
    const stepY = (dy / dist) * chaser.speed;
    const nextX = { x: chaser.x + stepX, y: chaser.y, width: chaser.width, height: chaser.height };
    chaser.dirX = stepX;
    chaser.dirY = stepY;
    if (!entityBlocked(nextX, wallsList)) chaser.x += stepX;
    const nextY = { x: chaser.x, y: chaser.y + stepY, width: chaser.width, height: chaser.height };
    if (!entityBlocked(nextY, wallsList)) chaser.y += stepY;
}

function getCurrentPhaseData() {
    if (game.scene === "vent") return ventPhase;
    if (game.scene === "car") return carPhase;
    return null;
}

function updatePhaseScene() {
    const phase = getCurrentPhaseData();
    if (!phase) return;
    const dummyArea = { x: -5000, y: -5000, width: 10, height: 10 };
    player.update(keys, phase.walls, null, true, false, [], dummyArea, dummyArea, true);
    const activeWorld = phase.world;
    player.x = clamp(player.x, 30, activeWorld.width - 30 - player.size);
    player.y = clamp(player.y, 30, activeWorld.height - 30 - player.size);

    if (game.mode !== "roam") {
        const targetX = player.x + player.size / 2;
        const targetY = player.y + player.size / 2;
        phase.chasers.forEach(chaser => movePhaseChaser(chaser, targetX, targetY, phase.walls));
        for (const chaser of phase.chasers) {
            if (rectsOverlap({ x: player.x + 8, y: player.y + 8, width: player.size - 16, height: player.size - 16 }, { x: chaser.x, y: chaser.y, width: chaser.width, height: chaser.height })) {
                player.lives--;
                game.caughtFlash = 18;
                playSound("capture");
                if (player.lives <= 0) {
                    game.hintText = "You were intercepted during the escape.";
                    endRun(false);
                    return;
                }
                const failedScene = game.scene;
                if (!advanceToNextDay("Intercepted during the breakout. You were thrown back into your cell.")) {
                    game.hintText = `Caught in the ${failedScene === "vent" ? "vents" : "car chase"}. Day ${game.currentDay}/${game.maxDays}.`;
                }
                return;
            }
        }
    }

    if (rectsOverlap(player.getRect(), phase.exit)) {
        if (game.mode === "roam") {
            const finishedScene = game.scene;
            leaveRoamPreview(finishedScene);
        } else {
            game.hintText = game.scene === "vent" ? "You burst through the vent exit." : "You outran the convoy and cleared the prison road.";
            endRun(true);
        }
    }
}

function drawChaseVehicle(entity, label = "UNIT", isPlayer = false) {
    const dx = entity.x - camera.x;
    const dy = entity.y - camera.y;
    const width = entity.width || player.size * 1.36;
    const height = entity.height || player.size * 0.82;
    const centerX = dx + width / 2;
    const centerY = dy + height / 2;
    const moveX = entity.vx || entity.dirX || 1;
    const moveY = entity.vy || entity.dirY || 0;
    const angle = Math.atan2(moveY, moveX);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.ellipse(0, height * 0.58, width * 0.42, height * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isPlayer ? "#0d1b2a" : "#132433";
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, 12);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
    if (isPlayer) {
        bodyGradient.addColorStop(0, "#2f7dd1");
        bodyGradient.addColorStop(0.6, "#1f5ea0");
        bodyGradient.addColorStop(1, "#143d69");
    } else {
        bodyGradient.addColorStop(0, "#ffffff");
        bodyGradient.addColorStop(0.55, "#d9e5f0");
        bodyGradient.addColorStop(0.56, "#173552");
        bodyGradient.addColorStop(1, "#11253b");
    }
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.roundRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4, 11);
    ctx.fill();

    ctx.fillStyle = isPlayer ? "#8ec8ff" : "#b9d9f4";
    ctx.beginPath();
    ctx.roundRect(-width * 0.12, -height * 0.28, width * 0.42, height * 0.56, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(-width * 0.38, -height * 0.23, width * 0.22, height * 0.10);
    ctx.fillRect(-width * 0.02, -height * 0.23, width * 0.20, height * 0.10);

    ctx.fillStyle = "#111";
    const wheelW = width * 0.14;
    const wheelH = height * 0.24;
    ctx.fillRect(-width * 0.33, -height * 0.56, wheelW, wheelH);
    ctx.fillRect(width * 0.18, -height * 0.56, wheelW, wheelH);
    ctx.fillRect(-width * 0.33, height * 0.32, wheelW, wheelH);
    ctx.fillRect(width * 0.18, height * 0.32, wheelW, wheelH);

    if (!isPlayer) {
        const flash = Math.sin(game.frame * 0.25) > 0;
        ctx.fillStyle = flash ? "#ff4d6d" : "#72d6ff";
        ctx.fillRect(-width * 0.08, -height * 0.42, width * 0.10, height * 0.11);
        ctx.fillStyle = flash ? "#72d6ff" : "#ff4d6d";
        ctx.fillRect(width * 0.04, -height * 0.42, width * 0.10, height * 0.11);
    }

    ctx.fillStyle = "#ffd166";
    ctx.fillRect(width * 0.39, -height * 0.18, width * 0.08, height * 0.12);
    ctx.fillRect(width * 0.39, height * 0.06, width * 0.08, height * 0.12);
    ctx.fillStyle = "#ff595e";
    ctx.fillRect(-width * 0.47, -height * 0.18, width * 0.08, height * 0.12);
    ctx.fillRect(-width * 0.47, height * 0.06, width * 0.08, height * 0.12);

    ctx.fillStyle = isPlayer ? "rgba(255,255,255,0.92)" : "#12314f";
    ctx.font = `700 ${Math.max(10, Math.round(height * 0.34))}px Inter, Arial`;
    ctx.textAlign = "center";
    ctx.fillText(isPlayer ? "ESC" : "POL", 0, 4);
    ctx.restore();

    if (!isPlayer) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "700 12px Rajdhani, Inter, Arial";
        ctx.textAlign = "left";
        ctx.fillText(label, dx + 4, dy - 6);
    }
}

function drawLockedDoorOverlays() {
    if (game.scene !== "prison") return;
    lockedDoors.forEach(door => {
        const dx = door.door.x - camera.x - 6;
        const dy = door.door.y - camera.y - 12;
        ctx.fillStyle = door.unlocked ? "rgba(88, 211, 154, 0.7)" : "rgba(255, 209, 102, 0.88)";
        ctx.fillRect(dx, dy, door.door.width + 12, door.door.height + 24);
        ctx.fillStyle = "rgba(11, 16, 22, 0.9)";
        ctx.fillRect(dx + 4, dy + 8, 8, 10);
        ctx.fillStyle = "rgba(233,240,247,0.92)";
        ctx.font = "700 11px Inter, Arial";
        ctx.fillText(door.unlocked ? "OPEN" : "KC", dx - 10, dy - 6);
    });
}

function drawPhaseScene() {
    const phase = getCurrentPhaseData();
    if (!phase) return;
    const sky = game.scene === "vent" ? "#121a21" : "#0e151b";
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tile = game.scene === "vent" ? 56 : 72;
    for (let x = -((camera.x % tile) + tile); x < canvas.width + tile; x += tile) {
        for (let y = -((camera.y % tile) + tile); y < canvas.height + tile; y += tile) {
            const checker = ((Math.floor((camera.x + x) / tile) + Math.floor((camera.y + y) / tile)) % 2 === 0);
            ctx.fillStyle = game.scene === "vent"
                ? (checker ? "#364047" : "#2a3137")
                : (checker ? "#2a3138" : "#1f252b");
            ctx.fillRect(x, y, tile, tile);
        }
    }

    if (game.scene === "car") {
        ctx.fillStyle = "rgba(232, 196, 117, 0.9)";
        for (let i = 0; i < 36; i++) {
            const x = 60 + i * 72 - camera.x;
            ctx.fillRect(x, canvas.height / 2 - 6, 36, 12);
        }
    }

    phase.walls.forEach(wall => {
        ctx.fillStyle = game.scene === "vent" ? "#6d7780" : "#56606a";
        ctx.fillRect(wall.x - camera.x, wall.y - camera.y, wall.width, wall.height);
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.strokeRect(wall.x - camera.x, wall.y - camera.y, wall.width, wall.height);
    });

    ctx.fillStyle = game.scene === "vent" ? "rgba(114, 214, 255, 0.9)" : "rgba(111, 211, 154, 0.92)";
    ctx.fillRect(phase.exit.x - camera.x, phase.exit.y - camera.y, phase.exit.width, phase.exit.height);
    ctx.fillStyle = "#081118";
    ctx.font = "700 14px Rajdhani, Inter, Arial";
    ctx.fillText(game.scene === "vent" ? "VENT EXIT" : "ROAD EXIT", phase.exit.x - camera.x + 8, phase.exit.y - camera.y - 8);

    player.draw(ctx, camera, assets, game.scene);

    phase.chasers.forEach((chaser, index) => {
        if (game.scene === "car") {
            drawChaseVehicle(chaser, `UNIT ${index + 1}`, false);
            return;
        }
        const dx = chaser.x - camera.x;
        const dy = chaser.y - camera.y;
        ctx.save();
        ctx.fillStyle = "#9aa6b2";
        ctx.fillRect(dx, dy, chaser.width, chaser.height);
        ctx.strokeStyle = "#dce8f1";
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, chaser.width, chaser.height);
        ctx.fillStyle = "#ff7b7b";
        ctx.font = "700 11px Inter, Arial";
        ctx.fillText(`G${index + 1}`, dx + 6, dy - 6);
        ctx.restore();
    });
}

const player = new Player(map.playerStart.x, map.playerStart.y, 42, 2.7);
const guards = createGuards();
for (const guard of guards) {
    guard.setNavigationGraph(navNodes);
    guard.basePatrolSpeedOriginal = guard.basePatrolSpeed;
    guard.baseSuspiciousSpeedOriginal = guard.baseSuspiciousSpeed;
    guard.baseChaseSpeedOriginal = guard.baseChaseSpeed;
    guard.baseVisionRangeOriginal = guard.baseVisionRange;
    guard.baseHearingRangeOriginal = guard.baseHearingRange;
}

const game = {
    running: false,
    paused: false,
    isDay: true,
    gameOver: false,
    win: false,
    frame: 0,
    timeCounter: 0,
    timeLimit: 60 * 60,
    caughtFlash: 0,
    hintText: "Press Play to begin.",
    popupText: "",
    popupTone: "info",
    popupTimer: 0,
    lastAlertFrame: -9999,
    lastCameraAlertFrame: -9999,
    cameraAlarmTimer: 0,
    alertedGuardIds: [],
    blackoutTimer: 0,
    inventoryOpen: false,
    selectedInventoryItem: null,
    explored: [],
    nearPrompt: null,
    guardPressure: 0,
    lastDisguiseWarningFrame: -9999,
    mode: "easy",
    currentDay: 1,
    maxDays: 5,
    scene: "prison",
    eventsUsed: [
        "load",
        "resize",
        "blur",
        "focus",
        "visibilitychange",
        "keydown",
        "keyup",
        "mousemove",
        "mousedown",
        "mouseup",
        "click",
        "contextmenu",
        "wheel",
        "requestAnimationFrame",
        "setInterval"
    ]
};

function setPopup(text, tone = "info", duration = 150) {
    game.popupText = text;
    game.popupTone = tone;
    game.popupTimer = duration;
}

function getCellLockpickZone() {
    return {
        x: cellArea.x + 6,
        y: cellDoorClosed.y - 28,
        width: cellArea.width + cellEntrance.width + 54,
        height: cellDoorClosed.height + 56
    };
}

function canUseLockpickAtCellDoor() {
    if (game.isDay || cellDoorUnlocked || player.lockpicks <= 0) return false;
    return rectsOverlap(player.getCollisionRect(), getCellLockpickZone());
}

function isPlayerProtectedInCell() {
    const rect = player.getCollisionRect();
    const padded = {
        x: cellArea.x + 6,
        y: cellArea.y + 6,
        width: cellArea.width - 12,
        height: cellArea.height - 12
    };
    if (rectFullyInside(rect, padded)) return true;

    if (!game.isDay && !cellDoorUnlocked) {
        return rectsOverlap(rect, getCellLockpickZone());
    }

    return false;
}


function buildMap() {
    const world = { width: 3400, height: 2100 };
    const cellArea = { x: 128, y: 934, width: 156, height: 122 };
    const cellEntrance = { x: 284, y: 968, width: 28, height: 46 };
    const cellDoorClosed = { x: 294, y: 974, width: 8, height: 34 };
    const exitZone = { x: 3140, y: 216, width: 120, height: 82, type: "front_gate" };
    const serviceExit = { x: 3046, y: 1832, width: 142, height: 70, type: "service_truck" };
    const sewerExit = { x: 328, y: 1838, width: 96, height: 56, type: "sewer" };
    const playerStart = { x: 166, y: 964 };

    const securityCameras = [
        { x: 724, y: 844, baseDir: Math.PI / 2, dir: Math.PI / 2, sweep: 0.22, angle: 0.56, range: 112, speed: 0.009, phase: 0.2, cooldown: 0 },
        { x: 1488, y: 844, baseDir: Math.PI / 2, dir: Math.PI / 2, sweep: 0.22, angle: 0.56, range: 116, speed: 0.009, phase: 1.2, cooldown: 0 },
        { x: 2254, y: 844, baseDir: Math.PI / 2, dir: Math.PI / 2, sweep: 0.2, angle: 0.54, range: 112, speed: 0.01, phase: 2.1, cooldown: 0 },
        { x: 2976, y: 844, baseDir: Math.PI / 2, dir: Math.PI / 2, sweep: 0.2, angle: 0.52, range: 104, speed: 0.01, phase: 0.8, cooldown: 0 },
        { x: 3020, y: 1528, baseDir: Math.PI / 2, dir: Math.PI / 2, sweep: 0.18, angle: 0.5, range: 92, speed: 0.011, phase: 1.6, cooldown: 0 },
        { x: 446, y: 1734, baseDir: -Math.PI / 2, dir: -Math.PI / 2, sweep: 0.18, angle: 0.46, range: 82, speed: 0.0085, phase: 0.6, cooldown: 0 }
    ];

    const hidingSpots = [
        { area: { x: 548, y: 530, width: 124, height: 92 }, door: { x: 668, y: 730, width: 8, height: 30 }, name: "Laundry" },
        { area: { x: 1316, y: 530, width: 124, height: 92 }, door: { x: 1440, y: 730, width: 8, height: 30 }, name: "Infirmary" },
        { area: { x: 2086, y: 530, width: 124, height: 92 }, door: { x: 2210, y: 730, width: 8, height: 30 }, name: "Workshop" },
        { area: { x: 2848, y: 430, width: 128, height: 96 }, door: { x: 2974, y: 730, width: 8, height: 30 }, name: "Camera Room" },
        { area: { x: 630, y: 1494, width: 124, height: 92 }, door: { x: 748, y: 1332, width: 8, height: 30 }, name: "Storage" },
        { area: { x: 1408, y: 1494, width: 124, height: 92 }, door: { x: 1528, y: 1332, width: 8, height: 30 }, name: "Kitchen" },
        { area: { x: 2178, y: 1494, width: 124, height: 92 }, door: { x: 2298, y: 1332, width: 8, height: 30 }, name: "Control" },
        { area: { x: 2898, y: 1652, width: 126, height: 92 }, door: { x: 3002, y: 1538, width: 8, height: 30 }, name: "Garage" }
    ];

    const cabinets = [
        { x: 314, y: 812, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Cell cabinet" },
        { x: 736, y: 774, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Laundry cabinet" },
        { x: 1500, y: 774, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Infirmary cabinet" },
        { x: 2264, y: 774, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Workshop cabinet" },
        { x: 3032, y: 774, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Camera room locker" },
        { x: 740, y: 1388, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Storage cabinet" },
        { x: 1514, y: 1388, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Kitchen cabinet" },
        { x: 2286, y: 1388, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Control cabinet" },
        { x: 3034, y: 1548, width: 56, height: 46, opened: false, hasLoot: true, searched: false, name: "Garage locker" }
    ];

    const interactables = {
        patrolBoard: { x: 2730, y: 934, width: 108, height: 56, name: "Patrol Board" },
        powerSwitch: { x: 2450, y: 1498, width: 46, height: 72, name: "Power Switch" },
        truck: { x: 2972, y: 1780, width: 190, height: 108, name: "Service Truck" },
        sewerHatch: { x: 324, y: 1842, width: 72, height: 48, name: "Sewer Hatch" },
        craftBench: { x: 924, y: 1490, width: 104, height: 46, name: "Craft Bench" },
        scheduleDesk: { x: 2992, y: 918, width: 96, height: 48, name: "Schedule Desk" }
    };

    const walls = [
        { x: 0, y: 0, width: world.width, height: 20 },
        { x: 0, y: world.height - 20, width: world.width, height: 20 },
        { x: 0, y: 0, width: 20, height: world.height },
        { x: world.width - 20, y: 0, width: 20, height: world.height },

        // cell block and spawn
        { x: 84, y: 760, width: 20, height: 610 },
        { x: 84, y: 760, width: 220, height: 20 },
        { x: 84, y: 1350, width: 220, height: 20 },
        { x: 284, y: 760, width: 20, height: 184 },
        { x: 284, y: 1060, width: 20, height: 310 },
        { x: 104, y: 944, width: 180, height: 20 },
        { x: 104, y: 1048, width: 180, height: 20 },



        // top rooms row - all open downward through door gaps
        { x: 420, y: 320, width: 20, height: 540 },
        { x: 980, y: 320, width: 20, height: 540 },
        { x: 440, y: 320, width: 540, height: 20 },
        { x: 440, y: 840, width: 220, height: 20 },
        { x: 760, y: 840, width: 220, height: 20 },

        { x: 1180, y: 320, width: 20, height: 540 },
        { x: 1760, y: 320, width: 20, height: 540 },
        { x: 1200, y: 320, width: 560, height: 20 },
        { x: 1200, y: 840, width: 240, height: 20 },
        { x: 1536, y: 840, width: 224, height: 20 },

        { x: 1940, y: 320, width: 20, height: 540 },
        { x: 2520, y: 320, width: 20, height: 540 },
        { x: 1960, y: 320, width: 560, height: 20 },
        { x: 1960, y: 840, width: 240, height: 20 },
        { x: 2296, y: 840, width: 224, height: 20 },

        // guarded camera / front gate block with a screening lane
        { x: 2700, y: 220, width: 20, height: 640 },
        { x: 3220, y: 220, width: 20, height: 640 },
        { x: 2720, y: 220, width: 500, height: 20 },
        { x: 2720, y: 840, width: 220, height: 20 },
        { x: 3038, y: 840, width: 182, height: 20 },
        { x: 3080, y: 240, width: 20, height: 150 },
        { x: 3080, y: 476, width: 20, height: 150 },
        { x: 2810, y: 510, width: 210, height: 20 },
        { x: 3150, y: 510, width: 70, height: 20 },
        { x: 2850, y: 530, width: 20, height: 170 },

        // bottom rooms row - all open upward through door gaps
        { x: 520, y: 1340, width: 20, height: 520 },
        { x: 1080, y: 1340, width: 20, height: 520 },
        { x: 540, y: 1840, width: 540, height: 20 },
        { x: 540, y: 1220, width: 220, height: 20 },
        { x: 860, y: 1220, width: 220, height: 20 },

        { x: 1300, y: 1340, width: 20, height: 520 },
        { x: 1860, y: 1340, width: 20, height: 520 },
        { x: 1320, y: 1840, width: 540, height: 20 },
        { x: 1320, y: 1220, width: 220, height: 20 },
        { x: 1640, y: 1220, width: 220, height: 20 },

        { x: 2080, y: 1340, width: 20, height: 520 },
        { x: 2640, y: 1340, width: 20, height: 520 },
        { x: 2100, y: 1840, width: 540, height: 20 },
        { x: 2100, y: 1220, width: 220, height: 20 },
        { x: 2420, y: 1220, width: 220, height: 20 },

        // garage / service exit room with a checkpoint lane
        { x: 2840, y: 1540, width: 20, height: 360 },
        { x: 3240, y: 1540, width: 20, height: 360 },
        { x: 2860, y: 1880, width: 380, height: 20 },
        { x: 2860, y: 1540, width: 120, height: 20 },
        { x: 3066, y: 1540, width: 174, height: 20 },
        { x: 2910, y: 1646, width: 180, height: 20 },
        { x: 3170, y: 1646, width: 70, height: 20 },
        { x: 2976, y: 1666, width: 20, height: 154 },

        // left sewer niche with a narrow guarded throat
        { x: 260, y: 1700, width: 20, height: 180 },
        { x: 260, y: 1880, width: 220, height: 20 },
        { x: 460, y: 1700, width: 20, height: 180 },
        { x: 260, y: 1700, width: 60, height: 20 },
        { x: 396, y: 1700, width: 84, height: 20 },
        { x: 280, y: 1768, width: 88, height: 20 },
        { x: 416, y: 1768, width: 44, height: 20 }
    ];

    const navNodes = [
        { id: "cell", x: 192, y: 998, links: ["cellDoor"] },
        { id: "cellDoor", x: 344, y: 998, links: ["cell", "westHall"] },
        { id: "westHall", x: 520, y: 1040, links: ["cellDoor", "centerHallA", "topRoom1Door", "bottomRoom1Door", "sewerHall"] },
        { id: "centerHallA", x: 1060, y: 1040, links: ["westHall", "centerHallB", "topRoom2Door", "bottomRoom2Door"] },
        { id: "centerHallB", x: 1840, y: 1040, links: ["centerHallA", "eastHall", "topRoom3Door", "bottomRoom3Door"] },
        { id: "eastHall", x: 2620, y: 1040, links: ["centerHallB", "guardHall", "cameraDoor", "bottomRoom3Door", "garageDoor"] },
        { id: "guardHall", x: 2960, y: 1040, links: ["eastHall", "cameraDoor", "garageDoor", "frontApproach"] },
        { id: "frontApproach", x: 2960, y: 760, links: ["guardHall", "cameraDoor", "frontCheckpoint"] },
        { id: "frontCheckpoint", x: 3096, y: 620, links: ["frontApproach", "cameraInner", "frontGate"] },
        { id: "frontGate", x: 3190, y: 258, links: ["frontCheckpoint"] },

        { id: "topRoom1Door", x: 710, y: 790, links: ["westHall", "topRoom1Inner"] },
        { id: "topRoom1Inner", x: 710, y: 560, links: ["topRoom1Door", "topRoom2Inner"] },
        { id: "topRoom2Door", x: 1490, y: 790, links: ["centerHallA", "topRoom2Inner"] },
        { id: "topRoom2Inner", x: 1490, y: 560, links: ["topRoom2Door", "topRoom1Inner", "topRoom3Inner"] },
        { id: "topRoom3Door", x: 2250, y: 790, links: ["centerHallB", "topRoom3Inner"] },
        { id: "topRoom3Inner", x: 2250, y: 560, links: ["topRoom3Door", "topRoom2Inner", "cameraInner"] },
        { id: "cameraDoor", x: 2980, y: 790, links: ["guardHall", "frontApproach", "cameraInner"] },
        { id: "cameraInner", x: 2980, y: 520, links: ["cameraDoor", "topRoom3Inner", "frontCheckpoint"] },

        { id: "bottomRoom1Door", x: 810, y: 1290, links: ["westHall", "bottomRoom1Inner", "sewerHall"] },
        { id: "bottomRoom1Inner", x: 810, y: 1580, links: ["bottomRoom1Door", "bottomRoom2Inner"] },
        { id: "bottomRoom2Door", x: 1590, y: 1290, links: ["centerHallA", "bottomRoom2Inner"] },
        { id: "bottomRoom2Inner", x: 1590, y: 1580, links: ["bottomRoom2Door", "bottomRoom1Inner", "bottomRoom3Inner"] },
        { id: "bottomRoom3Door", x: 2370, y: 1290, links: ["centerHallB", "eastHall", "bottomRoom3Inner"] },
        { id: "bottomRoom3Inner", x: 2370, y: 1580, links: ["bottomRoom3Door", "bottomRoom2Inner", "garageInner"] },
        { id: "garageDoor", x: 3020, y: 1498, links: ["eastHall", "guardHall", "garageInner"] },
        { id: "garageInner", x: 3040, y: 1720, links: ["garageDoor", "bottomRoom3Inner", "truckCheckpoint"] },
        { id: "truckCheckpoint", x: 3074, y: 1744, links: ["garageInner", "truckExit"] },
        { id: "truckExit", x: 3118, y: 1848, links: ["truckCheckpoint"] },

        { id: "sewerHall", x: 426, y: 1710, links: ["westHall", "bottomRoom1Door", "sewerCheckpoint"] },
        { id: "sewerCheckpoint", x: 372, y: 1802, links: ["sewerHall", "sewerNode"] },
        { id: "sewerNode", x: 374, y: 1860, links: ["sewerCheckpoint"] }
    ];

    const decor = buildDecor();
    return { world, cellArea, cellEntrance, cellDoorClosed, exitZone, serviceExit, sewerExit, playerStart, hidingSpots, cabinets, securityCameras, walls, decor, interactables, navNodes };
}



function buildDecor() {
    const decor = { cellDoorsTop: [], cellDoorsBottom: [], bunks: [], desks: [], fences: [], roadMarks: [], lights: [], yardLines: [], benches: [], tables: [], toilets: [], drains: [], labels: [], lockers: [], vents: [], cameras: [] };

    for (let i = 0; i < 6; i++) {
        const x = 106 + i * 28;
        decor.cellDoorsTop.push({ x, y: 790, width: 18, height: 130 });
        decor.cellDoorsBottom.push({ x, y: 1072, width: 18, height: 136 });
    }

    [[564,408],[738,408],[1318,408],[1492,408],[2088,408],[2262,408],[2850,318],[3018,318],[632,1760],[808,1760],[1412,1760],[1588,1760],[2188,1760],[2364,1760],[2910,1760]].forEach(([x,y]) => decor.bunks.push({ x, y, width: 110, height: 22 }));
    [[598,688],[1368,688],[2136,688],[2906,604],[664,1462],[1444,1462],[2218,1462],[2930,1660]].forEach(([x,y]) => decor.desks.push({ x, y, width: 84, height: 18 }));
    [[520,1018],[760,1018],[1000,1018],[1240,1018],[1480,1018],[1720,1018],[1960,1018],[2200,1018],[2440,1018],[2680,1018],[2920,1018],[2874,726],[2986,726],[2940,1588],[294,1668]].forEach(([x,y]) => decor.benches.push({ x, y, width: 118, height: 16 }));
    [[610,1122],[1480,1122],[2280,1122],[926,1520],[1706,1520],[2480,1520],[3040,1710],[2918,560],[3096,560],[2904,1700],[324,1734]].forEach(([x,y]) => decor.tables.push({ x, y, width: 70, height: 54 }));
    [[558,644],[1326,644],[2096,644],[2860,558],[640,1532],[1418,1532],[2194,1532],[2940,1728]].forEach(([x,y]) => decor.toilets.push({ x, y, width: 24, height: 18 }));
    [[332,1848],[350,1858],[368,1868],[386,1878],[404,1888]].forEach(([x,y]) => decor.drains.push({ x, y, width: 12, height: 4 }));
    [[548,820,'LAUNDRY'],[1318,820,'INFIRMARY'],[2088,820,'WORKSHOP'],[2834,820,'CAMERA ROOM'],[634,1298,'STORAGE'],[1412,1298,'KITCHEN'],[2190,1298,'CONTROL'],[2910,1498,'GARAGE'],[2716,926,'PATROL BOARD'],[3010,598,'CHECKPOINT'],[3078,244,'EXIT'],[3002,1640,'TRUCK CHECK'],[318,1824,'SEWER'],[304,1740,'DRAIN CHECK']].forEach(([x,y,text]) => decor.labels.push({ x, y, text }));
    [[590,516],[1360,516],[2130,516],[2890,416],[672,1484],[1450,1484],[2226,1484],[2960,1646]].forEach(([x,y]) => decor.lockers.push({ x, y, width: 22, height: 68 }));
    [[604,1830],[694,1830],[784,1830],[1386,1830],[1476,1830],[1566,1830],[2164,1830],[2254,1830],[2344,1830]].forEach(([x,y]) => decor.vents.push({ x, y, width: 62, height: 10 }));
    [[3140,236],[3140,266],[3140,296],[3140,326],[3140,356],[3140,386],[3140,416],[3140,446]].forEach(([x,y]) => decor.fences.push({ x, y, width: 6, height: 24 }));

    for (let i = 0; i < 11; i++) decor.roadMarks.push({ x: 412 + i * 242, y: 1046, width: 110, height: 6 });
    for (let i = 0; i < 9; i++) decor.lights.push({ x: 180 + i * 340, y: 94, width: 70, height: 8 });
    for (let i = 0; i < 7; i++) decor.yardLines.push({ x: 3044, y: 214 + i * 36, width: 170, height: 2 });

    return decor;
}



function createGuards() {
    const specs = [
        { x: 560, y: 1012, zone: { x: 320, y: 780, width: 980, height: 1060 }, patrolPoints: [{ x: 520, y: 1040 }, { x: 710, y: 790 }, { x: 810, y: 1290 }, { x: 426, y: 1710 }, { x: 1060, y: 1040 }], hearingRange: 250, visionRange: 220 },
        { x: 1040, y: 1012, zone: { x: 700, y: 740, width: 980, height: 1140 }, patrolPoints: [{ x: 1060, y: 1040 }, { x: 1490, y: 790 }, { x: 1590, y: 1290 }, { x: 710, y: 560 }, { x: 1590, y: 1580 }], hearingRange: 255, visionRange: 228 },
        { x: 1820, y: 1012, zone: { x: 1260, y: 740, width: 980, height: 1140 }, patrolPoints: [{ x: 1840, y: 1040 }, { x: 2250, y: 790 }, { x: 2370, y: 1290 }, { x: 1490, y: 560 }, { x: 2370, y: 1580 }], hearingRange: 265, visionRange: 235, nightHunter: true },
        { x: 2620, y: 1012, zone: { x: 2000, y: 740, width: 1020, height: 1160 }, patrolPoints: [{ x: 2620, y: 1040 }, { x: 2960, y: 1040 }, { x: 2980, y: 790 }, { x: 3020, y: 1498 }, { x: 2370, y: 1290 }, { x: 3074, y: 1744 }], hearingRange: 275, visionRange: 245, nightHunter: true },
        { x: 2980, y: 940, zone: { x: 2560, y: 220, width: 660, height: 980 }, patrolPoints: [{ x: 2960, y: 1040 }, { x: 2980, y: 790 }, { x: 3096, y: 620 }, { x: 3190, y: 258 }, { x: 2980, y: 520 }], hearingRange: 285, visionRange: 255, exitGuard: true, nightHunter: true, patrolSpeed: 1.06 },
        { x: 810, y: 1560, zone: { x: 420, y: 1200, width: 900, height: 720 }, patrolPoints: [{ x: 810, y: 1290 }, { x: 810, y: 1580 }, { x: 426, y: 1710 }, { x: 372, y: 1802 }, { x: 520, y: 1040 }], hearingRange: 260, visionRange: 230 },
        { x: 1590, y: 1560, zone: { x: 1220, y: 1200, width: 980, height: 720 }, patrolPoints: [{ x: 1590, y: 1290 }, { x: 1590, y: 1580 }, { x: 2370, y: 1580 }, { x: 1840, y: 1040 }, { x: 2370, y: 1290 }], hearingRange: 270, visionRange: 240, nightHunter: true },
        { x: 3040, y: 1760, zone: { x: 2520, y: 1200, width: 700, height: 720 }, patrolPoints: [{ x: 3020, y: 1498 }, { x: 3040, y: 1720 }, { x: 3074, y: 1744 }, { x: 3118, y: 1848 }, { x: 2960, y: 1040 }], hearingRange: 290, visionRange: 255, exitGuard: true, nightHunter: true, patrolSpeed: 1.08 },
        { x: 384, y: 1768, zone: { x: 240, y: 1580, width: 420, height: 320 }, patrolPoints: [{ x: 426, y: 1710 }, { x: 372, y: 1802 }, { x: 374, y: 1860 }, { x: 520, y: 1040 }], hearingRange: 275, visionRange: 238, exitGuard: true, nightHunter: true, patrolSpeed: 1.05 },
        { x: 3098, y: 612, zone: { x: 2760, y: 220, width: 480, height: 620 }, patrolPoints: [{ x: 3096, y: 620 }, { x: 3190, y: 258 }, { x: 2980, y: 520 }, { x: 2960, y: 760 }], hearingRange: 300, visionRange: 268, exitGuard: true, nightHunter: true, patrolSpeed: 1.1 }
    ];
    return specs.map((spec, index) => new Guard(spec.x, spec.y, 44, spec.zone, index + 1, spec));
}


function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function setOverlayVisibility(element, visible) {
    element.classList.toggle("hidden", !visible);
    element.classList.toggle("visible", visible);
}

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    camera.width = canvas.width;
    camera.height = canvas.height;
}

function updateCamera(immediate = false) {
    const activeWorld = getSceneWorld();
    camera.targetX = player.x + player.size / 2 - camera.width / 2;
    camera.targetY = player.y + player.size / 2 - camera.height / 2;
    camera.targetX = clamp(camera.targetX, 0, Math.max(0, activeWorld.width - camera.width));
    camera.targetY = clamp(camera.targetY, 0, Math.max(0, activeWorld.height - camera.height));

    if (immediate || !game.running) {
        camera.x = camera.targetX;
        camera.y = camera.targetY;
    } else {
        const lerp = (game.scene === "prison" && anyGuardChasing()) ? 0.16 : 0.11;
        camera.x += (camera.targetX - camera.x) * lerp;
        camera.y += (camera.targetY - camera.y) * lerp;
    }
}

function nearRect(a, b, margin = 26) {
    return !(a.x + a.width < b.x - margin || a.x > b.x + b.width + margin || a.y + a.height < b.y - margin || a.y > b.y + b.height + margin);
}

function isLineBlockedByWalls(x1, y1, x2, y2) {
    const steps = 44;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        for (const wall of getSceneWalls()) {
            if (px >= wall.x && px <= wall.x + wall.width && py >= wall.y && py <= wall.y + wall.height) {
                return true;
            }
        }
    }
    return false;
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

function alertGuardsToPoint(position, source = "generic") {
    const byDistance = [...getActiveGuards()].sort((a, b) => a.distanceToPoint(position.x, position.y) - b.distanceToPoint(position.x, position.y));
    const responders = byDistance.slice(0, Math.min(3, byDistance.length));
    responders.forEach(guard => guard.receiveAlert(position));
    if (source === "camera") {
        game.cameraAlarmTimer = 180;
        game.alertedGuardIds = responders.map(g => g.id);
    }
}

function worldPointerPosition() {
    return { x: camera.x + clamp(pointer.x, 0, canvas.width), y: camera.y + clamp(pointer.y, 0, canvas.height) };
}

function nearWorldRect(a, b, margin = 24) {
    return !(a.x + a.width < b.x - margin || a.x > b.x + b.width + margin || a.y + a.height < b.y - margin || a.y > b.y + b.height + margin);
}

function updateExploration() {
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    const radius = game.isDay ? 220 : 180;
    const last = game.explored[game.explored.length - 1];
    if (!last || Math.hypot(last.x - px, last.y - py) > 54) {
        game.explored.push({ x: px, y: py, radius });
        if (game.explored.length > 80) game.explored.shift();
    }
}

function updateGuardPressure() {
    let nearest = Infinity;
    for (const guard of getActiveGuards()) {
        const d = Math.hypot((guard.x + guard.size / 2) - (player.x + player.size / 2), (guard.y + guard.size / 2) - (player.y + player.size / 2));
        if (d < nearest) nearest = d;
    }
    if (!isFinite(nearest)) nearest = 9999;
    const tension = anyGuardChasing() ? 1 : clamp(1 - nearest / 340, 0, 1);
    game.guardPressure = tension;
}

function getInteractionPrompt() {
    if (!game.running || game.paused || game.gameOver || game.win) return null;
    const playerRect = player.getRect();

    for (const cabinet of cabinets) {
        if (!cabinet.opened && nearRect(playerRect, cabinet, 18)) {
            return { title: 'Search cabinet', detail: 'Press E to loot contraband', tone: '#ffd166' };
        }
    }

    for (const spot of hidingSpots) {
        if (!player.isHidden && nearWorldRect(playerRect, spot.area, 34)) {
            return { title: `Hide in ${spot.name}`, detail: 'Break line of sight and wait it out', tone: '#72d6ff' };
        }
    }

    for (const door of lockedDoors) {
        if (!door.unlocked && nearWorldRect(playerRect, door.promptArea, 20)) {
            return { title: `Unlock ${door.name}`, detail: 'Needs one keycard', tone: '#ffd166' };
        }
    }

    for (const door of lockedDoors) {
        if (!door.unlocked && nearWorldRect(playerRect, door.promptArea, 20)) {
            if (game.mode === "roam") {
                door.unlocked = true;
                setPopup(`${door.name} opened for free roam.`, "success", 110);
            } else if (player.useKeycard()) {
                door.unlocked = true;
                game.hintText = `${door.name} unlocked.`;
                setPopup(`${door.name} door unlocked.`, "success", 120);
            } else {
                setPopup("You need a keycard for that room.", "empty", 110);
            }
            return true;
        }
    }

    if (nearWorldRect(playerRect, interactables.patrolBoard, 18) || nearWorldRect(playerRect, interactables.scheduleDesk, 18)) {
        return { title: 'Read patrol intel', detail: 'Press E to reveal routes on the minimap', tone: '#d9ed92' };
    }

    if (nearWorldRect(playerRect, interactables.craftBench, 18)) {
        return { title: 'Craft breach kit', detail: 'Needs a keycard and cutters', tone: '#f4a261' };
    }

    if (nearWorldRect(playerRect, interactables.powerSwitch, 18)) {
        return { title: 'Kill power', detail: game.isDay ? 'Only available at night' : 'Press E to disable cameras briefly', tone: '#ff7b7b' };
    }

    if (nearWorldRect(playerRect, interactables.sewerHatch, 20)) {
        return game.mode === "roam"
            ? { title: 'Sewer hatch', detail: 'Press E to preview the sewer escape map', tone: '#9cc17b' }
            : { title: 'Sewer hatch', detail: 'Needs cutters and nighttime', tone: '#9cc17b' };
    }

    if (nearWorldRect(playerRect, interactables.truck, 20)) {
        return game.mode === "roam"
            ? { title: 'Vehicle route', detail: 'Press E to preview the car chase map', tone: '#bde0fe' }
            : { title: 'Service truck route', detail: 'Needs disguise or keycard at night', tone: '#bde0fe' };
    }

    if (canUseLockpickAtCellDoor()) {
        return { title: 'Pick cell door', detail: 'Press E to try the lock', tone: '#ffd166' };
    }

    if (!game.isDay && !cellDoorUnlocked && rectsOverlap(player.getCollisionRect(), getCellLockpickZone())) {
        return { title: 'Cell lock', detail: 'You need a lockpick first', tone: '#ffcf70' };
    }

    return null;
}

function throwBottle() {
    if (!game.running || game.paused || game.gameOver || game.win) return;
    if (!player.useBottle()) {
        setPopup("No bottle to throw.", "empty", 110);
        return;
    }
    const target = worldPointerPosition();
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(260, dist);
    const point = { x: px + dx / dist * clamped, y: py + dy / dist * clamped };
    alertGuardsToPoint(point, "bottle");
    game.hintText = "Bottle thrown. Guards are investigating the noise.";
    setPopup("Bottle distraction thrown.", "success", 120);
}

function tryUseUniform() {
    if (!player.useUniform()) {
        setPopup("No guard uniform available.", "empty", 110);
        return;
    }
    game.hintText = "Guard disguise active. Move naturally and avoid sprinting near guards.";
    setPopup("Guard disguise active.", "success", 130);
}

function updateSecurityCameras() {
    if (game.mode === "roam" || game.scene !== "prison") return;
    for (const cam of securityCameras) {
        cam.dir = cam.baseDir + Math.sin(game.frame * cam.speed + cam.phase) * cam.sweep;
        if (cam.cooldown > 0) cam.cooldown--;

        if (game.isDay || game.blackoutTimer > 0 || player.isHidden || player.isInsideCell) continue;

        const px = player.x + player.size / 2;
        const py = player.y + player.size / 2;
        const dx = px - cam.x;
        const dy = py - cam.y;
        const distance = Math.hypot(dx, dy);
        if (distance > cam.range) continue;
        if (isLineBlockedByWalls(cam.x, cam.y, px, py)) continue;

        const angleToPlayer = Math.atan2(dy, dx);
        const delta = Math.abs(normalizeAngle(angleToPlayer - cam.dir));
        if (delta > cam.angle / 2) continue;

        const disguised = player.isDisguised && player.isDisguised();
        if (disguised) {
            player.addDisguiseHeat(0.62 + (player.speedRatio || 0) * 0.55);
            if (game.frame - game.lastDisguiseWarningFrame > 55 && player.disguiseHeat >= 34 && player.disguiseHeat < 88) {
                game.lastDisguiseWarningFrame = game.frame;
                game.hintText = "Cameras are reading the disguise. Slow down and avoid checkpoints.";
                setPopup("Camera scrutiny rising.", "empty", 85);
            }
            if (player.disguiseHeat < 88 && cam.cooldown <= 0) {
                cam.cooldown = 16;
                continue;
            }
        }

        if (cam.cooldown <= 0) {
            alertGuardsToPoint({ x: px, y: py }, "camera");
            cam.cooldown = 90;
            if (game.frame - game.lastCameraAlertFrame > 45) {
                playSound("alert");
                game.lastCameraAlertFrame = game.frame;
                game.hintText = disguised ? "The disguise failed under camera scrutiny. Guards are moving in." : "Security camera spotted you. Guards are moving in.";
                setPopup(disguised ? "Disguise blown by camera." : "Camera alert triggered.", "danger", 130);
            }
        }
    }
}


function handleInteract() {
    if (!game.running || game.gameOver || game.win) return false;

    const playerRect = player.getRect();

    for (const cabinet of cabinets) {
        if (!cabinet.opened && nearRect(playerRect, cabinet, 18)) {
            cabinet.opened = true;
            cabinet.searched = true;
            const lootTable = ["lockpick", "bottle", "keycard", "cutter", "uniform", "routes", "nothing"];
            const weighted = cabinet.name.includes("Cell") ? ["lockpick", "bottle", "nothing"] : lootTable;
            const scriptedLoot = cabinet.name === "Camera room locker" ? "routes" : cabinet.name === "Control cabinet" ? "cutter" : cabinet.name === "Garage locker" ? "uniform" : null;
            const found = cabinet.hasLoot ? (scriptedLoot || weighted[Math.floor(Math.random() * weighted.length)]) : "nothing";
            if (found !== "nothing") {
                player.addItem(found);
                game.hintText = `You searched ${cabinet.name.toLowerCase()}.`;
                setPopup(`Found ${found === "routes" ? "route intel" : found}.`, "success");
            } else {
                game.hintText = `You searched ${cabinet.name.toLowerCase()}.`;
                setPopup("Nothing useful inside.", "empty");
            }
            if (player.lockpicks <= 0) game.selectedInventoryItem = null;
            playSound("ui");
            return true;
        }
    }

    for (const door of lockedDoors) {
        if (!door.unlocked && nearWorldRect(playerRect, door.promptArea, 20)) {
            if (game.mode === "roam") {
                door.unlocked = true;
                setPopup(`${door.name} opened for free roam.`, "success", 110);
            } else if (player.useKeycard()) {
                door.unlocked = true;
                game.hintText = `${door.name} unlocked.`;
                setPopup(`${door.name} door unlocked.`, "success", 120);
            } else {
                setPopup("You need a keycard for that room.", "empty", 110);
            }
            return true;
        }
    }

    if (nearWorldRect(playerRect, interactables.patrolBoard, 18) || nearWorldRect(playerRect, interactables.scheduleDesk, 18)) {
        player.routeIntel = true;
        setPopup("Patrol routes added to minimap.", "success", 130);
        game.hintText = "Patrol schedule learned. Route overlay unlocked.";
        return true;
    }

    if (nearWorldRect(playerRect, interactables.craftBench, 18)) {
        if (player.keycards > 0 && player.cutters > 0) {
            player.useKeycard();
            player.useCutter();
            player.lockpicks += 2;
            setPopup("Crafted an improvised breach kit.", "success", 130);
            game.hintText = "The bench let you turn contraband into extra escape tools.";
        } else {
            setPopup("Crafting needs a keycard and wire cutters.", "empty", 120);
        }
        return true;
    }

    if (nearWorldRect(playerRect, interactables.powerSwitch, 18)) {
        if (game.isDay) {
            setPopup("Too risky during the day.", "empty", 110);
        } else {
            game.blackoutTimer = 60 * 12;
            setPopup("Cell block blackout triggered.", "danger", 130);
            game.hintText = "Lights out. Cameras are disabled for a moment.";
        }
        return true;
    }

    if (nearWorldRect(playerRect, interactables.sewerHatch, 20)) {
        if (game.mode === "roam") {
            game.hintText = "Roam preview: entering the sewer escape map.";
            setPopup("Sewer route preview opened.", "success", 110);
            enterVentPhase();
        } else if (!game.isDay && player.useCutter()) {
            game.hintText = "You forced the vent hatch open.";
            enterVentPhase();
        } else {
            setPopup("You need wire cutters and nighttime for the vent route.", "empty", 120);
        }
        return true;
    }

    if (nearWorldRect(playerRect, interactables.truck, 20)) {
        if (game.mode === "roam") {
            game.hintText = "Roam preview: entering the vehicle escape map.";
            setPopup("Vehicle route preview opened.", "success", 110);
            enterCarPhase();
        } else if (!game.isDay && (player.isDisguised() || player.keycards > 0)) {
            if (!player.isDisguised()) player.useKeycard();
            game.hintText = "You hijacked the breakout car.";
            enterCarPhase();
        } else {
            setPopup("Car escape needs a disguise or a keycard at night.", "empty", 120);
        }
        return true;
    }

    if (canUseLockpickAtCellDoor()) {
        player.useLockpick();
        if (Math.random() < 0.25) {
            cellDoorUnlocked = true;
            activeCellDoor = null;
            player.waitingForDay = false;
            player.canMove = true;
            player.state = "FREE_ROAM";
            game.hintText = "The cell door clicked open.";
            setPopup("Lockpick worked. Get to the door.", "success");
        } else {
            game.hintText = "The lock resisted.";
            setPopup(`Lockpick failed. ${player.lockpicks} left.`, "danger");
        }
        playSound("ui");
        return true;
    }

    if (!game.isDay && !cellDoorUnlocked && rectsOverlap(player.getCollisionRect(), getCellLockpickZone())) {
        setPopup("You need a lockpick first.", "empty");
        return true;
    }

    return false;
}

function startRun() {
    setupAudio();
    const modeConfig = getModeConfig();
    game.maxDays = modeConfig.days;
    game.currentDay = 1;
    game.scene = "prison";
    setPlayerBaseSpeedForScene();
    player.resetForNewRun();
    player.lives = modeConfig.lives;
    game.running = true;
    game.paused = false;
    game.isDay = true;
    game.timeCounter = 0;
    game.timeLimit = game.mode === "roam" ? 60 * 60 : 60 * 60;
    game.gameOver = false;
    game.win = false;
    game.caughtFlash = 0;
    game.cameraAlarmTimer = 0;
    game.alertedGuardIds = [];
    game.blackoutTimer = 0;
    game.explored = [];
    game.inventoryOpen = false;
    game.selectedInventoryItem = null;
    game.hintText = game.mode === "roam"
        ? "Roam mode: explore freely. Guards are disabled and both sewer + vehicle escape previews are open."
        : "Five days. One minute per day and one minute per night. Move fast.";
    activeCellDoor = null;
    cellDoorUnlocked = game.mode === "roam";
    resetLockedDoors();
    resetPhaseChasers();

    for (const cabinet of cabinets) {
        cabinet.opened = false;
        cabinet.searched = false;
    }

    for (const guard of getActiveGuards()) {
        guard.resetToPost();
        guard.fsm.setState("PATROL");
        const modeSpeed = modeConfig.guardSpeed || 1;
        guard.basePatrolSpeed = (guard.basePatrolSpeedOriginal || guard.basePatrolSpeed) * modeSpeed;
        guard.baseSuspiciousSpeed = (guard.baseSuspiciousSpeedOriginal || guard.baseSuspiciousSpeed) * modeSpeed;
        guard.baseChaseSpeed = (guard.baseChaseSpeedOriginal || guard.baseChaseSpeed) * modeSpeed;
        guard.baseVisionRange = (guard.baseVisionRangeOriginal || guard.baseVisionRange) * (modeConfig.suspicion || 1);
        guard.baseHearingRange = (guard.baseHearingRangeOriginal || guard.baseHearingRange) * (modeConfig.suspicion || 1);
    }

    for (const cam of securityCameras) {
        cam.dir = cam.baseDir;
        cam.cooldown = 0;
    }

    stopMenuMusic();
    setOverlayVisibility(menuOverlay, false);
    setOverlayVisibility(pauseOverlay, false);
    setOverlayVisibility(howToPlayOverlay, false);
    updateCamera(true);
    syncMuteLabel();
    stopMenuMusic();
    startAmbient();
    playSound("ui");
    document.dispatchEvent(new CustomEvent("gameStart"));
}

function restartRun() {
    startRun();
}

function pauseGame() {
    if (!game.running || game.gameOver || game.win) return;
    game.paused = true;
    setOverlayVisibility(pauseOverlay, true);
    if (audio.ambient) audio.ambient.pause();
}

function resumeGame() {
    if (!game.running) return;
    game.paused = false;
    setOverlayVisibility(pauseOverlay, false);
    startAmbient();
    playSound("ui");
}

function endRun(win) {
    game.win = win;
    game.gameOver = !win;
    game.paused = false;
    if (win) {
        playSound("win");
        document.dispatchEvent(new CustomEvent("gameWin"));
    } else {
        document.dispatchEvent(new CustomEvent("gameOver"));
    }
    stopAmbient();
    setOverlayVisibility(menuOverlay, true);
    startMenuMusic();
}

function updateDayNightCycle() {
    if (game.mode === "roam" || game.scene !== "prison") {
        activeCellDoor = game.mode === "roam" ? null : activeCellDoor;
        return;
    }

    game.timeCounter++;
    if (game.timeCounter >= game.timeLimit) {
        game.timeCounter = 0;
        const wasNight = !game.isDay;
        game.isDay = !game.isDay;
        if (wasNight && game.isDay) {
            game.currentDay++;
            if (game.currentDay > game.maxDays) {
                game.hintText = "Five days passed. The prison locked down before you escaped.";
                endRun(false);
                return;
            }
        }
        game.hintText = game.isDay
            ? `Day ${game.currentDay}/${game.maxDays}: scout hard and prepare your route.`
            : `Night ${game.currentDay}/${game.maxDays}: this minute is your escape window.`;
        document.dispatchEvent(new CustomEvent(game.isDay ? "dayStart" : "nightStart"));
    }

    if (game.isDay) {
        activeCellDoor = null;
        cellDoorUnlocked = false;
    } else {
        activeCellDoor = cellDoorUnlocked ? null : cellDoorClosed;
    }
}

function isPlayerMoving() {
    return !!(keys.w || keys.a || keys.s || keys.d || keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright);
}

function anyGuardChasing() {
    return getActiveGuards().some(guard => guard.fsm.getState() === "CHASE");
}

function updateFootsteps() {
    if (!game.running || game.paused || game.gameOver || game.win) return;
    if (!isPlayerMoving()) return;
    if (game.frame % (keys.shift ? 28 : 18) === 0) {
        playSound("footstep");
    }
}

function updateGuards() {
    if (game.mode === "roam" || game.scene !== "prison") return;
    const activeGuards = getActiveGuards();
    const moving = isPlayerMoving();
    const sneaking = !!keys.shift;

    for (const guard of activeGuards) {
        guard.beginFrame();
    }

    const playerProtectedInCell = isPlayerProtectedInCell();

    for (const guard of activeGuards) {
        const before = guard.fsm.getState();
        guard.update(player, getSceneGuardWalls(), moving, sneaking, game.isDay, hidingSpots, playerProtectedInCell);
        const after = guard.fsm.getState();
        if (before !== "CHASE" && after === "CHASE" && game.frame - game.lastAlertFrame > 20) {
            playSound("alert");
            game.lastAlertFrame = game.frame;
            game.hintText = "A guard has spotted you. Break line of sight!";
            document.dispatchEvent(new CustomEvent("guardAlert"));
        }
    }

    if (game.isDay) return;

    const alerts = [];
    for (const guard of activeGuards) {
        if (guard.alertTriggered && guard.alertPosition) alerts.push({ source: guard, position: guard.alertPosition });
    }

    for (const alert of alerts) {
        for (const otherGuard of activeGuards) {
            if (otherGuard !== alert.source) otherGuard.receiveAlert(alert.position);
        }
    }
}

function handleCapture() {
    if (game.mode === "roam" || game.scene !== "prison") return;
    if (game.isDay || isPlayerProtectedInCell()) return;

    for (const guard of getActiveGuards()) {
        if (guard.fsm.getState() === "CHASE" && guard.isCloseEnoughToCapture(player)) {
            player.lives--;
            game.caughtFlash = 18;
            playSound("capture");
            game.hintText = player.lives > 0 ? "Caught. You lost a full day." : "All lives lost.";

            if (player.lives <= 0) {
                endRun(false);
                return;
            }

            if (player.lockpicks > 0) {
                setPopup(`Caught. You kept ${player.lockpicks} lockpick${player.lockpicks === 1 ? "" : "s"}.`, "empty", 180);
            }
            advanceToNextDay(`Caught on night ${game.currentDay}. Morning lockdown started.`);
            break;
        }
    }
}

function checkWin() {
    if (game.scene !== "prison") return;
    if (game.mode !== "roam" && !game.isDay && rectsOverlap(player.getRect(), exitZone)) {
        game.hintText = "Escape successful.";
        endRun(true);
    }
}

function update() {
    if (!game.running || game.paused || game.gameOver || game.win) return;
    game.frame++;
    if (wheelPulse > 0) wheelPulse -= 0.06;
    if (game.caughtFlash > 0) game.caughtFlash--;
    if (game.popupTimer > 0) game.popupTimer--;
    if (game.cameraAlarmTimer > 0) game.cameraAlarmTimer--;
    if (game.blackoutTimer > 0) game.blackoutTimer--;

    updateDayNightCycle();
    if (game.gameOver || game.win) return;
    updateExploration();

    if (game.scene === "prison") {
        player.isInsideCell = isPlayerProtectedInCell();
        const beingChased = game.mode !== "roam" && !game.isDay && anyGuardChasing() && !player.isInsideCell;

        player.update(keys, getSceneWalls(), activeCellDoor, game.isDay || game.mode === "roam", beingChased, getSceneHidingSpots(), cellArea, cellEntrance, cellDoorUnlocked || game.mode === "roam");
        player.isInsideCell = isPlayerProtectedInCell();
        player.x = clamp(player.x, 20, world.width - 20 - player.size);
        player.y = clamp(player.y, 20, world.height - 20 - player.size);

        updateGuards();
        if (game.mode !== "roam") updateSecurityCameras();
        updateGuardPressure();
        game.nearPrompt = getInteractionPrompt();
        handleCapture();
        checkWin();
    } else {
        updatePhaseScene();
        game.guardPressure = 1;
        game.nearPrompt = null;
    }

    updateCamera();
    updateFootsteps();
}

function drawRectWorld(rect, color) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x - camera.x, rect.y - camera.y, rect.width, rect.height);
}

function drawOutlinedWorldRect(rect, fill, stroke = "rgba(0,0,0,0.35)", lineWidth = 2, radius = 0) {
    const dx = rect.x - camera.x;
    const dy = rect.y - camera.y;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(dx, dy, rect.width, rect.height, radius);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillRect(dx, dy, rect.width, rect.height);
        ctx.strokeRect(dx, dy, rect.width, rect.height);
    }
    ctx.restore();
}

function drawShadowedWorldRect(rect, fill, shadow = "rgba(0,0,0,0.18)") {
    drawRectWorld({ x: rect.x + 4, y: rect.y + 5, width: rect.width, height: rect.height }, shadow);
    drawOutlinedWorldRect(rect, fill, "rgba(0,0,0,0.24)", 1.5, 3);
}

function drawTexturedFloor() {
    const tile = 64;
    const startX = -((camera.x % tile) + tile);
    const startY = -((camera.y % tile) + tile);
    const roomThemes = [
        { rect: { x: 440, y: 340, width: 540, height: 500 }, colors: game.isDay ? ["#6f7d88", "#66737d"] : ["#263340", "#212c38"] },
        { rect: { x: 1200, y: 340, width: 560, height: 500 }, colors: game.isDay ? ["#788089", "#6d767f"] : ["#2a323c", "#242c35"] },
        { rect: { x: 1960, y: 340, width: 560, height: 500 }, colors: game.isDay ? ["#807772", "#726a66"] : ["#312d2a", "#262220"] },
        { rect: { x: 540, y: 1240, width: 540, height: 600 }, colors: game.isDay ? ["#6c7568", "#62695f"] : ["#253026", "#1f2820"] },
        { rect: { x: 1320, y: 1240, width: 540, height: 600 }, colors: game.isDay ? ["#86837a", "#79766e"] : ["#322f2b", "#2a2724"] },
        { rect: { x: 2100, y: 1240, width: 540, height: 600 }, colors: game.isDay ? ["#5f7168", "#54655d"] : ["#213128", "#1d2a22"] },
        { rect: { x: 2860, y: 1540, width: 380, height: 340 }, colors: game.isDay ? ["#5f6b63", "#556058"] : ["#213028", "#1b2720"] }
    ];

    for (let x = startX; x < canvas.width + tile; x += tile) {
        for (let y = startY; y < canvas.height + tile; y += tile) {
            const worldX = camera.x + x;
            const worldY = camera.y + y;
            let base = game.isDay ? "#6c767f" : "#24303a";

            const inMainHall = worldY > 820 && worldY < 1058;
            const inLowerHall = worldY > 1180 && worldY < 1360;
            if (inMainHall) base = ((Math.floor(worldX / tile) + Math.floor(worldY / tile)) % 2 === 0) ? (game.isDay ? "#506172" : "#273746") : (game.isDay ? "#455667" : "#22313f");
            else if (inLowerHall) base = ((Math.floor(worldX / tile) + Math.floor(worldY / tile)) % 2 === 0) ? (game.isDay ? "#626d74" : "#2a343a") : (game.isDay ? "#58636a" : "#242d33");
            else {
                for (const theme of roomThemes) {
                    if (worldX >= theme.rect.x && worldX < theme.rect.x + theme.rect.width && worldY >= theme.rect.y && worldY < theme.rect.y + theme.rect.height) {
                        const toggle = (Math.floor(worldX / tile) + Math.floor(worldY / tile)) % 2;
                        base = theme.colors[toggle];
                        break;
                    }
                }
            }

            ctx.fillStyle = base;
            ctx.fillRect(x, y, tile, tile);
            ctx.strokeStyle = game.isDay ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.025)";
            ctx.strokeRect(x, y, tile, tile);
            ctx.fillStyle = game.isDay ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.05)";
            ctx.fillRect(x + 6, y + 6, tile - 12, 4);
            ctx.fillStyle = game.isDay ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.02)";
            ctx.fillRect(x + 10, y + tile - 11, tile - 20, 2);
        }
    }
}


function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (game.isDay) {
        gradient.addColorStop(0, "#96a6b6");
        gradient.addColorStop(1, "#606b77");
    } else {
        gradient.addColorStop(0, "#17222e");
        gradient.addColorStop(1, "#081018");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const haze = ctx.createRadialGradient(canvas.width * 0.5, 40, 10, canvas.width * 0.5, 40, canvas.width * 0.8);
    haze.addColorStop(0, game.isDay ? "rgba(255,255,255,0.12)" : "rgba(88,122,160,0.1)");
    haze.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.7);

    drawTexturedFloor();
}

function drawZones() {
    drawOutlinedWorldRect(cellArea, game.isDay ? "rgba(57, 66, 81, 0.55)" : "rgba(28, 36, 48, 0.72)", "rgba(255,255,255,0.05)", 1.2, 3);
    drawOutlinedWorldRect(exitZone, game.isDay ? "rgba(145, 60, 60, 0.55)" : "rgba(35, 150, 96, 0.72)", "rgba(255,255,255,0.08)", 1.4, 3);
    drawOutlinedWorldRect(serviceExit, game.isDay ? "rgba(115, 124, 144, 0.35)" : "rgba(55, 165, 125, 0.46)", "rgba(255,255,255,0.07)", 1.2, 3);
    drawOutlinedWorldRect(sewerExit, game.isDay ? "rgba(88, 92, 94, 0.34)" : "rgba(76, 160, 112, 0.45)", "rgba(255,255,255,0.05)", 1.2, 3);
}


function drawWalls() {
    for (const wall of getSceneWalls()) {
        const isThin = wall.width <= 24 || wall.height <= 24;
        const fill = game.isDay ? (isThin ? "#edf2f6" : "#d9e0e6") : (isThin ? "#aab5be" : "#87939d");
        drawOutlinedWorldRect(wall, fill, "rgba(78, 89, 98, 0.72)", 1.5, 2);
        drawRectWorld({ x: wall.x + 1.5, y: wall.y + 1.5, width: Math.max(0, wall.width - 3), height: Math.min(5, Math.max(0, wall.height - 3)) }, "rgba(255,255,255,0.18)");
        if (wall.height > 28) drawRectWorld({ x: wall.x + wall.width - 6, y: wall.y + 2, width: 4, height: wall.height - 4 }, "rgba(0,0,0,0.1)");
        if (wall.width > 28) drawRectWorld({ x: wall.x + 2, y: wall.y + wall.height - 6, width: wall.width - 4, height: 4 }, "rgba(0,0,0,0.08)");
    }
}



function drawCabinets() {
    for (const cabinet of cabinets) {
        const shell = cabinet.opened ? "#4f7658" : "#7e5b38";
        const front = cabinet.opened ? "#6d9e77" : "#b8844c";
        drawShadowedWorldRect(cabinet, shell);
        drawOutlinedWorldRect({ x: cabinet.x + 4, y: cabinet.y + 4, width: cabinet.width - 8, height: cabinet.height - 8 }, front, "rgba(0,0,0,0.18)", 1, 3);
        drawRectWorld({ x: cabinet.x + cabinet.width / 2 - 2, y: cabinet.y + 16, width: 4, height: 12 }, "rgba(18,22,28,0.45)");

        const dx = cabinet.x - camera.x;
        const dy = cabinet.y - camera.y;
        ctx.fillStyle = cabinet.opened ? "rgba(180,255,180,0.88)" : "rgba(255,255,255,0.82)";
        ctx.font = "11px Rajdhani, Inter, Arial";
        ctx.fillText(cabinet.opened ? "OPEN" : "LOOT", dx + 10, dy - 8);
    }
}


function drawDoorsAndSpots() {
    drawOutlinedWorldRect(cellEntrance, "rgba(245,246,248,0.96)", "rgba(78,88,96,0.6)", 1.5, 2);
    if (activeCellDoor) drawOutlinedWorldRect(activeCellDoor, "#d7dcdf", "rgba(88,92,98,0.6)", 1.2, 2);

    for (const spot of hidingSpots) {
        drawRectWorld({ x: spot.area.x + 8, y: spot.area.y + 12, width: spot.area.width - 16, height: spot.area.height - 18 }, game.isDay ? "rgba(80,120,140,0.12)" : "rgba(80,120,140,0.07)");
        drawOutlinedWorldRect(spot.area, "rgba(60, 86, 102, 0.88)", "rgba(28,40,50,0.6)", 1.5, 4);
        drawOutlinedWorldRect(spot.door, "rgba(240,240,240,0.96)", "rgba(78,88,96,0.5)", 1.2, 2);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(spot.area.x - camera.x + 12, spot.area.y - camera.y + 10, spot.area.width - 24, 4);
        if (assets.images.hide.complete) {
            ctx.drawImage(assets.images.hide, spot.area.x - camera.x + 18, spot.area.y - camera.y + 10, 26, 26);
        }
    }

    if (assets.images.gate.complete) {
        ctx.drawImage(assets.images.gate, exitZone.x - camera.x + 22, exitZone.y - camera.y + 8, 40, 40);
        ctx.drawImage(assets.images.gate, serviceExit.x - camera.x + 18, serviceExit.y - camera.y + 14, 30, 30);
        ctx.drawImage(assets.images.gate, sewerExit.x - camera.x + 20, sewerExit.y - camera.y + 8, 26, 26);
    }
}



function drawPrisonDetails() {
    const roomFills = [
        { x: 104, y: 780, width: 180, height: 270, fill: game.isDay ? "rgba(76,86,102,0.68)" : "rgba(38,46,57,0.82)" },
        { x: 440, y: 340, width: 540, height: 500, fill: game.isDay ? "rgba(110,117,128,0.30)" : "rgba(49,56,67,0.55)" },
        { x: 1200, y: 340, width: 560, height: 500, fill: game.isDay ? "rgba(116,120,130,0.30)" : "rgba(50,56,67,0.56)" },
        { x: 1960, y: 340, width: 560, height: 500, fill: game.isDay ? "rgba(112,118,128,0.28)" : "rgba(48,55,65,0.54)" },
        { x: 2720, y: 240, width: 500, height: 600, fill: game.isDay ? "rgba(118,119,126,0.24)" : "rgba(46,52,61,0.56)" },
        { x: 540, y: 1240, width: 540, height: 600, fill: game.isDay ? "rgba(120,112,118,0.24)" : "rgba(54,50,58,0.52)" },
        { x: 1320, y: 1240, width: 540, height: 600, fill: game.isDay ? "rgba(118,111,116,0.24)" : "rgba(52,48,55,0.52)" },
        { x: 2100, y: 1240, width: 540, height: 600, fill: game.isDay ? "rgba(102,119,108,0.22)" : "rgba(41,56,46,0.48)" },
        { x: 2860, y: 1540, width: 380, height: 340, fill: game.isDay ? "rgba(95,112,108,0.26)" : "rgba(38,55,52,0.48)" }
    ];
    roomFills.forEach(room => drawRectWorld(room, room.fill));

    drawRectWorld({ x: 304, y: 860, width: 2720, height: 194 }, game.isDay ? "rgba(58,72,86,0.84)" : "rgba(30,40,52,0.88)");
    drawRectWorld({ x: 304, y: 1218, width: 3020, height: 84 }, game.isDay ? "rgba(178,182,184,0.24)" : "rgba(74,78,82,0.3)");

    for (const cell of mapDecor.cellDoorsTop) {
        drawOutlinedWorldRect({ x: cell.x - 7, y: cell.y - 12, width: cell.width + 14, height: cell.height + 24 }, "#3e4b5d", "rgba(16,22,28,0.55)", 1.5, 2);
        for (let i = 0; i < 4; i++) drawRectWorld({ x: cell.x + 4 + i * 8, y: cell.y, width: 3, height: cell.height }, "rgba(227, 233, 239, 0.86)");
        drawRectWorld({ x: cell.x, y: cell.y + cell.height, width: cell.width, height: 8 }, "rgba(245,248,250,0.82)");
    }
    for (const cell of mapDecor.cellDoorsBottom) {
        drawOutlinedWorldRect({ x: cell.x - 7, y: cell.y - 12, width: cell.width + 14, height: cell.height + 24 }, "#3e4b5d", "rgba(16,22,28,0.55)", 1.5, 2);
        for (let i = 0; i < 4; i++) drawRectWorld({ x: cell.x + 4 + i * 8, y: cell.y, width: 3, height: cell.height }, "rgba(227, 233, 239, 0.86)");
        drawRectWorld({ x: cell.x, y: cell.y + cell.height, width: cell.width, height: 8 }, "rgba(245,248,250,0.82)");
    }

    mapDecor.bunks.forEach(b => {
        drawShadowedWorldRect(b, "#939fa8");
        drawOutlinedWorldRect({ x: b.x + 10, y: b.y - 10, width: b.width - 20, height: 8 }, "#c6cfd6", "rgba(78,89,98,0.2)", 1, 2);
    });
    mapDecor.desks.forEach(d => {
        drawShadowedWorldRect(d, "#7b858f");
        drawRectWorld({ x: d.x + 8, y: d.y + 18, width: d.width - 16, height: 6 }, "#5a6169");
    });
    mapDecor.benches.forEach(b => {
        drawShadowedWorldRect(b, "#8a6848");
        drawRectWorld({ x: b.x + 8, y: b.y - 5, width: b.width - 16, height: 4 }, "rgba(255,255,255,0.14)");
    });
    mapDecor.tables.forEach(t => drawShadowedWorldRect(t, "#767d84"));
    mapDecor.toilets.forEach(t => {
        drawShadowedWorldRect(t, "#d4dde3");
        drawOutlinedWorldRect({ x: t.x + 4, y: t.y + 3, width: 16, height: 9 }, "#95a6b7", "rgba(77,89,99,0.28)", 1, 2);
    });
    mapDecor.drains.forEach(d => drawOutlinedWorldRect(d, "rgba(30,30,30,0.74)", "rgba(160,160,160,0.16)", 1, 1));
    mapDecor.vents.forEach(v => {
        drawShadowedWorldRect(v, "#7a8893");
        for (let i = 0; i < 4; i++) drawRectWorld({ x: v.x + 6 + i * 14, y: v.y + 3, width: 8, height: 2 }, "rgba(235,240,245,0.26)");
    });
    mapDecor.lockers.forEach(l => {
        drawShadowedWorldRect(l, "#6e7d8a");
        drawRectWorld({ x: l.x + 4, y: l.y + 10, width: l.width - 8, height: 2 }, "rgba(255,255,255,0.16)");
    });

    drawShadowedWorldRect(interactables.patrolBoard, "#4a6071");
    drawShadowedWorldRect(interactables.powerSwitch, game.blackoutTimer > 0 ? "#c95f5f" : "#617180");
    drawShadowedWorldRect(interactables.truck, "#58767d");
    drawShadowedWorldRect(interactables.sewerHatch, "#68747b");
    drawShadowedWorldRect(interactables.craftBench, "#84684a");
    drawShadowedWorldRect(interactables.scheduleDesk, "#657483");

    mapDecor.fences.forEach(f => drawOutlinedWorldRect(f, "rgba(234,239,243,0.82)", "rgba(105,114,120,0.4)", 1, 1));
    drawOutlinedWorldRect({ x: 2848, y: 1432, width: 96, height: 12 }, "rgba(102,110,120,0.92)", "rgba(34,40,48,0.4)", 1.2, 2);

    mapDecor.roadMarks.forEach(m => drawOutlinedWorldRect(m, "rgba(240,243,246,0.16)", "rgba(255,255,255,0.02)", 1, 1));
    mapDecor.yardLines.forEach(line => drawRectWorld(line, "rgba(255,255,255,0.1)"));

    ctx.fillStyle = "rgba(236,242,247,0.92)";
    ctx.font = "700 12px Rajdhani, Inter, Arial";
    mapDecor.labels.forEach(label => ctx.fillText(label.text, label.x - camera.x, label.y - camera.y));
    ctx.fillText("PATROL BOARD", interactables.patrolBoard.x - camera.x - 6, interactables.patrolBoard.y - camera.y - 8);
    ctx.fillText("POWER", interactables.powerSwitch.x - camera.x - 2, interactables.powerSwitch.y - camera.y - 8);
    ctx.fillText("CRAFT", interactables.craftBench.x - camera.x + 8, interactables.craftBench.y - camera.y - 8);
    ctx.fillText("SCHEDULE", interactables.scheduleDesk.x - camera.x - 4, interactables.scheduleDesk.y - camera.y - 8);
}


function drawObjectiveMarkers() {
    const pulse = 0.5 + Math.sin(game.frame * 0.08) * 0.5;
    const markers = [];

    if (!game.isDay) {
        markers.push({ x: exitZone.x + exitZone.width / 2, y: exitZone.y - 24, label: "EXIT" });
    }

    if (!player.isHidden) {
        const nearestSpot = hidingSpots
            .map(spot => ({ spot, d: Math.hypot(player.x - spot.area.x, player.y - spot.area.y) }))
            .sort((a, b) => a.d - b.d)[0];
        if (nearestSpot && nearestSpot.d < 380) {
            markers.push({ x: nearestSpot.spot.area.x + nearestSpot.spot.area.width / 2, y: nearestSpot.spot.area.y - 16, label: "HIDE" });
        }
    }

    ctx.font = "12px Inter, Arial";
    ctx.textAlign = "center";
    for (const marker of markers) {
        const sx = marker.x - camera.x;
        const sy = marker.y - camera.y;
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.6 + pulse * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 12 - pulse * 4);
        ctx.lineTo(sx - 8, sy);
        ctx.lineTo(sx + 8, sy);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(marker.label, sx, sy - 18);
    }
    ctx.textAlign = "left";
}

function drawSecurityCameras() {
    for (const cam of securityCameras) {
        const sx = cam.x - camera.x;
        const sy = cam.y - camera.y;
        const alpha = game.isDay ? 0.12 : 0.18;
        ctx.fillStyle = `rgba(180, 170, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, cam.range, cam.dir - cam.angle / 2, cam.dir + cam.angle / 2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#2a3140";
        ctx.fillRect(sx - 10, sy - 6, 20, 12);
        ctx.strokeStyle = "#cfd6de";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(cam.dir) * 12, sy + Math.sin(cam.dir) * 12);
        ctx.stroke();
    }
}


function drawRestrictedHeatmap() {
    if (!game.isDay) return;
    getActiveGuards().forEach(guard => {
        drawRectWorld(guard.roamZone, "rgba(255, 120, 80, 0.045)");
        if (player.routeIntel && guard.patrolPoints) {
            ctx.strokeStyle = "rgba(255, 210, 80, 0.18)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            guard.patrolPoints.forEach((p, index) => {
                const sx = p.x - camera.x;
                const sy = p.y - camera.y;
                if (index === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            });
            ctx.closePath();
            ctx.stroke();
        }
    });
}

function drawAlarmBanner() {
    if (game.cameraAlarmTimer <= 0) return;
    const width = 388;
    const x = canvas.width / 2 - width / 2;
    const y = 14;
    roundedPanel(x, y, width, 38, 14, "rgba(110, 20, 20, 0.9)", "rgba(255,255,255,0.14)");
    ctx.fillStyle = "#fff4f4";
    ctx.font = "700 16px Rajdhani, Inter, Arial";
    ctx.textAlign = "center";
    const label = game.alertedGuardIds.length ? `ALARM • Responders ${game.alertedGuardIds.join(', ')}` : "ALARM";
    ctx.fillText(label, canvas.width / 2, 38);
    ctx.textAlign = "left";
}

function drawPlayerAndGuards() {
    player.draw(ctx, camera, assets, game.scene);
    for (const guard of getActiveGuards()) {
        const showVision = !game.isDay || guard.fsm.getState() !== "PATROL" || game.guardPressure > 0.35;
        guard.draw(ctx, camera, assets, showVision);
    }
}

function getInventoryEntries() {
    return [
        { id: "lockpick", name: "Lockpick", count: player.lockpicks, key: "E at cell door", tone: "#ffd166", desc: "Best for the night cell lock. Quick but not guaranteed." },
        { id: "bottle", name: "Bottle", count: player.bottles, key: "E when selected", tone: "#8ecae6", desc: "Throw to redirect nearby guards toward a fake noise." },
        { id: "keycard", name: "Guard keycard", count: player.keycards, key: "E at truck / craft", tone: "#90be6d", desc: "Opens privileged routes or becomes crafting material." },
        { id: "cutter", name: "Wire cutters", count: player.cutters, key: "E at sewer / craft", tone: "#f4a261", desc: "Cuts the sewer hatch or combines into a breach kit." },
        { id: "uniform", name: "Guard uniform", count: player.uniforms, key: "E when selected", tone: "#cdb4db", desc: "Useful, but cameras and close inspections build suspicion." },
        { id: "routes", name: "Patrol intel", count: player.routeIntel ? 1 : 0, key: "E at patrol board", tone: "#e9edc9", desc: "Shows route loops so you can time gaps like a pro." }
    ];
}

function getInventoryPanelRect() {
    return { x: 16, y: 172, width: 420, height: 252 };
}

function getInventoryRowAt(canvasX, canvasY) {
    if (!game.inventoryOpen) return null;
    const panel = getInventoryPanelRect();
    if (canvasX < panel.x || canvasX > panel.x + panel.width || canvasY < panel.y || canvasY > panel.y + panel.height) return null;
    const entries = getInventoryEntries();
    const startY = panel.y + 58;
    const rowH = 28;
    for (let i = 0; i < entries.length; i++) {
        const y = startY + 22 + i * rowH;
        const top = y - 16;
        const bottom = top + 22;
        if (canvasY >= top && canvasY <= bottom) return entries[i];
    }
    return null;
}

function tryUseSelectedInventoryItem() {
    const item = game.selectedInventoryItem;
    if (!item) return false;

    if (item === "uniform") {
        if (!player.useUniform()) {
            setPopup("No guard uniform available.", "empty", 110);
            return true;
        }
        if (player.uniforms <= 0) game.selectedInventoryItem = null;
        game.hintText = "Guard disguise active. Move naturally and avoid sprinting near guards.";
        setPopup("Guard disguise active.", "success", 130);
        return true;
    }

    if (item === "bottle") {
        throwBottle();
        if (player.bottles <= 0) game.selectedInventoryItem = null;
        return true;
    }

    if (item === "lockpick") {
        if (canUseLockpickAtCellDoor()) {
            player.useLockpick();
            if (Math.random() < 0.25) {
                cellDoorUnlocked = true;
                activeCellDoor = null;
                player.waitingForDay = false;
                player.canMove = true;
                player.state = "FREE_ROAM";
                game.hintText = "The cell door clicked open.";
                setPopup("Lockpick worked. Get to the door.", "success");
            } else {
                game.hintText = "The lock resisted.";
                setPopup(`Lockpick failed. ${player.lockpicks} left.`, "danger");
            }
            playSound("ui");
        } else if (player.lockpicks > 0) {
            setPopup("Stand near the cell door at night and press E.", "empty", 120);
        } else {
            setPopup("You need a lockpick first.", "empty");
        }
        return true;
    }

    if (item === "keycard") {
        setPopup("Use E at the service truck or craft bench.", "empty", 110);
        return true;
    }

    if (item === "cutter") {
        setPopup("Use E at the sewer hatch or craft bench.", "empty", 110);
        return true;
    }

    if (item === "routes") {
        setPopup("Patrol intel is already applied to your minimap.", "empty", 110);
        return true;
    }

    return false;
}


function roundedPanel(x, y, width, height, radius = 18, fill = "rgba(8, 14, 20, 0.82)", stroke = "rgba(255,255,255,0.14)") {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function fillProgressBar(x, y, width, height, progress, fillColor) {
    roundedPanel(x, y, width, height, 999, "rgba(255,255,255,0.08)", "rgba(255,255,255,0.04)");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, Math.max(0, (width - 4) * Math.max(0, Math.min(1, progress))), height - 4, 999);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
}

function drawInventoryPanel() {
    if (!game.inventoryOpen) return;

    const entries = getInventoryEntries();
    const panel = getInventoryPanelRect();
    const selected = entries.find(entry => entry.id === game.selectedInventoryItem) || entries.find(entry => entry.count > 0) || entries[0];

    roundedPanel(panel.x, panel.y, panel.width, panel.height, 22,
        "rgba(8, 14, 20, 0.92)", "rgba(128, 186, 255, 0.22)");

    ctx.fillStyle = "#edf4fb";
    ctx.font = "700 24px Rajdhani, Inter, Arial";
    ctx.fillText("Inventory", panel.x + 18, panel.y + 32);
    ctx.font = "13px Inter, Arial";
    ctx.fillStyle = "#8fb0c8";
    ctx.fillText("Press I to close", panel.x + panel.width - 106, panel.y + 30);

    const startY = panel.y + 64;
    const rowH = 34;
    ctx.font = "12px Inter, Arial";
    ctx.fillStyle = "#7ea1bc";
    ctx.fillText("ITEM", panel.x + 20, startY);
    ctx.fillText("COUNT", panel.x + 190, startY);
    ctx.fillText("USE", panel.x + 246, startY);

    entries.forEach((entry, index) => {
        const y = startY + 24 + index * rowH;
        const isSelected = game.selectedInventoryItem === entry.id;
        roundedPanel(panel.x + 12, y - 18, panel.width - 24, 26, 10,
            isSelected ? "rgba(79, 168, 255, 0.18)" : (index % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)"),
            isSelected ? "rgba(120, 200, 255, 0.46)" : "rgba(255,255,255,0.035)");
        ctx.fillStyle = entry.tone;
        ctx.fillRect(panel.x + 20, y - 10, 9, 9);
        ctx.fillStyle = "#edf4fb";
        ctx.font = "600 14px Inter, Arial";
        ctx.fillText(entry.name, panel.x + 38, y);
        ctx.fillStyle = entry.count > 0 ? "#ffffff" : "#6f8597";
        ctx.fillText(String(entry.count), panel.x + 198, y);
        ctx.fillStyle = "#b8cbda";
        ctx.fillText(entry.key, panel.x + 246, y);
    });

    roundedPanel(panel.x + 14, panel.y + panel.height - 68, panel.width - 28, 46, 12,
        "rgba(255,255,255,0.03)", "rgba(255,255,255,0.05)");
    ctx.fillStyle = selected.tone;
    ctx.font = "700 14px Inter, Arial";
    ctx.fillText(selected.name.toUpperCase(), panel.x + 24, panel.y + panel.height - 40);
    ctx.fillStyle = "#c8d8e5";
    ctx.font = "12px Inter, Arial";
    ctx.fillText(selected.desc, panel.x + 24, panel.y + panel.height - 22);
}

function drawHUD() {
    const panelWidth = 432;
    const panelHeight = game.scene === "prison" ? 186 : 172;
    roundedPanel(16, 16, panelWidth, panelHeight, 18, "rgba(8, 14, 20, 0.8)", "rgba(141, 190, 234, 0.18)");

    ctx.fillStyle = "#edf4fb";
    ctx.font = "700 22px Rajdhani, Inter, Arial";
    ctx.fillText(game.scene === "prison" ? "OPERATIONS" : game.scene === "vent" ? "VENT ESCAPE" : "CAR CHASE", 30, 40);
    ctx.font = "12px Inter, Arial";
    ctx.fillStyle = "#89a7bb";
    ctx.fillText(game.scene === "prison" ? "5-day breakout plan and live tactical status" : "Separate escape map. Reach the highlighted exit.", 30, 58);

    const chips = [
        { label: game.mode.toUpperCase(), color: game.mode === "hard" ? "#ff7b7b" : game.mode === "roam" ? "#8ef0c0" : "#72d6ff" },
        { label: game.mode === "roam" ? "FREE ROAM" : `DAY ${Math.min(game.currentDay, game.maxDays)}/${game.maxDays}`, color: "#ffd166" },
        { label: game.scene === "prison" ? (game.isDay ? "DAY SHIFT" : "NIGHT SHIFT") : "ESCAPE PHASE", color: game.scene === "prison" ? (game.isDay ? "#ffd166" : "#72d6ff") : "#ff9f80" }
    ];

    let chipX = 30;
    chips.forEach(chip => {
        roundedPanel(chipX, 68, 116, 24, 999, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.05)");
        ctx.fillStyle = chip.color;
        ctx.font = "700 12px Inter, Arial";
        ctx.fillText(chip.label, chipX + 12, 84);
        chipX += 124;
    });

    const progress = game.scene === "prison" ? game.timeCounter / game.timeLimit : 1;
    ctx.fillStyle = "#91abc0";
    ctx.font = "12px Inter, Arial";
    ctx.fillText(game.mode === "roam" ? "Exploration" : game.scene === "prison" ? (game.isDay ? "Shift timer" : "Night window") : "Escape push", 30, 108);
    fillProgressBar(30, 114, 190, 14, progress, game.scene === "car" ? "#8ef0c0" : game.isDay ? "#ffd166" : "#72d6ff");

    ctx.fillText(game.scene === "prison" ? "Guard pressure" : "Threat level", 236, 108);
    fillProgressBar(236, 114, 176, 14, game.mode === "roam" ? 0 : game.guardPressure, game.guardPressure > 0.66 ? "#ff7b7b" : "#f4b860");

    roundedPanel(30, 136, 382, 24, 12, "rgba(255,255,255,0.035)", "rgba(255,255,255,0.05)");
    ctx.fillStyle = "#dce7f0";
    ctx.font = "13px Inter, Arial";
    const hint = game.hintText.length > 58 ? `${game.hintText.slice(0, 58)}…` : game.hintText;
    ctx.fillText(hint, 40, 152);

    ctx.fillStyle = "#9fb6ca";
    ctx.font = "12px Inter, Arial";
    const secondsLeft = Math.max(0, Math.ceil((game.timeLimit - game.timeCounter) / 60));
    const sceneLabel = game.scene === "prison" ? "Prison" : game.scene === "vent" ? "Vents" : "Road";
    ctx.fillText(`Lives ${player.lives}  •  Scene ${sceneLabel}  •  ${game.mode === "roam" ? "No timer pressure" : `${secondsLeft}s left`}`, 30, 172);

    if (game.scene === "prison" && player.isDisguised()) {
        roundedPanel(16, panelHeight + 24, 432, 52, 16, "rgba(8, 14, 20, 0.72)", "rgba(147, 201, 255, 0.14)");
        ctx.fillStyle = "#edf4fb";
        ctx.font = "700 16px Rajdhani, Inter, Arial";
        ctx.fillText("DISGUISE", 30, panelHeight + 50);
        ctx.fillStyle = "#90aebf";
        ctx.font = "12px Inter, Arial";
        ctx.fillText("Timer", 120, panelHeight + 42);
        ctx.fillText("Suspicion", 120, panelHeight + 64);
        fillProgressBar(166, panelHeight + 33, 244, 10, player.fakeUniformTimer / (60 * 20), "#72d6ff");
        fillProgressBar(166, panelHeight + 55, 244, 10, player.disguiseHeat / 100, player.disguiseHeat > 72 ? "#ff7b7b" : "#f4b860");
    }

    if (game.scene === "prison") {
        drawInventoryPanel();
        drawMiniMap();
        drawInteractionPrompt();
    }
}

function drawInteractionPrompt() {
    if (!game.nearPrompt) return;
    const width = 372;
    const height = 56;
    const x = canvas.width / 2 - width / 2;
    const y = canvas.height - 84;

    roundedPanel(x, y, width, height, 18, "rgba(8, 14, 20, 0.84)", "rgba(255,255,255,0.08)");
    roundedPanel(x + 12, y + 10, 40, 36, 12, game.nearPrompt.tone, game.nearPrompt.tone);
    ctx.fillStyle = "#061019";
    ctx.font = "700 18px Rajdhani, Inter, Arial";
    ctx.fillText("E", x + 27, y + 33);
    ctx.fillStyle = "#edf4fb";
    ctx.font = "700 16px Inter, Arial";
    ctx.fillText(game.nearPrompt.title, x + 64, y + 26);
    ctx.fillStyle = "#afc3d3";
    ctx.font = "12px Inter, Arial";
    ctx.fillText(game.nearPrompt.detail, x + 64, y + 42);
}

function drawMiniMap() {
    const mini = { x: canvas.width - 196, y: 16, width: 180, height: 120 };
    roundedPanel(mini.x, mini.y, mini.width, mini.height, 14, "rgba(8, 14, 20, 0.78)", "rgba(141, 190, 234, 0.18)");

    const scaleX = mini.width / world.width;
    const scaleY = mini.height / world.height;

    ctx.fillStyle = "rgba(200,210,220,0.28)";
    walls.forEach(w => ctx.fillRect(mini.x + w.x * scaleX, mini.y + w.y * scaleY, Math.max(1, w.width * scaleX), Math.max(1, w.height * scaleY)));

    ctx.fillStyle = game.isDay ? "rgba(220,90,90,0.8)" : "rgba(70,220,120,0.85)";
    ctx.fillRect(mini.x + exitZone.x * scaleX, mini.y + exitZone.y * scaleY, exitZone.width * scaleX, exitZone.height * scaleY);
    ctx.fillRect(mini.x + serviceExit.x * scaleX, mini.y + serviceExit.y * scaleY, serviceExit.width * scaleX, serviceExit.height * scaleY);
    ctx.fillRect(mini.x + sewerExit.x * scaleX, mini.y + sewerExit.y * scaleY, sewerExit.width * scaleX, sewerExit.height * scaleY);

    if (player.routeIntel) {
        getActiveGuards().forEach(guard => {
            if (!guard.patrolPoints) return;
            ctx.strokeStyle = "rgba(255, 214, 102, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            guard.patrolPoints.forEach((p, i) => {
                const sx = mini.x + p.x * scaleX;
                const sy = mini.y + p.y * scaleY;
                if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
            });
            ctx.closePath();
            ctx.stroke();
        });
    }

    cabinets.forEach(cabinet => {
        ctx.fillStyle = cabinet.opened ? "#5f7f63" : "#d7b36a";
        ctx.fillRect(mini.x + cabinet.x * scaleX - 1, mini.y + cabinet.y * scaleY - 1, 4, 4);
    });
    securityCameras.forEach(cam => {
        ctx.fillStyle = game.blackoutTimer > 0 ? "#555" : "#9a8bff";
        ctx.fillRect(mini.x + cam.x * scaleX - 1, mini.y + cam.y * scaleY - 1, 4, 4);
    });
    getActiveGuards().forEach(guard => {
        ctx.fillStyle = guard.fsm.getState() === "CHASE" ? "#ff6b6b" : "#b8c4cf";
        ctx.fillRect(mini.x + guard.x * scaleX - 1, mini.y + guard.y * scaleY - 1, 4, 4);
    });

    ctx.fillStyle = "#4aa6ff";
    ctx.fillRect(mini.x + player.x * scaleX - 2, mini.y + player.y * scaleY - 2, 5, 5);
    ctx.strokeStyle = "rgba(114,214,255,0.6)";
    ctx.strokeRect(mini.x + camera.x * scaleX, mini.y + camera.y * scaleY, camera.width * scaleX, camera.height * scaleY);

    ctx.save();
    ctx.fillStyle = "rgba(2,6,10,0.72)";
    ctx.fillRect(mini.x, mini.y, mini.width, mini.height);
    ctx.globalCompositeOperation = "destination-out";
    for (const spot of game.explored) {
        ctx.beginPath();
        ctx.arc(mini.x + spot.x * scaleX, mini.y + spot.y * scaleY, Math.max(8, spot.radius * scaleX * 0.36), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}


function drawCrosshair() {
    const size = 8 + Math.sin(game.frame * 0.15) * 1.5 + wheelPulse * 6;
    const x = clamp(pointer.x, 24, canvas.width - 24);
    const y = clamp(pointer.y, 24, canvas.height - 24);
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
}

function drawPopup() {
    if (game.popupTimer <= 0 || !game.popupText) return;

    const alpha = Math.min(1, game.popupTimer / 20, 0.92);
    const width = 320;
    const height = 64;
    const x = canvas.width / 2 - width / 2;
    const y = 36;

    let accent = "rgba(114,214,255,0.95)";
    if (game.popupTone === "success") accent = "rgba(102,231,124,0.95)";
    else if (game.popupTone === "danger") accent = "rgba(255,110,110,0.95)";
    else if (game.popupTone === "empty") accent = "rgba(255,214,102,0.95)";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(8, 14, 20, 0.88)";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = "#edf4fb";
    ctx.font = "700 18px Inter, Arial";
    ctx.textAlign = "center";
    ctx.fillText(game.popupText, x + width / 2, y + 38);
    ctx.restore();
    ctx.textAlign = "left";
}

function drawEndCard() {
    if (!game.gameOver && !game.win) return;
    ctx.fillStyle = "rgba(5, 8, 12, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = 520;
    const x = canvas.width / 2 - width / 2;
    const y = canvas.height / 2 - 120;
    ctx.fillStyle = "rgba(10, 16, 22, 0.88)";
    ctx.fillRect(x, y, width, 240);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.strokeRect(x, y, width, 240);

    ctx.fillStyle = "#edf4fb";
    ctx.textAlign = "center";
    ctx.font = "700 42px Inter, Arial";
    ctx.fillText(game.win ? "YOU ESCAPED" : "GAME OVER", canvas.width / 2, y + 74);
    ctx.font = "18px Inter, Arial";
    ctx.fillStyle = "#c8d7e5";
    ctx.fillText(game.win ? "The gate is behind you. Freedom achieved." : "The prison won this round.", canvas.width / 2, y + 114);
    ctx.fillText("Press R to restart or use the Restart button.", canvas.width / 2, y + 155);
    ctx.fillText(`Guards active: ${getActiveGuards().length} • Days: ${Math.min(game.currentDay, game.maxDays)}/${game.maxDays} • Events: ${game.eventsUsed.length}`, canvas.width / 2, y + 186);
    ctx.textAlign = "left";
}

function drawNightVignette() {
    if (game.isDay) return;
    const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 80, canvas.width / 2, canvas.height / 2, canvas.width * 0.72);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${game.blackoutTimer > 0 ? 0.52 : 0.35})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCaptureFlash() {
    if (game.caughtFlash <= 0) return;
    ctx.fillStyle = `rgba(255, 70, 70, ${game.caughtFlash / 20})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
    if (game.scene === "prison") {
        drawBackground();
        drawZones();
        drawRestrictedHeatmap();
        drawPrisonDetails();
        drawDoorsAndSpots();
        drawCabinets();
        drawWalls();
        drawLockedDoorOverlays();
        drawSecurityCameras();
        drawObjectiveMarkers();
        drawPlayerAndGuards();
    } else {
        drawPhaseScene();
    }
    drawNightVignette();
    drawHUD();
    drawAlarmBanner();
    drawPopup();
    drawCrosshair();
    drawCaptureFlash();
    drawEndCard();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

window.addEventListener("load", () => {
    resizeCanvas();
    updateModeButtons();
    updateCamera(true);
    syncMuteLabel();
    setupAudio();
    startMenuMusic();
    gameLoop();
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("blur", () => { if (game.running && !game.paused) pauseGame(); });
window.addEventListener("focus", () => {});
document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.running && !game.paused) {
        pauseGame();
    }
});

function getLogicalKey(event) {
    const codeMap = {
        KeyW: "w",
        KeyA: "a",
        KeyS: "s",
        KeyD: "d",
        KeyE: "e",
        KeyI: "i",
        KeyM: "m",
        KeyR: "r",
        ShiftLeft: "shift",
        ShiftRight: "shift",
        ArrowUp: "arrowup",
        ArrowDown: "arrowdown",
        ArrowLeft: "arrowleft",
        ArrowRight: "arrowright",
        Space: " ",
        Tab: "tab",
        Escape: "escape"
    };

    if (codeMap[event.code]) return codeMap[event.code];
    return String(event.key || "").toLowerCase();
}

document.addEventListener("keydown", event => {
    const key = getLogicalKey(event);
    keys[key] = true;

    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(key)) {
        event.preventDefault();
    }

    if (key === "escape") {
        if (game.running && !game.gameOver && !game.win) {
            if (game.paused) resumeGame();
            else pauseGame();
        }
    }

    if (key === "e") {
        event.preventDefault();
        const interacted = handleInteract();
        if (!interacted) tryUseSelectedInventoryItem();
    }
    if (key === "i" || key === "tab") game.inventoryOpen = !game.inventoryOpen;
    if (key === "m") toggleMute();
    if (key === "r") restartRun();
});

document.addEventListener("keyup", event => {
    keys[getLogicalKey(event)] = false;
});

canvas.addEventListener("mousemove", event => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    pointer.y = (event.clientY - rect.top) * (canvas.height / rect.height);
});

canvas.addEventListener("mousedown", () => {
    pointer.down = true;
});

canvas.addEventListener("mouseup", () => {
    pointer.down = false;
});

canvas.addEventListener("click", event => {
    playSound("ui");
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const entry = getInventoryRowAt(x, y);
    if (entry) {
        game.selectedInventoryItem = entry.count > 0 ? entry.id : null;
        if (entry.count > 0) setPopup(`${entry.name} selected. Press E to use it.`, "info", 100);
        else setPopup(`You do not have ${entry.name.toLowerCase()}.`, "empty", 90);
    }
});

canvas.addEventListener("contextmenu", event => {
    event.preventDefault();
});

canvas.addEventListener("wheel", event => {
    event.preventDefault();
    wheelPulse = clamp(wheelPulse + Math.sign(event.deltaY) * 0.08, 0, 1.2);
}, { passive: false });

function handleFirstUserAudio() {
    setupAudio();
    if (!game.running && menuOverlay.classList.contains("visible")) {
        startMenuMusic();
    }
}

document.addEventListener("pointerdown", handleFirstUserAudio, { once: true });
document.addEventListener("keydown", handleFirstUserAudio, { once: true });

playButton.addEventListener("click", () => { handleFirstUserAudio(); startRun(); });
if (easyModeButton) easyModeButton.addEventListener("click", () => { playSound("ui"); setGameMode("easy"); });
if (hardModeButton) hardModeButton.addEventListener("click", () => { playSound("ui"); setGameMode("hard"); });
if (roamModeButton) roamModeButton.addEventListener("click", () => { playSound("ui"); setGameMode("roam"); });
howToPlayButton.addEventListener("click", () => {
    setOverlayVisibility(howToPlayOverlay, true);
    startMenuMusic();
});
closeHowToPlayButton.addEventListener("click", () => {
    setOverlayVisibility(howToPlayOverlay, false);
    playSound("ui");
});
resumeButton.addEventListener("click", resumeGame);
restartButton.addEventListener("click", restartRun);
pauseRestartButton.addEventListener("click", restartRun);
muteButton.addEventListener("click", toggleMute);

document.addEventListener("nightStart", () => {
    game.hintText = `Night ${game.currentDay}/${game.maxDays} started. The front gate, vents, and vehicle routes are now possible.`;
});

document.addEventListener("dayStart", () => {
    game.hintText = `Day ${game.currentDay}/${game.maxDays} started. Study patrols, grab contraband, and mark routes.`;
});

setInterval(() => {
    if (!game.running || game.paused || game.gameOver || game.win) return;
    if (!game.isDay && !anyGuardChasing() && !player.isHidden) {
        game.hintText = "Stay low. A direct line of sight will trigger a chase.";
    }
}, 5000);
