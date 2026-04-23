class Player {
    constructor(x, y, size, speed) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.size = size;

        this.baseSpeed = speed;
        this.currentSpeed = speed;
        this.sneakMultiplier = 0.6;
        this.chaseBoostMultiplier = 1.08;
        this.acceleration = 0.24;
        this.brakeStrength = 0.22;
        this.vx = 0;
        this.vy = 0;
        this.speedRatio = 0;

        this.lives = 3;
        this.state = "IN_CELL";
        this.waitingForDay = false;
        this.canMove = false;

        this.isHidden = false;
        this.currentHidingSpot = null;
        this.lastMoveDirection = { x: 0, y: 1 };
        this.isSneaking = false;

        this.collisionInset = 8;
        this.doorMargin = 14;

        this.lockpicks = 0;
        this.keycards = 0;
        this.bottles = 0;
        this.cutters = 0;
        this.uniforms = 0;
        this.routeIntel = false;
        this.fakeUniformTimer = 0;
        this.disguiseHeat = 0;
        this.walkCycle = 0;
        this.isMoving = false;
    }

    resetForNewRun() {
        this.lives = 3;
        this.resetToCell();
        this.lockpicks = 0;
        this.keycards = 0;
        this.bottles = 0;
        this.cutters = 0;
        this.uniforms = 0;
        this.routeIntel = false;
        this.fakeUniformTimer = 0;
        this.disguiseHeat = 0;
        this.waitingForDay = false;
        this.canMove = true;
        this.state = "FREE_ROAM";
    }

    resetToCell() {
        this.x = this.startX;
        this.y = this.startY;
        this.vx = 0;
        this.vy = 0;
        this.speedRatio = 0;
        this.state = "IN_CELL";
        this.waitingForDay = false;
        this.canMove = true;
        this.isHidden = false;
        this.currentHidingSpot = null;
        this.fakeUniformTimer = 0;
        this.disguiseHeat = 0;
    }

    addItem(itemName) {
        if (itemName === "lockpick") this.lockpicks++;
        else if (itemName === "keycard") this.keycards++;
        else if (itemName === "bottle") this.bottles++;
        else if (itemName === "cutter") this.cutters++;
        else if (itemName === "uniform") this.uniforms++;
        else if (itemName === "routes") this.routeIntel = true;
    }

    useLockpick() {
        if (this.lockpicks <= 0) return false;
        this.lockpicks--;
        return true;
    }

    useKeycard() {
        if (this.keycards <= 0) return false;
        this.keycards--;
        return true;
    }

    useBottle() {
        if (this.bottles <= 0) return false;
        this.bottles--;
        return true;
    }

    useCutter() {
        if (this.cutters <= 0) return false;
        this.cutters--;
        return true;
    }

    useUniform() {
        if (this.uniforms <= 0) return false;
        this.uniforms--;
        this.fakeUniformTimer = 60 * 20;
        this.disguiseHeat = 0;
        return true;
    }

    isDisguised() {
        return this.fakeUniformTimer > 0;
    }

    addDisguiseHeat(amount) {
        if (!this.isDisguised()) return;
        this.disguiseHeat = this.clamp(this.disguiseHeat + amount, 0, 100);
    }

    coolDisguise(amount) {
        this.disguiseHeat = this.clamp(this.disguiseHeat - amount, 0, 100);
    }

    getRect(x = this.x, y = this.y) {
        return { x, y, width: this.size, height: this.size };
    }

    getCollisionRect(x = this.x, y = this.y) {
        return {
            x: x + this.collisionInset,
            y: y + this.collisionInset,
            width: this.size - this.collisionInset * 2,
            height: this.size - this.collisionInset * 2
        };
    }

    expandRect(rect, amount) {
        return {
            x: rect.x - amount,
            y: rect.y - amount,
            width: rect.width + amount * 2,
            height: rect.height + amount * 2
        };
    }

    rectFullyInside(inner, outer) {
        return (
            inner.x >= outer.x &&
            inner.y >= outer.y &&
            inner.x + inner.width <= outer.x + outer.width &&
            inner.y + inner.height <= outer.y + outer.height
        );
    }

    rectCenter(rect) {
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
        };
    }

    pointInRect(px, py, rect) {
        return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
    }

    isInsideArea(area, x = this.x, y = this.y) {
        const rect = this.getCollisionRect(x, y);
        const center = this.rectCenter(rect);
        return this.pointInRect(center.x, center.y, area);
    }

    touchesDoor(rect, door) {
        return rectsOverlap(rect, this.expandRect(door, this.doorMargin));
    }

    collisionToVisual(rect) {
        return { x: rect.x - this.collisionInset, y: rect.y - this.collisionInset };
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    approach(current, target, amount) {
        if (current < target) return Math.min(target, current + amount);
        if (current > target) return Math.max(target, current - amount);
        return target;
    }

    keepInsideArea(rect, area) {
        return {
            x: this.clamp(rect.x, area.x, area.x + area.width - rect.width),
            y: this.clamp(rect.y, area.y, area.y + area.height - rect.height),
            width: rect.width,
            height: rect.height
        };
    }

    applyRoomRule(currentRect, nextRect, area, door, canEnter) {
        const currentInside = this.rectFullyInside(currentRect, area);
        const nextInside = this.rectFullyInside(nextRect, area);
        const nearDoor = this.touchesDoor(currentRect, door) || this.touchesDoor(nextRect, door);

        if (currentInside && nextInside) return nextRect;
        if (!currentInside && !nextInside) return nextRect;

        if (currentInside && !nextInside) {
            return nearDoor ? nextRect : this.keepInsideArea(nextRect, area);
        }

        if (!currentInside && nextInside) {
            return canEnter && nearDoor ? nextRect : currentRect;
        }

        return nextRect;
    }

    applyCellRule(currentRect, nextRect, cellArea, cellEntrance, isDay, cellDoorUnlocked) {
        const currentInside = this.rectFullyInside(currentRect, cellArea);
        const nextInside = this.rectFullyInside(nextRect, cellArea);
        const nearDoor = this.touchesDoor(currentRect, cellEntrance) || this.touchesDoor(nextRect, cellEntrance);

        if (currentInside && nextInside) return nextRect;
        if (!currentInside && !nextInside) return nextRect;

        if (currentInside && !nextInside) {
            return nearDoor && (isDay || cellDoorUnlocked) ? nextRect : this.keepInsideArea(nextRect, cellArea);
        }

        if (!currentInside && nextInside) {
            return nearDoor && isDay ? nextRect : currentRect;
        }

        return nextRect;
    }

    applyWalls(nextRect, walls, blockedDoor) {
        for (const wall of walls) {
            if (rectsOverlap(nextRect, wall)) return true;
        }
        if (blockedDoor && rectsOverlap(nextRect, blockedDoor)) return true;
        return false;
    }

    updateHiddenState(hidingSpots) {
        this.isHidden = false;
        this.currentHidingSpot = null;

        for (const spot of hidingSpots) {
            if (this.isInsideArea(spot.area)) {
                this.isHidden = true;
                this.currentHidingSpot = spot.area;
                break;
            }
        }
    }

    update(keys, walls, cellDoor, isDay, isBeingChased, hidingSpots, cellArea, cellEntrance, cellDoorUnlocked = false) {
        if (this.fakeUniformTimer > 0) this.fakeUniformTimer--;
        if (!this.isDisguised()) this.disguiseHeat = 0;

        this.isMoving = false;
        this.isSneaking = !!keys.shift;

        if (this.waitingForDay && isDay) {
            this.waitingForDay = false;
            this.canMove = true;
            this.state = "FREE_ROAM";
        }

        if (!this.canMove) {
            this.vx = 0;
            this.vy = 0;
            this.speedRatio = 0;
            this.updateHiddenState(hidingSpots);
            return;
        }

        const targetSpeed = this.baseSpeed * (this.isSneaking ? this.sneakMultiplier : (isBeingChased ? this.chaseBoostMultiplier : 1));
        this.currentSpeed = targetSpeed;

        let desiredX = 0;
        let desiredY = 0;
        if (keys.w || keys.arrowup) desiredY -= 1;
        if (keys.s || keys.arrowdown) desiredY += 1;
        if (keys.a || keys.arrowleft) desiredX -= 1;
        if (keys.d || keys.arrowright) desiredX += 1;

        const desiredLength = Math.hypot(desiredX, desiredY);
        if (desiredLength > 0) {
            desiredX = (desiredX / desiredLength) * targetSpeed;
            desiredY = (desiredY / desiredLength) * targetSpeed;
        }

        const accel = targetSpeed * this.acceleration + 0.06;
        const brake = targetSpeed * this.brakeStrength + 0.04;

        this.vx = this.approach(this.vx, desiredX, desiredLength > 0 ? accel : brake);
        this.vy = this.approach(this.vy, desiredY, desiredLength > 0 ? accel : brake);

        if (Math.abs(this.vx) < 0.02) this.vx = 0;
        if (Math.abs(this.vy) < 0.02) this.vy = 0;

        let moveX = this.vx;
        let moveY = this.vy;
        const actualSpeed = Math.hypot(moveX, moveY);
        this.speedRatio = targetSpeed > 0 ? this.clamp(actualSpeed / targetSpeed, 0, 1.15) : 0;

        if (actualSpeed > 0.04) {
            this.lastMoveDirection = { x: moveX / actualSpeed, y: moveY / actualSpeed };
            this.isMoving = true;
            this.walkCycle += 0.18 + actualSpeed * 0.28;
        }

        let currentRect = this.getCollisionRect();

        if (moveX !== 0) {
            let nextRectX = {
                x: currentRect.x + moveX,
                y: currentRect.y,
                width: currentRect.width,
                height: currentRect.height
            };

            if (!this.applyWalls(nextRectX, walls, cellDoor)) {
                for (const spot of hidingSpots) {
                    nextRectX = this.applyRoomRule(currentRect, nextRectX, spot.area, spot.door, true);
                }

                nextRectX = this.applyCellRule(currentRect, nextRectX, cellArea, cellEntrance, isDay, cellDoorUnlocked);

                const pos = this.collisionToVisual(nextRectX);
                this.x = pos.x;
                currentRect = this.getCollisionRect();
            } else {
                this.vx *= 0.28;
            }
        }

        if (moveY !== 0) {
            let nextRectY = {
                x: currentRect.x,
                y: currentRect.y + moveY,
                width: currentRect.width,
                height: currentRect.height
            };

            if (!this.applyWalls(nextRectY, walls, cellDoor)) {
                for (const spot of hidingSpots) {
                    nextRectY = this.applyRoomRule(currentRect, nextRectY, spot.area, spot.door, true);
                }

                nextRectY = this.applyCellRule(currentRect, nextRectY, cellArea, cellEntrance, isDay, cellDoorUnlocked);

                const pos = this.collisionToVisual(nextRectY);
                this.x = pos.x;
                this.y = pos.y;
            } else {
                this.vy *= 0.28;
            }
        }

        if (this.isDisguised()) {
            const coolRate = this.isSneaking ? 0.22 : 0.08;
            this.coolDisguise(coolRate);
        }

        this.updateHiddenState(hidingSpots);
    }

    draw(ctx, camera, assets, scene = "prison") {
        const drawX = this.x - camera.x;
        const drawY = this.y - camera.y;
        const centerX = drawX + this.size / 2;
        const centerY = drawY + this.size / 2;
        const disguised = this.isDisguised();
        const hiddenAlpha = this.isHidden ? 0.5 : 1;
        const facing = this.lastMoveDirection.x < -0.18 ? -1 : this.lastMoveDirection.x > 0.18 ? 1 : 1;
        const spriteScale = this.size / 34;

        if (scene === "car") {
            const dirX = Math.abs(this.lastMoveDirection.x) + Math.abs(this.lastMoveDirection.y) > 0.001 ? this.lastMoveDirection.x : 1;
            const dirY = Math.abs(this.lastMoveDirection.x) + Math.abs(this.lastMoveDirection.y) > 0.001 ? this.lastMoveDirection.y : 0;
            const angle = Math.atan2(dirY, dirX);
            const carW = this.size * 1.36;
            const carH = this.size * 0.82;
            const pulse = this.isMoving ? (Math.sin(this.walkCycle * 0.8) * 0.14 + 0.96) : 1;

            ctx.save();
            ctx.globalAlpha = hiddenAlpha;
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.scale(pulse, 1);

            ctx.fillStyle = "rgba(0,0,0,0.34)";
            ctx.beginPath();
            ctx.ellipse(0, carH * 0.58, carW * 0.42, carH * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#0d1b2a";
            ctx.beginPath();
            ctx.roundRect(-carW / 2, -carH / 2, carW, carH, 12);
            ctx.fill();

            const bodyGradient = ctx.createLinearGradient(0, -carH / 2, 0, carH / 2);
            bodyGradient.addColorStop(0, this.isDisguised() ? "#4a5f70" : "#2f7dd1");
            bodyGradient.addColorStop(0.58, this.isDisguised() ? "#2c4252" : "#1f5ea0");
            bodyGradient.addColorStop(1, this.isDisguised() ? "#1f303d" : "#143d69");
            ctx.fillStyle = bodyGradient;
            ctx.beginPath();
            ctx.roundRect(-carW / 2 + 2, -carH / 2 + 2, carW - 4, carH - 4, 11);
            ctx.fill();

            ctx.fillStyle = "#8ec8ff";
            ctx.beginPath();
            ctx.roundRect(-carW * 0.12, -carH * 0.28, carW * 0.42, carH * 0.56, 8);
            ctx.fill();

            ctx.fillStyle = "rgba(255,255,255,0.16)";
            ctx.fillRect(-carW * 0.38, -carH * 0.23, carW * 0.22, carH * 0.10);
            ctx.fillRect(-carW * 0.02, -carH * 0.23, carW * 0.20, carH * 0.10);

            ctx.fillStyle = "#111";
            const wheelW = carW * 0.14;
            const wheelH = carH * 0.24;
            ctx.fillRect(-carW * 0.33, -carH * 0.56, wheelW, wheelH);
            ctx.fillRect(carW * 0.18, -carH * 0.56, wheelW, wheelH);
            ctx.fillRect(-carW * 0.33, carH * 0.32, wheelW, wheelH);
            ctx.fillRect(carW * 0.18, carH * 0.32, wheelW, wheelH);

            ctx.fillStyle = "#ffd166";
            ctx.fillRect(carW * 0.39, -carH * 0.18, carW * 0.08, carH * 0.12);
            ctx.fillRect(carW * 0.39, carH * 0.06, carW * 0.08, carH * 0.12);
            ctx.fillStyle = "#ff595e";
            ctx.fillRect(-carW * 0.47, -carH * 0.18, carW * 0.08, carH * 0.12);
            ctx.fillRect(-carW * 0.47, carH * 0.06, carW * 0.08, carH * 0.12);

            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = `700 ${Math.max(10, Math.round(this.size * 0.26))}px Inter, Arial`;
            ctx.textAlign = "center";
            ctx.fillText("ESC", 0, 4);
            ctx.restore();
            return;
        }
        const bob = (this.isMoving ? Math.sin(this.walkCycle) * 1.9 : Math.sin(Date.now() * 0.0045) * 0.3) * spriteScale;
        const armSwing = (this.isMoving ? Math.sin(this.walkCycle) * 3.3 : 0) * spriteScale;
        const legSwing = (this.isMoving ? Math.sin(this.walkCycle) * 2.7 : 0) * spriteScale;
        const torsoColor = disguised ? "#3d586b" : "#f1a33f";
        const torsoShade = disguised ? "#243847" : "#cb7a20";
        const accentColor = disguised ? "#d9ecff" : "#204f8a";
        const pantColor = disguised ? "#172633" : "#244978";

        ctx.save();
        ctx.globalAlpha = hiddenAlpha;

        ctx.fillStyle = "rgba(0,0,0,0.26)";
        ctx.beginPath();
        ctx.ellipse(centerX, drawY + this.size + 10, 15, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(centerX, centerY + bob);
        ctx.scale(facing * spriteScale, spriteScale);

        ctx.strokeStyle = "rgba(10,14,18,0.36)";
        ctx.lineWidth = 1.25;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(-5.7, 14);
        ctx.lineTo(-4.7 + legSwing, 24.2);
        ctx.moveTo(5.7, 14);
        ctx.lineTo(4.7 - legSwing, 24.2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-8.2, 0.8);
        ctx.lineTo(-11.1 + armSwing, 10.8);
        ctx.moveTo(8.2, 0.8);
        ctx.lineTo(11.1 - armSwing, 10.8);
        ctx.stroke();

        ctx.fillStyle = "#f0c29a";
        ctx.beginPath();
        ctx.arc(0, -10.9, 7.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = disguised ? "#223748" : "#34281f";
        ctx.beginPath();
        ctx.arc(0, -13.9, 8.1, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-7.7, -13.8, 15.4, 4.8);

        if (disguised) {
            ctx.fillStyle = "#213546";
            ctx.fillRect(-9.8, -18.8, 19.6, 3);
            ctx.fillStyle = "#748ea3";
            ctx.fillRect(-4.1, -20.8, 8.2, 2.2);
        }

        const bodyGradient = ctx.createLinearGradient(0, -4, 0, 13);
        bodyGradient.addColorStop(0, torsoColor);
        bodyGradient.addColorStop(1, torsoShade);
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.roundRect(-8.8, -3, 17.6, 18.2, 5.2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = accentColor;
        ctx.fillRect(-6.6, 0.1, 13.2, 3.8);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(-6, -1.1, 12, 1.5);
        ctx.fillStyle = disguised ? "#9ec5e8" : "#183962";
        ctx.fillRect(-1.1, 3.1, 2.2, 5.2);

        if (disguised) {
            ctx.fillStyle = "#9ec5e8";
            ctx.fillRect(2.5, 4.2, 3.4, 4.4);
            ctx.fillStyle = "rgba(255,255,255,0.18)";
            ctx.fillRect(-8, 7.4, 16, 2.1);
        }

        ctx.fillStyle = pantColor;
        ctx.fillRect(-7, 13, 5.6, 12.2);
        ctx.fillRect(1.4, 13, 5.6, 12.2);
        ctx.fillStyle = "#10161d";
        ctx.fillRect(-7.6, 23, 6.8, 3.6);
        ctx.fillRect(0.8, 23, 6.8, 3.6);

        ctx.fillStyle = "#f1c39c";
        ctx.beginPath();
        ctx.arc(-11.1 + armSwing, 11.5, 2.3, 0, Math.PI * 2);
        ctx.arc(11.1 - armSwing, 11.5, 2.3, 0, Math.PI * 2);
        ctx.fill();

        if (this.isHidden) {
            ctx.strokeStyle = "rgba(110,220,255,0.92)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-15, -21, 30, 50, 10);
            ctx.stroke();
        }

        ctx.restore();

        if (disguised) {
            const timerRatio = this.fakeUniformTimer / (60 * 20);
            const heatRatio = this.disguiseHeat / 100;
            const barWidth = 34;
            const barX = centerX - barWidth / 2;
            const barY = drawY - 18;

            ctx.fillStyle = "rgba(6,10,14,0.84)";
            ctx.fillRect(barX - 2, barY - 12, barWidth + 4, 14);
            ctx.fillStyle = "rgba(125, 194, 255, 0.85)";
            ctx.fillRect(barX, barY - 10, barWidth * timerRatio, 4);
            ctx.fillStyle = "rgba(255, 189, 89, 0.85)";
            ctx.fillRect(barX, barY - 4, barWidth * heatRatio, 4);
        }
    }
}
