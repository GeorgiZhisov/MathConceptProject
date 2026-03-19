class Guard {
    constructor(x, y, size, roamZone) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.size = size;

        this.roamZone = roamZone;
        this.currentRoamTarget = this.getRandomPointInZone();

        this.fsm = new StateMachine("PATROL");

        this.directionX = 1;
        this.directionY = 0;

        this.patrolSpeed = 1.0;
        this.suspiciousSpeed = 1.7;
        this.chaseSpeed = 2.1;
        this.currentSpeed = this.patrolSpeed;

        this.visionRange = 250;
        this.visionAngle = Math.PI / 2.5;
        this.captureRange = 26;
        this.hearingRange = 170;
        this.closeHearingRange = 100;

        this.lastKnownPlayerPosition = null;
        this.investigationTarget = null;

        this.searchTimer = 0;
        this.maxSearchTime = 160;

        this.suspiciousTimer = 0;
        this.maxSuspiciousTime = 110;

        this.pauseTimer = 0;

        this.alertTriggered = false;
        this.alertPosition = null;

        this.stuckTimer = 0;
        this.lastX = x;
        this.lastY = y;

        this.knowsHiddenSpot = false;
        this.knownHiddenSpot = null;
    }

    beginFrame() {
        this.alertTriggered = false;
        this.alertPosition = null;
    }

    getCenter() {
        return {
            x: this.x + this.size / 2,
            y: this.y + this.size / 2
        };
    }

    getRandomPointInZone() {
        return {
            x: this.roamZone.x + 20 + Math.random() * (this.roamZone.width - 40),
            y: this.roamZone.y + 20 + Math.random() * (this.roamZone.height - 40)
        };
    }

    faceToward(targetX, targetY) {
        const center = this.getCenter();
        const dx = targetX - center.x;
        const dy = targetY - center.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0.001) {
            this.directionX = dx / length;
            this.directionY = dy / length;
        }
    }

    setSpeedByState() {
        const state = this.fsm.getState();

        if (state === "PATROL" || state === "RETURN") {
            this.currentSpeed = this.patrolSpeed;
        } else if (state === "SUSPICIOUS" || state === "SEARCH") {
            this.currentSpeed = this.suspiciousSpeed;
        } else if (state === "CHASE") {
            this.currentSpeed = this.chaseSpeed;
        }
    }

    distanceToPlayer(player) {
        const center = this.getCenter();
        const px = player.x + player.size / 2;
        const py = player.y + player.size / 2;
        const dx = px - center.x;
        const dy = py - center.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    canHearPlayer(player, isPlayerMoving) {
        if (!isPlayerMoving || player.isHidden) {
            return false;
        }

        return this.distanceToPlayer(player) <= this.hearingRange;
    }

    isVeryCloseToPlayer(player) {
        return !player.isHidden && this.distanceToPlayer(player) <= this.closeHearingRange;
    }

    isLineBlocked(x1, y1, x2, y2, walls) {
        const steps = 36;

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = x1 + (x2 - x1) * t;
            const py = y1 + (y2 - y1) * t;

            for (const wall of walls) {
                if (
                    px >= wall.x &&
                    px <= wall.x + wall.width &&
                    py >= wall.y &&
                    py <= wall.y + wall.height
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    canSeePlayer(player, walls) {
        const center = this.getCenter();
        const px = player.x + player.size / 2;
        const py = player.y + player.size / 2;

        const dx = px - center.x;
        const dy = py - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.visionRange) return false;

        const playerDirX = dx / distance;
        const playerDirY = dy / distance;

        const dot = this.directionX * playerDirX + this.directionY * playerDirY;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

        if (angle > this.visionAngle / 2) return false;
        if (this.isLineBlocked(center.x, center.y, px, py, walls)) return false;

        if (player.isHidden) {
            const hiddenSpot = player.currentHidingSpot;

            if (this.fsm.getState() === "CHASE" && hiddenSpot) {
                const hx = hiddenSpot.x + hiddenSpot.width / 2;
                const hy = hiddenSpot.y + hiddenSpot.height / 2;
                const hdx = hx - center.x;
                const hdy = hy - center.y;
                const hd = Math.sqrt(hdx * hdx + hdy * hdy);

                if (hd < 55) {
                    this.knowsHiddenSpot = true;
                    this.knownHiddenSpot = hiddenSpot;
                    return true;
                }
            }

            return false;
        }

        this.knowsHiddenSpot = false;
        this.knownHiddenSpot = null;
        return true;
    }

    isCloseEnoughToCapture(player) {
        return this.distanceToPlayer(player) <= this.captureRange;
    }

    moveToward(targetX, targetY, walls) {
        const center = this.getCenter();
        const dx = targetX - center.x;
        const dy = targetY - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= 1) return true;

        const moveX = (dx / distance) * this.currentSpeed;
        const moveY = (dy / distance) * this.currentSpeed;

        this.faceToward(targetX, targetY);

        const nextRectX = {
            x: this.x + moveX,
            y: this.y,
            width: this.size,
            height: this.size
        };

        const nextRectY = {
            x: this.x,
            y: this.y + moveY,
            width: this.size,
            height: this.size
        };

        let blockedX = false;
        let blockedY = false;

        for (const wall of walls) {
            if (rectsOverlap(nextRectX, wall)) blockedX = true;
            if (rectsOverlap(nextRectY, wall)) blockedY = true;
        }

        if (!blockedX) this.x += moveX;
        if (!blockedY) this.y += moveY;

        return distance < 10;
    }

    handleStuck() {
        const dx = this.x - this.lastX;
        const dy = this.y - this.lastY;
        const moved = Math.sqrt(dx * dx + dy * dy);

        if (moved < 0.1) {
            this.stuckTimer++;
        } else {
            this.stuckTimer = 0;
        }

        this.lastX = this.x;
        this.lastY = this.y;

        if (this.stuckTimer > 30) {
            this.currentRoamTarget = this.getRandomPointInZone();
            this.investigationTarget = this.getRandomPointInZone();
            this.lastKnownPlayerPosition = this.getRandomPointInZone();
            this.pauseTimer = 0;
            this.stuckTimer = 0;
            this.fsm.setState("RETURN");
        }
    }

    patrol(walls) {
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            return;
        }

        const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls);

        if (reached) {
            this.currentRoamTarget = this.getRandomPointInZone();
            this.pauseTimer = 20 + Math.floor(Math.random() * 35);
        }
    }

    triggerChaseAlert(player) {
        this.alertTriggered = true;
        this.alertPosition = {
            x: player.x + player.size / 2,
            y: player.y + player.size / 2
        };
    }

    receiveAlert(position) {
        const state = this.fsm.getState();

        if (state === "CHASE" || state === "CAPTURE") return;

        this.investigationTarget = { x: position.x, y: position.y };
        this.lastKnownPlayerPosition = { x: position.x, y: position.y };
        this.suspiciousTimer = 0;
        this.searchTimer = 0;
        this.pauseTimer = 0;
        this.fsm.setState("SUSPICIOUS");
    }

    goInvestigatePlayerSound(player) {
        this.investigationTarget = {
            x: player.x + player.size / 2,
            y: player.y + player.size / 2
        };
        this.lastKnownPlayerPosition = {
            x: player.x + player.size / 2,
            y: player.y + player.size / 2
        };
        this.suspiciousTimer = 0;
        this.searchTimer = 0;

        if (this.fsm.getState() !== "CHASE" && this.fsm.getState() !== "CAPTURE") {
            this.fsm.setState("SUSPICIOUS");
        }
    }

    update(player, walls, isPlayerMoving, isDay) {
        this.setSpeedByState();

        if (isDay) {
            if (this.fsm.getState() !== "PATROL" && this.fsm.getState() !== "RETURN") {
                this.fsm.setState("RETURN");
                this.investigationTarget = null;
                this.lastKnownPlayerPosition = null;
                this.searchTimer = 0;
                this.suspiciousTimer = 0;
                this.knowsHiddenSpot = false;
                this.knownHiddenSpot = null;
            }

            switch (this.fsm.getState()) {
                case "PATROL":
                    this.patrol(walls);
                    break;

                case "RETURN": {
                    const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls);

                    if (reached) {
                        this.pauseTimer = 10;
                        this.currentRoamTarget = this.getRandomPointInZone();
                        this.fsm.setState("PATROL");
                    }
                    break;
                }
            }

            this.handleStuck();
            this.setSpeedByState();
            return;
        }

        const currentState = this.fsm.getState();
        const seesPlayer = this.canSeePlayer(player, walls);
        const hearsPlayer = this.canHearPlayer(player, isPlayerMoving);
        const veryClose = this.isVeryCloseToPlayer(player);

        if (seesPlayer) {
            this.lastKnownPlayerPosition = {
                x: player.x + player.size / 2,
                y: player.y + player.size / 2
            };

            if (currentState !== "CHASE" && currentState !== "CAPTURE") {
                this.fsm.setState("CHASE");
                this.triggerChaseAlert(player);
            }
        } else if ((currentState === "PATROL" || currentState === "RETURN") && (hearsPlayer || veryClose)) {
            this.goInvestigatePlayerSound(player);
        } else if (currentState === "SUSPICIOUS" && (hearsPlayer || veryClose)) {
            this.goInvestigatePlayerSound(player);
        }

        this.setSpeedByState();

        switch (this.fsm.getState()) {
            case "PATROL":
                this.patrol(walls);
                break;

            case "SUSPICIOUS":
                if (player.isHidden) {
                    this.fsm.setState("RETURN");
                    break;
                }

                if (this.investigationTarget) {
                    this.moveToward(this.investigationTarget.x, this.investigationTarget.y, walls);
                }

                this.suspiciousTimer++;

                if (this.canSeePlayer(player, walls)) {
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (this.suspiciousTimer >= this.maxSuspiciousTime) {
                    this.searchTimer = 0;
                    this.lastKnownPlayerPosition = this.investigationTarget;
                    this.fsm.setState("SEARCH");
                }
                break;

            case "SEARCH":
                if (player.isHidden && !this.knowsHiddenSpot) {
                    this.fsm.setState("RETURN");
                    break;
                }

                if (this.knowsHiddenSpot && this.knownHiddenSpot) {
                    this.moveToward(
                        this.knownHiddenSpot.x + this.knownHiddenSpot.width / 2,
                        this.knownHiddenSpot.y + this.knownHiddenSpot.height / 2,
                        walls
                    );
                } else if (this.lastKnownPlayerPosition) {
                    this.moveToward(this.lastKnownPlayerPosition.x, this.lastKnownPlayerPosition.y, walls);
                }

                this.searchTimer++;

                if (this.canSeePlayer(player, walls)) {
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (this.searchTimer >= this.maxSearchTime) {
                    this.knowsHiddenSpot = false;
                    this.knownHiddenSpot = null;
                    this.fsm.setState("RETURN");
                }
                break;

            case "CHASE":
                this.moveToward(player.x + player.size / 2, player.y + player.size / 2, walls);
                this.lastKnownPlayerPosition = {
                    x: player.x + player.size / 2,
                    y: player.y + player.size / 2
                };

                if (this.isCloseEnoughToCapture(player)) {
                    this.fsm.setState("CAPTURE");
                } else if (!this.canSeePlayer(player, walls)) {
                    this.searchTimer = 0;
                    this.fsm.setState("SEARCH");
                }
                break;

            case "RETURN": {
                const reached = this.moveToward(this.currentRoamTarget.x, this.currentRoamTarget.y, walls);

                if (this.canSeePlayer(player, walls)) {
                    this.fsm.setState("CHASE");
                    this.triggerChaseAlert(player);
                } else if (reached) {
                    this.pauseTimer = 10;
                    this.knowsHiddenSpot = false;
                    this.knownHiddenSpot = null;
                    this.currentRoamTarget = this.getRandomPointInZone();
                    this.fsm.setState("PATROL");
                }
                break;
            }

            case "CAPTURE":
                break;
        }

        this.handleStuck();
        this.setSpeedByState();
    }

    draw(ctx, camera) {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;

        const state = this.fsm.getState();

        if (state === "CHASE") ctx.fillStyle = "#ff3333";
        else if (state === "SEARCH") ctx.fillStyle = "#ffaa00";
        else if (state === "SUSPICIOUS") ctx.fillStyle = "#cc66ff";
        else ctx.fillStyle = "#33cc33";

        ctx.fillRect(drawX, drawY, this.size, this.size);

        const centerX = drawX + this.size / 2;
        const centerY = drawY + this.size / 2;
        const angle = Math.atan2(this.directionY, this.directionX);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, this.visionRange, -this.visionAngle / 2, this.visionAngle / 2);
        ctx.closePath();

        if (state === "CHASE") {
            ctx.fillStyle = "rgba(255, 60, 60, 0.16)";
        } else if (state === "SUSPICIOUS") {
            ctx.fillStyle = "rgba(180, 80, 255, 0.13)";
        } else {
            ctx.fillStyle = "rgba(255, 255, 180, 0.09)";
        }

        ctx.fill();
        ctx.restore();
    }
}