require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const users = {};
const channelMessageMap = {};

app.get("/", (req, res) => res.send("Bot Running"));
app.listen(PORT, () => console.log("Server running on port " + PORT));

/* ================= START ================= */

bot.onText(/\/start/, (msg) => {
  if (msg.chat.type !== "private") return;

  bot.sendMessage(
    msg.chat.id,
    "🌟 Welcome!\nClick below to start registration.",
    {
      reply_markup: {
        keyboard: [["📝 START REGISTRATION"]],
        resize_keyboard: true
      }
    }
  );
});

/* ================= MAIN MESSAGE HANDLER ================= */

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  /* ===== CHANNEL REPLY SYSTEM ===== */
  if (msg.chat.type === "channel" && msg.reply_to_message) {
    const originalMsgId = msg.reply_to_message.message_id;
    const targetUserId = channelMessageMap[originalMsgId];

    if (targetUserId) {
      await bot.sendMessage(
        targetUserId,
        `✉️ Admin Message:\n\n${text}`
      );
    }
    return;
  }

  if (msg.chat.type !== "private") return;

  if (!users[chatId]) users[chatId] = { step: 0 };
  const user = users[chatId];

  /* ===== REGISTRATION STEPS ===== */

  if (text === "📝 START REGISTRATION") {
    user.step = 1;
    return bot.sendMessage(chatId, "Enter Full Name:");
  }

  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    return bot.sendMessage(chatId, "Enter Email:");
  }

  if (user.step === 2) {
    if (!text.includes("@")) return bot.sendMessage(chatId, "Invalid Email");
    user.email = text;
    user.step = 3;
    return bot.sendMessage(chatId, "Enter Phone:");
  }

  if (user.step === 3) {
    user.phone = text;
    user.step = 4;
    return bot.sendMessage(chatId, "Enter Telegram Username:");
  }

  if (user.step === 4) {
    user.username = text.replace("@", "");
    user.step = 5;
    return bot.sendMessage(chatId, "Enter Subscribers Count:");
  }

  if (user.step === 5) {
    user.subscribers = text;
    user.step = 6;
    return bot.sendMessage(chatId, "Enter Channel Link:");
  }

  if (user.step === 6) {
    user.channelLink = text;
    user.status = "pending";
    user.step = 0;

    const sent = await bot.sendMessage(
      CHANNEL_ID,
      `📥 NEW REQUEST

👤 ${user.fullName}
📧 ${user.email}
📱 ${user.phone}
🐦 @${user.username}
👥 ${user.subscribers}
🔗 ${user.channelLink}

ID: ${chatId}

⏳ PENDING`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
            { text: "❌ REJECT", callback_data: `reject_${chatId}` }
          ]]
        }
      }
    );

    channelMessageMap[sent.message_id] = chatId;

    return bot.sendMessage(chatId, "⏳ Waiting for admin approval...");
  }

  /* ===== STATUS ===== */

  if (text === "📊 CHECK STATUS") {
    return bot.sendMessage(chatId, `Status: ${user.status || "pending"}`);
  }

  /* ===== PAYMENT ===== */

  if (text === "💰 PROCEED TO PAYMENT") {

    if (user.status !== "approved")
      return bot.sendMessage(chatId, "Wait for approval.");

    if (user.paymentStatus === "paid")
      return bot.sendMessage(chatId, "✅ Already paid.");

    if (user.tx_ref && user.paymentStatus !== "paid")
      return bot.sendMessage(chatId, "⚠️ Payment already generated.");

    const approvedTime = new Date(user.approvedAt || Date.now());
    const now = new Date();
    const hoursPassed = (now - approvedTime) / (1000 * 60 * 60);

    let amount = 100;
    if (hoursPassed >= 24) amount = 150;

    const tx_ref = `tx-${chatId}-${Date.now()}`;
    user.tx_ref = tx_ref;
    user.paymentStatus = "pending";

    try {
      const response = await axios.post(
        "https://api.chapa.co/v1/transaction/initialize",
        {
          amount: amount.toString(),
          currency: "ETB",
          email: user.email,
          first_name: user.fullName,
          tx_ref,
          callback_url: `https://${process.env.RENDER_EXTERNAL_URL}/verify`
        },
        {
          headers: {
            Authorization: `Bearer ${CHAPA_SECRET}`
          }
        }
      );

      return bot.sendMessage(
        chatId,
        `💰 Amount: ${amount} ETB\n\nPay here:\n${response.data.data.checkout_url}`
      );

    } catch (err) {
      return bot.sendMessage(chatId, "Payment error.");
    }
  }
});

/* ================= ADMIN APPROVAL ================= */

bot.on("callback_query", async (query) => {
  const [action, userId] = query.data.split("_");

  if (!users[userId]) return;

  if (action === "approve") {
    users[userId].status = "approved";
    users[userId].approvedAt = Date.now();
    await bot.sendMessage(userId, "✅ Approved! You can now pay.");
  } else {
    users[userId].status = "rejected";
    await bot.sendMessage(userId, "❌ Rejected.");
  }

  await bot.editMessageReplyMarkup(
    { inline_keyboard: [] },
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    }
  );

  bot.answerCallbackQuery(query.id);
});

/* ================= SECURE PAYMENT VERIFY ================= */

app.post("/verify", async (req, res) => {
  try {
    const signature = req.headers["chapa-signature"];
    const payload = JSON.stringify(req.body);

    const hash = crypto
      .createHmac("sha256", CHAPA_SECRET)
      .update(payload)
      .digest("hex");

    if (hash !== signature) {
      console.log("Invalid signature");
      return res.sendStatus(401);
    }

    const tx_ref = req.body.tx_ref;
    const userId = Object.keys(users).find(
      id => users[id]?.tx_ref === tx_ref
    );

    if (userId) {
      users[userId].paymentStatus = "paid";
      users[userId].paidAt = Date.now();
      users[userId].tx_ref = null;

      await bot.sendMessage(userId, "🎉 Payment Confirmed!");
      await bot.sendMessage(
        CHANNEL_ID,
        `💎 New Paid User:\n${users[userId].fullName}`
      );
    }

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

console.log("✅ Bot Started Successfully");
