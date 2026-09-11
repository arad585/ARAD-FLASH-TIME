export class MessageLimiter {

    constructor(options = {}) {
        this.maxPerWindow = options.maxPerWindow ?? 10;
        this.windowMs = options.windowMs ?? 6 * 60 * 60 * 1000;
        this.cooldownMs = options.cooldownMs ?? 10 * 1000;
        this.now = options.now ?? (() => Date.now());
        this.users = new Map();
    }

    _getEntry(userId) {
        const now = this.now();
        let entry = this.users.get(userId);

        if (!entry) {
            entry = {
                windowStart: now,
                count: 0,
                lastMessageAt: null
            };
            this.users.set(userId, entry);
        }

        if (now - entry.windowStart >= this.windowMs) {
            entry.windowStart = now;
            entry.count = 0;
        }

        return entry;
    }

    check(userId) {
        const now = this.now();
        const entry = this._getEntry(userId);

        if (entry.lastMessageAt !== null && now - entry.lastMessageAt < this.cooldownMs) {
            return {
                allowed: false,
                reason: "cooldown",
                waitSeconds: Math.ceil((entry.lastMessageAt + this.cooldownMs - now) / 1000)
            };
        }

        if (entry.count >= this.maxPerWindow) {
            return {
                allowed: false,
                reason: "quota"
            };
        }

        return { allowed: true };
    }

    consume(userId) {
        const result = this.check(userId);

        if (!result.allowed) {
            if (result.reason === "cooldown") {
                result.remaining = this.maxPerWindow - this.users.get(userId).count;
            }
            return result;
        }

        const entry = this._getEntry(userId);
        entry.count += 1;
        entry.lastMessageAt = this.now();

        return {
            allowed: true,
            remaining: this.maxPerWindow - entry.count,
            windowStart: entry.windowStart
        };
    }

    cleanup() {
        const now = this.now();
        for (const [userId, entry] of this.users) {
            if (now - entry.windowStart >= this.windowMs) {
                this.users.delete(userId);
            }
        }
    }
}