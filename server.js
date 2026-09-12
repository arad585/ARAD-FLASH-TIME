import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import OpenAI from "openai";
import { MessageLimiter } from "./message-limiter.js";

const app = express();

app.use(express.json());
app.use(express.static(import.meta.dirname));

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

const limiter = new MessageLimiter({
    maxPerWindow: Number(process.env.MESSAGE_LIMIT_PER_WINDOW) || 20,
    windowMs: (Number(process.env.MESSAGE_LIMIT_WINDOW_HOURS) || 6) * 60 * 60 * 1000,
    cooldownMs: (Number(process.env.MESSAGE_LIMIT_COOLDOWN_SECONDS) || 10) * 1000
});

const USER_COOKIE = "arad_user_id";
const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getUserIpId(req) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function getUserId(req, res) {
    const rawCookie = req.headers.cookie;

    if (rawCookie) {
        const match = rawCookie
            .split(";")
            .map(function (part) { return part.trim(); })
            .find(function (part) { return part.startsWith(USER_COOKIE + "="); });

        if (match) {
            return {
                id: "u:" + decodeURIComponent(match.slice(USER_COOKIE.length + 1)),
                anonymous: false
            };
        }
    }

    const userId = "u:" + crypto.randomUUID();

    res.setHeader(
        "Set-Cookie",
        USER_COOKIE + "=" + encodeURIComponent(userId.slice(2)) +
        "; HttpOnly; Path=/; Max-Age=" + USER_COOKIE_MAX_AGE + "; SameSite=Lax"
    );

    return {
        id: userId,
        anonymous: true,
        ipId: "ip:" + getUserIpId(req)
    };
}

setInterval(function () {
    limiter.cleanup();
}, 60 * 60 * 1000).unref();

app.get("/quota", function (req, res) {
    const who = getUserId(req, res);
    res.json(limiter.remaining(who.id));
});

app.post("/chat", async function (req, res) {
    try {
        const who = getUserId(req, res);

        let limit;

        if (who.anonymous) {
            limiter.consume(who.id);
            limit = limiter.consume(who.ipId);
        } else {
            limit = limiter.consume(who.id);
        }

        if (!limit.allowed) {
            if (limit.reason === "cooldown") {
                return res.status(429).json({
                    reply: "لطفاً کمی صبر کنید، سپس دوباره پیام بفرستید.",
                    remaining: limit.remaining,
                    max: limiter.maxPerWindow
                });
            }

            return res.status(429).json({
                reply: "سهمیه پیام شما تمام شده است. پس از 6 ساعت، سهمیه دوباره فعال می‌شود.",
                remaining: 0,
                max: limiter.maxPerWindow
            });
        }

        const response = await client.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages: [
                {
                    role: "system",
                    content: "You are a multilingual AI assistant. Automatically detect the language of the user's message and always reply in that same language (if a message mixes multiple languages, reply in the dominant language unless the user explicitly asks for a specific language; honor explicit requests to switch languages). Support all the languages you can speak — Persian (Farsi), English, Arabic, Turkish, Azerbaijani, Russian, French, German, Spanish, Italian, Portuguese, Chinese, Japanese, Korean and any other — and never force English. Be friendly, clear, and helpful."
                },
                { role: "user", content: req.body.message }
            ]
        });

        res.json({
            reply: response.choices[0].message.content,
            remaining: limit.remaining,
            max: limiter.maxPerWindow
        });

    } catch (error) {
        console.log("ERROR:", error.message);

        res.status(500).json({
            reply: "خطایی در اتصال به هوش مصنوعی رخ داد."
        });
    }
});

app.listen(process.env.PORT || 3000, function () {
    console.log("ARAD FLASH TIME is running!");
});