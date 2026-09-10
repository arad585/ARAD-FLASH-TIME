import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();

app.use(express.json());
app.use(express.static(import.meta.dirname));

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

app.post("/chat", async function (req, res) {
    try {
        const response = await client.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages: [
                {
                    role: "system",
                    content: "همیشه به زبان فارسی پاسخ بده. پاسخ‌هایت باید دوستانه، واضح و مفید باشد."
                },
                { role: "user", content: req.body.message }
            ]
        });

        res.json({
            reply: response.choices[0].message.content
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
