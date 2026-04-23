class Guard {
    constructor(x, y, size, roamZone, id = 0, options = {}) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.size = size;
        this.roamZone = roamZone;
        this.patrolPoints = Array.isArray(options.patrolPoints) ? options.patrolPoints : null;
        this.patrolIndex = options.patrolIndex || 0;
        this.exitGuard = !!options.exitGuard;
        this.nightHunter = !!options.nightHunter;

        this.fsm = new StateMachine("PATROL");
        this.directionX = 1;
        this.directionY = 0;

        this.basePatrolSpeed = options.patrolSpeed || 1.02;
        this.baseSuspiciousSpeed = options.suspiciousSpeed || 1.72;
        this.baseChaseSpeed = options.chaseSpeed || 2.24;
        this.currentSpeed = this.basePatrolSpeed;

        this.baseVisionRange = options.visionRange || 280;
        this.visionRange = this.baseVisionRange;
        this.visionAngle = options.visionAngle || Math.PI / 2.45;
        this.captureRange = options.captureRange || 26;
        this.baseHearingRange = options.hearingRange || 220;
        this.baseCloseHearingRange = options.closeHearingRange || 128;
        this.hearingRange = this.baseHearingRange;
        this.closeHearingRange = this.baseCloseHearingRange;
        this.alertRadius = options.alertRadius || 560;

        this.lastKnownPlayerPosition = null;
        this.investigationTarget = null;
        this.searchTimer = 0;
        this.maxSearchTime = options.maxSearchTime || 220;
        this.suspiciousTimer = 0;
        this.maxSuspiciousTime = options.maxSuspiciousTime || 110;
        this.pauseTimer = 0;

        this.alertTriggered = false;
        this.alertPosition = null;
        this.stuckTimer = 0;
        this.lastX = x;
        this.lastY = y;
        this.flashTimer = 0;

        this.knowsHiddenSpot = false;
        this.knownHiddenSpot = null;
        this.knownHiddenDoor = null;

        this.currentRoamTarget = this.getInitialTarget();
        this.navGraph = [];
        this.navIndex = new Map();
        this.currentPath = [];
        this.pathTarget = null;
        this.pathRecalcCooldown = 0;
        this.recentPatrolTargets = [];
        this.randomLookTimer = 20 + Math.floor(Math.random() * 40);
        this.searchPivot = null;
        this.walkCycle = Math.random() * Math.PI * 2;
        this.isMoving = false;
    }

    setNavigationGraph(nodes = []) {
        this.navGraph = nodes;
        this.navIndex = new Map(nodes.map(n => [n.id, n]));
    }

    beginFrame() {
        this.alertTriggered = false;
        this.alertPosition = null;
        if (this.flashTimer > 0) this.flashTimer--;
        if (this.pathRecalcCooldown > 0) this.pathRecalcCooldown--;
    }

    getInitialTarget() {
        if (this.patrolPoints && this.patrolPoints.length) return { ...this.patrolPoints[this.patrolIndex % this.patrolPoints.length] };
        return this.getRandomPointInZone();
    }

    getCenter() { return { x: this.x + this.size / 2, y: this.y + this.size / 2 }; }
    getRect(x = this.x, y = this.y) { return { x, y, width: this.size, height: this.size }; }
    clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    isRectBlocked(rect, walls, hidingSpots) {
        for (const wall of walls) if (rectsOverlap(rect, wall)) return true;
        for (const spot of hidingSpots) if (rectsOverlap(rect, spot.area)) return true;
        return false;
    }

    getRandomPointInZone() {
        return {
            x: this.roamZone.x + 28 + Math.random() * Math.max(24, this.roamZone.width - 56),
            y: this.roamZone.y + 28 + Math.random() * Math.max(24, this.roamZone.height - 56)
        };
    }

    getNextPatrolTarget() {
        if (this.patrolPoints && this.patrolPoints.length) {
            const recent = this.recentPatrolTargets.slice(-2).map(v => `${v.x}|${v.y}`);
            const currentKey = this.currentRoamTarget ? `${this.currentRoamTarget.x}|${this.currentRoamTarget.y}` : null;
            let candidates = this.patrolPoints.filter(point => {
                const key = `${point.x}|${point.y}`;
                return key !== currentKey && !recent.includes(key);
            });
            if (!candidates.length) candidates = this.patrolPoints.filter(point => `${point.x}|${point.y}` !== currentKey);
            if (!candidates.length) candidates = this.patrolPoints;

            const center = this.getCenter();
            const scored = candidates.map(point => {
                const d = Math.hypot(center.x - point.x, center.y - point.y);
                const preferred = 120 + Math.random() * 420;
                const score = Math.abs(d - preferred) + Math.random() * 220;
                return { point, score };
            }).sort((a, b) => a.score - b.score);

            const choice = scored[Math.floor(Math.random() * Math.min(3, scored.length))].point;
            this.recentPatrolTargets.push({ x: choice.x, y: choice.y });
            if (this.recentPatrolTargets.length > 4) this.recentPatrolTargets.shift();
            return { ...choice };
        }
        return this.getRandomPointInZone();
    }

    faceToward(targetX, targetY) {
        const center = this.getCenter();
        const dx = targetX - center.x;
        const dy = targetY - center.y;
        const length = Math.hypot(dx, dy);
        if (length > 0.001) {
            this.directionX = dx / length;
            this.directionY = dy / length;
        }
    }

    setSpeedByState(isDay) {
        const state = this.fsm.getState();
        const nightBoost = isDay ? 1 : (this.exitGuard ? 1.35 : this.nightHunter ? 1.3 : 1.22);
        const patrol = this.basePatrolSpeed * nightBoost;
        const suspicious = this.baseSuspiciousSpeed * nightBoost;
        const chase = this.baseChaseSpeed * nightBoost;
        if (state === "PATROL" || state === "RETURN") this.currentSpeed = patrol;
        else if (state === "SUSPICIOUS" || state === "SEARCH") this.currentSpeed = suspicious;
        else this.currentSpeed = chase;
        this.visionRange = this.baseVisionRange * (isDay ? 0.95 : (this.exitGuard ? 1.28 : 1.15));
        this.hearingRange = this.baseHearingRange * (isDay ? 1.0 : (this.exitGuard ? 1.6 : 1.42));
        this.closeHearingRange = this.baseCloseHearingRange * (isDay ? 1 : 1.18);
    }

    distanceToPoint(x, y) { const c = this.getCenter(); return Math.hypot(x - c.x, y - c.y); }
    distanceToPlayer(player) { return this.distanceToPoint(player.x + player.size / 2, player.y + player.size / 2); }

    canHearPlayer(player, isPlayerMoving, isSneaking, playerSafeInCell = false) {
        if (!isPlayerMoving || player.isHidden || playerSafeInCell) return false;
        const effectiveRange = isSneaking ? this.hearingRange * 0.62 : this.hearingRange;
        return this.distanceToPlayer(player) <= effectiveRange;
    }

    isVeryCloseToPlayer(player) { return !player.isHidden && this.distanceToPlayer(player) <= this.closeHearingRange; }

    isLineBlocked(x1, y1, x2, y2, walls) {
        const steps = 44;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;
            for (const wall of walls) {
                if (px >= wall.x && px <= wall.x + wall.width && py >= wall.y && py <= wall.y + wall.height) return true;
            }
        }
        return false;
    }

    findHidingSpotByArea(player, hidingSpots) {
        if (!player.currentHidingSpot) return null;
        return hidingSpots.find(spot =>
            spot.area.x === player.currentHidingSpot.x &&
            spot.area.y === player.currentHidingSpot.y &&
            spot.area.width === player.currentHidingSpot.width &&
            spot.area.height === player.currentHidingSpot.height
        ) || null;
    }

    canSeePlayer(player, walls, hidingSpots) {
        const center = this.getCenter();
        const px = player.x + player.size / 2;
        const py = player.y + player.size / 2;
        const dx = px - center.x;
        const dy = py - center.y;
        const distance = Math.hypot(dx, dy);
        if (distance > this.visionRange) return false;
        const playerDirX = dx / distance;
        const playerDirY = dy / distance;
        const dot = this.directionX * playerDirX + this.directionY * playerDirY;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle > this.visionAngle / 2) return false;
        if (this.isLineBlocked(center.x, center.y, px, py, walls)) return false;
        if (player.isHidden) {
            const hiddenSpot = this.findHidingSpotByArea(player, hidingSpots);
            if (hiddenSpot) {
                this.knowsHiddenSpot = true;
                this.knownHiddenSpot = hiddenSpot.area;
                this.knownHiddenDoor = hiddenSpot.door;
            }
            return false;
        }
        this.knowsHiddenSpot = false;
        this.knownHiddenSpot = null;
        this.knownHiddenDoor = null;
        return true;
    }

    isCloseEnoughToCapture(player) { return this.distanceToPlayer(player) <= this.captureRange; }

    pushOutOfHidingSpot(spot) {
        const rect = this.getRect();
        const overlapLeft = rect.x + rect.width - spot.area.x;
        const overlapRight = spot.area.x + spot.area.width - rect.x;
        const overlapTop = rect.y + rect.height - spot.area.y;
        const overlapBottom = spot.area.y + spot.area.height - rect.y;
        const smallest = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (smallest === overlapLeft) this.x = spot.area.x - this.size - 1;
        else if (smallest === overlapRight) this.x = spot.area.x + spot.area.width + 1;
        else if (smallest === overlapTop) this.y = spot.area.y - this.size - 1;
        else this.y = spot.area.y + spot.area.height + 1;
    }

    keepOutsideHidingSpots(hidingSpots) {
        const rect = this.getRect();
        for (const spot of hidingSpots) if (rectsOverlap(rect, spot.area)) this.pushOutOfHidingSpot(spot);
    }

    tryStep(stepX, stepY, walls, hidingSpots) {
        const rect = { x: this.x + stepX, y: this.y + stepY, width: this.size, height: this.size };
        if (this.isRectBlocked(rect, walls, hidingSpots)) return false;
        this.x += stepX;
        this.y += stepY;
        return true;
    }

    nearestNode(point, walls) {
        if (!this.navGraph.length) return null;
        let best = null;
        let bestScore = Infinity;
        for (const node of this.navGraph) {
            const d = Math.hypot(point.x - node.x, point.y - node.y);
            const blockedPenalty = this.isLineBlocked(point.x, point.y, node.x, node.y, walls) ? 4000 : 0;
            const score = d + blockedPenalty;
            if (score < bestScore) { bestScore = score; best = node; }
        }
        return best;
    }

    buildPath(startPoint, targetPoint, walls) {
        if (!this.navGraph.length) return [];
        if (!this.isLineBlocked(startPoint.x, startPoint.y, targetPoint.x, targetPoint.y, walls)) return [{ x: targetPoint.x, y: targetPoint.y }];
        const startNode = this.nearestNode(startPoint, walls);
        const endNode = this.nearestNode(targetPoint, walls);
        if (!startNode || !endNode) return [{ x: targetPoint.x, y: targetPoint.y }];

        const open = [startNode.id];
        const came = new Map();
        const g = new Map([[startNode.id, 0]]);
        const f = new Map([[startNode.id, Math.hypot(startNode.x - endNode.x, startNode.y - endNode.y)]]);

        while (open.length) {
            open.sort((a, b) => (f.get(a) || Infinity) - (f.get(b) || Infinity));
            const currentId = open.shift();
            if (currentId === endNode.id) {
                const route = [];
                let cursor = currentId;
                while (cursor) {
                    const node = this.navIndex.get(cursor);
                    if (node) route.push({ x: node.x, y: node.y });
                    cursor = came.get(cursor);
                }
                route.reverse();
                route.push({ x: targetPoint.x, y: targetPoint.y });
                return route;
            }
            const current = this.navIndex.get(currentId);
            if (!current) continue;
            for (const linkId of current.links || []) {
                const neighbor = this.navIndex.get(linkId);
                if (!neighbor) continue;
                const tentative = (g.get(currentId) || 0) + Math.hypot(current.x - neighbor.x, current.y - neighbor.y);
                if (tentative < (g.get(linkId) ?? Infinity)) {
                    came.set(linkId, currentId);
                    g.set(linkId, tentative);
                    f.set(linkId, tentative + Math.hypot(neighbor.x - endNode.x, neighbor.y - endNode.y));
                    if (!open.includes(linkId)) open.push(linkId);
                }
            }
        }
        return [{ x: targetPoint.x, y: targetPoint.y }];
    }

    preparePath(targetX, targetY, walls) {
        const target = { x: targetX, y: targetY };
        const center = this.getCenter();
        if (this.pathTarget && Math.hypot(this.pathTarget.x - target.x, this.pathTarget.y - target.y) < 8 && this.currentPath.length) return;
        this.pathTarget = target;
        this.currentPath = this.buildPath(center, target, walls);
    }

    moveTowardRaw(targetX, targetY, walls, hidingSpots) {
        const center = this.getCenter();
        const dx = targetX - center.x;
        const dy = targetY - center.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 4) return true;
        this.faceToward(targetX, targetY);
        const stepX = (dx / distance) * this.currentSpeed;
        const stepY = (dy / distance) * this.currentSpeed;
        this.isMoving = true;
        this.walkCycle += this.currentSpeed * 0.18;
        const movedDirect = this.tryStep(stepX, stepY, walls, hidingSpots);
        if (!movedDirect) {
            const movedX = this.tryStep(stepX, 0, walls, hidingSpots);
            const movedY = this.tryStep(0, stepY, walls, hidingSpots);
            if (!movedX && !movedY) {
                const sideX = -stepY * 1.15;
                const sideY = stepX * 1.15;
                const altX = stepY * 1.15;
                const altY = -stepX * 1.15;
                this.tryStep(sideX, sideY, walls, hidingSpots) || this.tryStep(altX, altY, walls, hidingSpots);
            }
        }
        this.keepOutsideHidingSpots(hidingSpots);
        return distance < 14;
    }

    moveToward(targetX, targetY, walls, hidingSpots) {
        this.preparePath(targetX, targetY, walls);
        if (!this.currentPath.length) return this.moveTowardRaw(targetX, targetY, walls, hidingSpots);
        const waypoint = this.currentPath[0];
        const reached = this.moveTowardRaw(waypoint.x, waypoint.y, walls, hidingSpots);
        if (reached) {
            this.currentPath.shift();
            if (!this.currentPath.length) return true;
        }
        return false;
    }

    handleStuck(walls) {
        const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
        if (moved < 0.1) this.isMoving = false;
        this.stuckTimer = moved < 0.12 ? this.stuckTimer + 1 : 0;
        this.lastX = this.x;
        this.lastY = this.y;
        if (this.stuckTimer > 24) {
            this.currentPath = [];
            this.pathTarget = null;
            if (this.currentRoamTarget) this.preparePath(this.currentRoamTarget.x, this.currentRoamTarget.y, walls);
            this.stuckTimer = 0;
        }
    }

    patrol(walls, hidingSpots) {
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            this.randomLookTimer--;
            if (this.randomLookTimer <= 0) {
                const lookX = this.x + (Math.random() * 2 - 1) * 100;
                const lookY = this.y + (Math.random() * 2 - 1) * 100;
                this.faceToward(lookX, lookY);
                this.randomLookTimer = 18 + Math.floor(Math.random() * 36);
            }
            return;
        }
        const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls, hidingSpots);
        if (reached) {
            this.currentRoamTarget = this.getNextPatrolTarget();
            this.currentPath = [];
            this.pauseTimer = this.patrolPoints ? 10 + Math.floor(Math.random() * 18) : 14 + Math.floor(Math.random() * 22);
        } else if (Math.random() < 0.0035 && this.patrolPoints && this.patrolPoints.length > 3) {
            this.currentRoamTarget = this.getNextPatrolTarget();
            this.currentPath = [];
        }
    }

    triggerChaseAlert(player) {
        this.alertTriggered = true;
        this.alertPosition = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
        this.flashTimer = 16;
    }

    receiveAlert(position) {
        if (this.fsm.getState() === "CHASE") return;
        if (this.distanceToPoint(position.x, position.y) > this.alertRadius) return;
        this.investigationTarget = { x: position.x + (Math.random() * 70 - 35), y: position.y + (Math.random() * 70 - 35) };
        this.lastKnownPlayerPosition = { x: position.x, y: position.y };
        this.suspiciousTimer = 0;
        this.searchTimer = 0;
        this.pauseTimer = 0;
        this.flashTimer = 10;
        this.currentPath = [];
        this.pathTarget = null;
        this.fsm.setState("SUSPICIOUS");
    }

    goInvestigatePlayerSound(player) {
        const target = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
        this.investigationTarget = { x: target.x + (Math.random() * 40 - 20), y: target.y + (Math.random() * 40 - 20) };
        this.lastKnownPlayerPosition = { ...target };
        this.suspiciousTimer = 0;
        this.searchTimer = 0;
        this.currentPath = [];
        this.pathTarget = null;
        if (this.fsm.getState() !== "CHASE") this.fsm.setState("SUSPICIOUS");
    }

    resetToPost() {
        this.x = this.startX;
        this.y = this.startY;
        this.pauseTimer = 0;
        this.searchTimer = 0;
        this.suspiciousTimer = 0;
        this.investigationTarget = null;
        this.lastKnownPlayerPosition = null;
        this.searchPivot = null;
        this.knowsHiddenSpot = false;
        this.knownHiddenSpot = null;
        this.knownHiddenDoor = null;
        this.currentRoamTarget = this.getInitialTarget();
        this.currentPath = [];
        this.pathTarget = null;
        this.fsm.setState("RETURN");
    }

    update(player, walls, isPlayerMoving, isSneaking, isDay, hidingSpots, playerSafeInCell = false) {
        this.keepOutsideHidingSpots(hidingSpots);
        this.setSpeedByState(isDay);

        if (isDay) {
            if (this.fsm.getState() !== "PATROL" && this.fsm.getState() !== "RETURN") {
                this.fsm.setState("RETURN");
                this.investigationTarget = null;
                this.lastKnownPlayerPosition = null;
                this.searchTimer = 0;
                this.suspiciousTimer = 0;
                this.currentPath = [];
            }
            if (this.fsm.getState() === "PATROL") this.patrol(walls, hidingSpots);
            else {
                const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls, hidingSpots);
                if (reached) {
                    this.currentRoamTarget = this.getNextPatrolTarget();
                    this.pauseTimer = 8;
                    this.fsm.setState("PATROL");
                }
            }
            this.handleStuck(walls);
            return;
        }

        const currentState = this.fsm.getState();
        if (playerSafeInCell) {
            this.investigationTarget = null;
            this.lastKnownPlayerPosition = null;
            this.searchTimer = 0;
            this.suspiciousTimer = 0;
            this.knowsHiddenSpot = false;
            this.knownHiddenSpot = null;
            this.knownHiddenDoor = null;
            this.currentPath = [];
            if (currentState !== "PATROL" && currentState !== "RETURN") this.fsm.setState("RETURN");
            if (this.fsm.getState() === "PATROL") this.patrol(walls, hidingSpots);
            else {
                const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls, hidingSpots);
                if (reached) {
                    this.currentRoamTarget = this.getNextPatrolTarget();
                    this.pauseTimer = 6;
                    this.fsm.setState("PATROL");
                }
            }
            this.handleStuck(walls);
            return;
        }

        const disguised = player.isDisguised && player.isDisguised();
        const distanceToPlayer = this.distanceToPlayer(player);
        const sprintingInDisguise = disguised && !player.isSneaking && (player.speedRatio || 0) > 0.82;
        const disguiseHeat = disguised ? (player.disguiseHeat || 0) : 0;
        const seesPlayer = disguised ? false : this.canSeePlayer(player, walls, hidingSpots);
        const hearsPlayer = disguised ? sprintingInDisguise && distanceToPlayer <= this.hearingRange * 0.7 : this.canHearPlayer(player, isPlayerMoving, isSneaking, playerSafeInCell);
        const veryClose = disguised ? false : this.isVeryCloseToPlayer(player);
        const disguiseExposureRange = (this.exitGuard ? 34 : 26) + (sprintingInDisguise ? 14 : 0) + disguiseHeat * 0.08;
        const disguiseSuspicionRange = (this.exitGuard ? 86 : 66) + (sprintingInDisguise ? 30 : 0) + disguiseHeat * 0.16;
        const disguisedTooClose = disguised && !player.isHidden && (distanceToPlayer <= disguiseExposureRange || disguiseHeat >= 96);
        const disguisedSuspicious = disguised && !player.isHidden && (distanceToPlayer <= disguiseSuspicionRange || disguiseHeat >= 55);

        if (disguised && !player.isHidden && typeof player.addDisguiseHeat === "function") {
            let heatGain = 0;
            if (distanceToPlayer <= disguiseSuspicionRange) {
                heatGain += this.exitGuard ? 0.42 : 0.28;
            }
            if (distanceToPlayer <= disguiseExposureRange + 26) {
                heatGain += 0.34;
            }
            if (sprintingInDisguise) {
                heatGain += this.exitGuard ? 0.65 : 0.44;
            }
            if (this.fsm.getState() === "SUSPICIOUS" || this.fsm.getState() === "SEARCH") {
                heatGain += 0.18;
            }
            if (heatGain > 0) player.addDisguiseHeat(heatGain);
        }

        if (disguisedTooClose) {
            this.lastKnownPlayerPosition = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
            this.investigationTarget = { ...this.lastKnownPlayerPosition };
            this.currentPath = [];
            this.fsm.setState("CHASE");
            this.triggerChaseAlert(player);
        } else if (seesPlayer) {
            this.lastKnownPlayerPosition = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
            this.currentPath = [];
            if (currentState !== "CHASE") {
                this.fsm.setState("CHASE");
                this.triggerChaseAlert(player);
            }
        } else if ((currentState === "PATROL" || currentState === "RETURN") && (hearsPlayer || veryClose)) {
            this.goInvestigatePlayerSound(player);
        } else if ((currentState === "PATROL" || currentState === "RETURN") && disguisedSuspicious) {
            this.investigationTarget = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
            this.lastKnownPlayerPosition = { ...this.investigationTarget };
            this.currentPath = [];
            this.suspiciousTimer = Math.max(this.suspiciousTimer, this.maxSuspiciousTime - 24);
            this.fsm.setState("SUSPICIOUS");
        } else if (currentState === "SUSPICIOUS" && (hearsPlayer || veryClose || disguisedSuspicious)) {
            this.goInvestigatePlayerSound(player);
        }

        switch (this.fsm.getState()) {
            case "PATROL":
                this.patrol(walls, hidingSpots);
                break;
            case "SUSPICIOUS":
                if (player.isHidden && !this.exitGuard) { this.fsm.setState("RETURN"); break; }
                if (this.investigationTarget) this.moveToward(this.investigationTarget.x, this.investigationTarget.y, walls, hidingSpots);
                this.suspiciousTimer++;
                if (!disguised && this.canSeePlayer(player, walls, hidingSpots)) {
                    this.currentPath = [];
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (this.suspiciousTimer >= this.maxSuspiciousTime) {
                    this.searchTimer = 0;
                    this.lastKnownPlayerPosition = this.investigationTarget;
                    this.searchPivot = this.investigationTarget ? { ...this.investigationTarget } : null;
                    this.currentPath = [];
                    this.fsm.setState("SEARCH");
                }
                break;
            case "SEARCH": {
                let target = this.lastKnownPlayerPosition;
                if (!target && this.searchPivot) {
                    target = this.searchPivot;
                }
                if (player.isHidden && this.knowsHiddenSpot && this.knownHiddenDoor) {
                    target = { x: this.knownHiddenDoor.x + this.knownHiddenDoor.width / 2, y: this.knownHiddenDoor.y + this.knownHiddenDoor.height / 2 };
                }
                if (target && (!this.investigationTarget || this.searchTimer % 55 === 0)) {
                    const radius = this.exitGuard ? 140 : 110;
                    this.investigationTarget = {
                        x: target.x + (Math.random() * radius * 2 - radius),
                        y: target.y + (Math.random() * radius * 2 - radius)
                    };
                    this.currentPath = [];
                }
                if (this.investigationTarget) this.moveToward(this.investigationTarget.x, this.investigationTarget.y, walls, hidingSpots);
                this.searchTimer++;
                if (!disguised && this.canSeePlayer(player, walls, hidingSpots)) {
                    this.currentPath = [];
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (this.searchTimer >= this.maxSearchTime + (this.exitGuard ? 70 : 0)) {
                    this.knowsHiddenSpot = false;
                    this.knownHiddenSpot = null;
                    this.knownHiddenDoor = null;
                    this.currentPath = [];
                    this.fsm.setState("RETURN");
                }
                break;
            }
            case "CHASE":
                if (player.isHidden && this.knowsHiddenSpot && this.knownHiddenDoor) {
                    this.moveToward(this.knownHiddenDoor.x + this.knownHiddenDoor.width / 2, this.knownHiddenDoor.y + this.knownHiddenDoor.height / 2, walls, hidingSpots);
                    this.searchTimer++;
                    if (this.searchTimer > this.maxSearchTime + 50) {
                        this.searchTimer = 0;
                        this.searchPivot = this.lastKnownPlayerPosition ? { ...this.lastKnownPlayerPosition } : null;
                        this.currentPath = [];
                        this.fsm.setState("SEARCH");
                    }
                } else {
                    this.moveToward(player.x + player.size / 2, player.y + player.size / 2, walls, hidingSpots);
                    this.lastKnownPlayerPosition = { x: player.x + player.size / 2, y: player.y + player.size / 2 };
                    if (!this.canSeePlayer(player, walls, hidingSpots)) {
                        this.searchTimer = 0;
                        this.currentPath = [];
                        this.fsm.setState("SEARCH");
                    }
                }
                break;
            case "RETURN": {
                const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls, hidingSpots);
                if (!disguised && this.canSeePlayer(player, walls, hidingSpots)) {
                    this.currentPath = [];
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (reached) {
                    this.pauseTimer = 6;
                    this.knowsHiddenSpot = false;
                    this.knownHiddenSpot = null;
                    this.knownHiddenDoor = null;
                    this.currentRoamTarget = this.getNextPatrolTarget();
                    this.currentPath = [];
                    this.fsm.setState("PATROL");
                }
                break;
            }
        }
        this.handleStuck(walls);
    }

    getStateColor() {
        const state = this.fsm.getState();
        if (state === "CHASE") return "#ff5b5b";
        if (state === "SEARCH") return "#ffb347";
        if (state === "SUSPICIOUS") return "#bc86ff";
        if (state === "RETURN") return "#67b8ff";
        return "#69d47b";
    }
    draw(ctx, camera, assets, debugVision = true) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        const centerX = drawX + this.size / 2;
        const centerY = drawY + this.size / 2;
        const angle = Math.atan2(this.directionY, this.directionX);
        const state = this.fsm.getState();
        const color = this.getStateColor();
        const spriteScale = this.size / 36;
        const bob = (this.isMoving ? Math.sin(this.walkCycle) * 1.6 : Math.sin(Date.now() * 0.006 + this.id) * 0.25) * spriteScale;
        const armSwing = (this.isMoving ? Math.sin(this.walkCycle) * 3.1 : 0) * spriteScale;
        const legSwing = (this.isMoving ? Math.sin(this.walkCycle) * 2.5 : 0) * spriteScale;

        if (debugVision) {
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, this.visionRange, -this.visionAngle / 2, this.visionAngle / 2);
            ctx.closePath();
            ctx.fillStyle = state === "CHASE" ? "rgba(255, 88, 88, 0.2)" : state === "SEARCH" ? "rgba(255, 179, 71, 0.13)" : "rgba(255, 238, 150, 0.07)";
            ctx.fill();

            if (this.exitGuard) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, this.visionRange * 0.58, -this.visionAngle / 3.1, this.visionAngle / 3.1);
                ctx.closePath();
                ctx.fillStyle = state === "CHASE" ? "rgba(255,160,160,0.12)" : "rgba(190, 225, 255, 0.1)";
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.26)";
        ctx.beginPath();
        ctx.ellipse(centerX, drawY + this.size + 9, 15, 6.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(centerX, centerY + bob);
        ctx.rotate(angle * 0.12);
        ctx.scale(spriteScale, spriteScale);

        const uniformTop = state === "CHASE" ? "#8b3131" : state === "SEARCH" ? "#856032" : "#3b5875";
        const uniformBottom = state === "CHASE" ? "#5f2020" : state === "SEARCH" ? "#63471f" : "#273d51";
        const trim = state === "CHASE" ? "#ffb3b3" : state === "SEARCH" ? "#ffd58b" : "#b8d7f3";

        ctx.strokeStyle = "rgba(14,18,24,0.38)";
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-5.4, 14);
        ctx.lineTo(-4.3 + legSwing, 24);
        ctx.moveTo(5.4, 14);
        ctx.lineTo(4.3 - legSwing, 24);
        ctx.moveTo(-8, 1);
        ctx.lineTo(-11 + armSwing, 10.5);
        ctx.moveTo(8, 1);
        ctx.lineTo(11 - armSwing, 10.5);
        ctx.stroke();

        ctx.fillStyle = "#edc3a0";
        ctx.beginPath();
        ctx.arc(0, -11, 7.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#33271f";
        ctx.beginPath();
        ctx.arc(0, -14, 8, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-8, -13.5, 16, 4);

        ctx.fillStyle = "#223648";
        ctx.fillRect(-9.2, -18.3, 18.4, 3.2);
        ctx.fillStyle = trim;
        ctx.fillRect(-3.8, -20.3, 7.6, 2.2);

        const uniformGradient = ctx.createLinearGradient(0, -4, 0, 13);
        uniformGradient.addColorStop(0, uniformTop);
        uniformGradient.addColorStop(1, uniformBottom);
        ctx.fillStyle = uniformGradient;
        ctx.beginPath();
        ctx.roundRect(-8.8, -3, 17.6, 18, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = trim;
        ctx.fillRect(-6.4, -0.4, 12.8, 2.4);
        ctx.fillRect(-1.2, 2.2, 2.4, 5.6);
        ctx.fillStyle = "#0f171f";
        ctx.fillRect(-8, 7, 16, 2.5);
        ctx.fillStyle = state === "CHASE" ? "#ff6464" : "#8ed7ff";
        ctx.fillRect(2.5, 4.2, 3.5, 4.6);
        ctx.fillStyle = this.exitGuard ? "#ffd166" : "rgba(255,255,255,0.6)";
        ctx.fillRect(-5.6, 4.4, 2.6, 3.6);
        ctx.fillStyle = "rgba(12,18,24,0.5)";
        ctx.fillRect(-6.6, 0.5, 1.2, 9.4);

        ctx.fillStyle = "#1b2937";
        ctx.fillRect(-7, 13, 5.5, 12);
        ctx.fillRect(1.5, 13, 5.5, 12);
        ctx.fillStyle = "#0e141b";
        ctx.fillRect(-7.5, 23, 6.5, 3.5);
        ctx.fillRect(1, 23, 6.5, 3.5);

        ctx.fillStyle = "#edc3a0";
        ctx.beginPath();
        ctx.arc(-11 + armSwing, 11, 2.2, 0, Math.PI * 2);
        ctx.arc(11 - armSwing, 11, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(245, 248, 251, 0.95)";
        ctx.fillRect(7, 5, 6.5, 2.2);
        ctx.restore();

        ctx.restore();

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.size * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, drawY - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (this.flashTimer > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.88)";
            ctx.beginPath();
            ctx.arc(centerX, drawY - 8, 5 + this.flashTimer * 0.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

