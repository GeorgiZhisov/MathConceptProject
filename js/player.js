class Player {
    constructor(x, y, size, speed) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.size = size;

        this.baseSpeed = speed;
        this.currentSpeed = speed;

        this.lives = 3;
        this.state = "IN_CELL";
        this.waitingForDay = false;
        this.canMove = false;

        this.isHidden = false;
        this.currentHidingSpot = null;

        this.collisionInset = 8;
        this.doorMargin = 14;
    }

    resetToCell() {
        this.x = this.startX;
        this.y = this.startY;
        this.state = "IN_CELL";
        this.waitingForDay = true;
        this.canMove = false;
        this.isHidden = false;
        this.currentHidingSpot = null;
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
        return (
            px >= rect.x &&
            px <= rect.x + rect.width &&
            py >= rect.y &&
            py <= rect.y + rect.height
        );
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
        return {
            x: rect.x - this.collisionInset,
            y: rect.y - this.collisionInset
        };
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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

        if (currentInside && nextInside) {
            return nextRect;
        }

        if (!currentInside && !nextInside) {
            return nextRect;
        }

        if (currentInside && !nextInside) {
            if (nearDoor) {
                return nextRect;
            }

            return this.keepInsideArea(nextRect, area);
        }

        if (!currentInside && nextInside) {
            if (canEnter && nearDoor) {
                return nextRect;
            }

            return currentRect;
        }

        return nextRect;
    }

    applyWalls(nextRect, walls, blockedDoor) {
        for (const wall of walls) {
            if (rectsOverlap(nextRect, wall)) {
                return true;
            }
        }

        if (blockedDoor && rectsOverlap(nextRect, blockedDoor)) {
            return true;
        }

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

    update(keys, walls, cellDoor, isDay, cellArea, isBeingChased, hidingSpots, cellEntrance) {
        if (this.waitingForDay && isDay) {
            this.waitingForDay = false;
            this.canMove = true;
            this.state = "FREE_ROAM";
        }

        if (!this.canMove) {
            this.updateHiddenState(hidingSpots);
            return;
        }

        this.currentSpeed = isBeingChased ? 2.2 : this.baseSpeed;

        let moveX = 0;
        let moveY = 0;

        if (keys["w"]) moveY -= this.currentSpeed;
        if (keys["s"]) moveY += this.currentSpeed;
        if (keys["a"]) moveX -= this.currentSpeed;
        if (keys["d"]) moveX += this.currentSpeed;

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

                const insideCellNow = this.rectFullyInside(currentRect, cellArea);
                nextRectX = this.applyRoomRule(
                    currentRect,
                    nextRectX,
                    cellArea,
                    cellEntrance,
                    isDay || insideCellNow
                );

                const pos = this.collisionToVisual(nextRectX);
                this.x = pos.x;
                currentRect = this.getCollisionRect();
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

                const insideCellNow = this.rectFullyInside(currentRect, cellArea);
                nextRectY = this.applyRoomRule(
                    currentRect,
                    nextRectY,
                    cellArea,
                    cellEntrance,
                    isDay || insideCellNow
                );

                const pos = this.collisionToVisual(nextRectY);
                this.x = pos.x;
                this.y = pos.y;
            }
        }

        this.updateHiddenState(hidingSpots);
    }

draw(ctx, camera) {
    const visualSize = this.size * 0.65;

    const offset = (this.size - visualSize) / 2;

    ctx.fillStyle = this.isHidden ? "#2d7fb3" : "#4da6ff";

    ctx.fillRect(
        this.x - camera.x + offset,
        this.y - camera.y + offset,
        visualSize,
        visualSize
    );
}

    getRect() {
        return {
            x: this.x,
            y: this.y,
            width: this.size,
            height: this.size
        };
    }
}