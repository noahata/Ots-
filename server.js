require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const app = express();
app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ADMIN_ID = Number(process.env.ADMIN_ID);
const DB_CHANNEL = process.env.DB_CHANNEL_ID;

const PRICING = {
  STANDARD: 99,
  PENALTY: 149
};

let users = {};
let teacherCounter = 0;
let processedTransactions = new Set();

/* ================= SERVER ================= */

app.get("/", (req, res) => {
  res.send("✅ Teacher Verification Bot Running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server Running...");
});

/* ================= UTIL ================= */

function generateTeacherId() {
  teacherCounter++;
  const year = new Date().getFullYear();
  return `TCH-${year}-${String(teacherCounter).padStart(4, "0")}`;
}

function getFee(user) {
  const now = Date.now();
  const hours = (now - user.createdAt) / (1000 * 60 * 60);

  if (user.status === "reapply_required") {
    user.penalty_applied = true;
    return PRICING.PENALTY;
  }

  if (user.status === "pending_payment" && hours > 24) {
    user.penalty_applied = true;
    return PRICING.PENALTY;
  }

  user.penalty_applied = false;
  return PRICING.STANDARD;
}

async function createPayment(user, amount) {
  const tx_ref = "tx_" + Date.now() + "_" + user.telegram_id;

  const response = await axios.post(
    "https://api.chapa.co/v1/transaction/initialize",
    {
      amount,
      currency: "ETB",
      email: user.email,
      first_name: user.full_name,
      phone_number: user.phone,
      tx_ref,
      callback_url: `${process.env.BASE_URL}/verify`,
      return_url: `https://t.me/`,
      customization: {
        title: "Teacher Registration",
        description: "Instructor Verification Fee"
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
      }
    }
  );

  return response.data.data.checkout_url;
}

/* ================= WEBHOOK ================= */

app.post("/verify", async (req, res) => {
  try {
    const { tx_ref } = req.body;
    if (!tx_ref) return res.sendStatus(400);

    // Duplicate protection
    if (processedTransactions.has(tx_ref)) {
      console.log("⚠ Duplicate tx ignored:", tx_ref);
      return res.sendStatus(200);
    }

    const verify = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
        }
      }
    );

    const data = verify.data.data;

    if (data.status !== "success") {
      return res.sendStatus(200);
    }

    const telegramId = Number(tx_ref.split("_")[2]);
    const user = users[telegramId];
    if (!user) return res.sendStatus(200);

    // Prevent double processing
    if (user.status === "payment_verified" || user.status === "approved") {
      return res.sendStatus(200);
    }

    processedTransactions.add(tx_ref);

    user.status = "payment_verified";
    user.payment_tx = tx_ref;
    user.paid_amount = data.amount;
    user.paid_at = new Date().toISOString();

    await bot.sendMessage(
      telegramId,
      "✅ Payment Verified!\nYour application is now under review."
    );

    await bot.sendMessage(
      DB_CHANNEL,
      `📌 Payment Verified\nUser: ${telegramId}\nAmount: ${data.amount}\nPenalty: ${user.penalty_applied ? "Yes" : "No"}`
    );

    await bot.sendMessage(DB_CHANNEL,
      "Approve or Reject?",
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: `approve_${telegramId}` },
              { text: "❌ Reject", callback_data: `reject_${telegramId}` }
            ]
          ]
        }
      }
    );

    res.sendStatus(200);

  } catch (err) {
    console.log("Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    telegram_id: chatId,
    status: "collecting",
    step: 1,
    createdAt: Date.now()
  };

  bot.sendMessage(chatId,
    "🎓 *Instructor Verification Gateway*\n\nEnter Full Name:",
    { parse_mode: "Markdown" }
  );
});

/* ================= REGISTRATION FLOW ================= */

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId];
  if (!user || !msg.text) return;

  if (user.step === 1) {
    user.full_name = msg.text;
    user.step = 2;
    return bot.sendMessage(chatId, "📧 Enter Email:");
  }

  if (user.step === 2) {
    user.email = msg.text;
    user.step = 3;
    return bot.sendMessage(chatId, "📱 Enter Phone:");
  }

  if (user.step === 3) {
    user.phone = msg.text;
    user.status = "pending_payment";
    user.step = 0;

    const fee = getFee(user);
    const link = await createPayment(user, fee);

    return bot.sendMessage(chatId,
      `💳 Registration Fee: ${fee} ETB`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: `💳 Pay ${fee} ETB`, url: link }]
          ]
        }
      }
    );
  }
});

/* ================= ADMIN ACTION ================= */

bot.on("callback_query", async (q) => {
  if (q.from.id !== ADMIN_ID) return;

  const telegramId = Number(q.data.split("_")[1]);
  const user = users[telegramId];
  if (!user) return;

  if (q.data.startsWith("approve_")) {
    const teacherId = generateTeacherId();
    user.status = "approved";
    user.teacher_id = teacherId;

    await bot.sendMessage(
      telegramId,
      `🎉 Approved!\n\nYour Teacher ID: ${teacherId}\nYou can now use /dashboard`
    );

    bot.editMessageText("✅ Approved", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id
    });
  }

  if (q.data.startsWith("reject_")) {
    user.status = "reapply_required";

    await bot.sendMessage(
      telegramId,
      "❌ Application rejected.\nReapply with 149 ETB."
    );

    bot.editMessageText("❌ Rejected", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id
    });
  }
});

/* ================= DASHBOARD ================= */

bot.onText(/\/dashboard/, (msg) => {
  const user = users[msg.chat.id];

  if (!user || user.status !== "approved") {
    return bot.sendMessage(msg.chat.id, "🚫 Access Restricted.");
  }

  bot.sendMessage(msg.chat.id,
    `📊 Dashboard\n\nID: ${user.teacher_id}\nStatus: Active`
  );
});
