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

/* ================= SERVER ================= */

app.get("/", (req, res) => res.send("✅ Bot Running"));
app.listen(PORT, () => console.log("🚀 Server running on " + PORT));

/* ================= KEYBOARDS ================= */

function mainMenu(user) {
  return {
    inline_keyboard: [
      [{ text: "📝 Register", callback_data: "register" }],
      [{ text: "📊 Check Status", callback_data: "status" }],
      user?.status === "approved"
        ? [{ text: "💰 Pay Now", callback_data: "pay" }]
        : [],
      [{ text: "🔄 Restart", callback_data: "restart" }]
    ].filter(row => row.length > 0)
  };
}

function backKeyboard() {
  return {
    keyboard: [["⬅️ BACK"]],
    resize_keyboard: true
  };
}

/* ================= START ================= */

bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type !== "private") return;

  const user = users[msg.chat.id];

  await bot.sendMessage(
    msg.chat.id,
    "🌟 *Welcome to the Platform!* 🚀",
    {
      parse_mode: "Markdown",
      reply_markup: mainMenu(user)
    }
  );
});

/* ================= MESSAGE HANDLER ================= */

bot.on("message", async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  /* ===== CHANNEL REPLY FORWARD ===== */
  if (msg.chat.type === "channel" && msg.reply_to_message) {
    const targetUserId =
      channelMessageMap[msg.reply_to_message.message_id];

    if (targetUserId) {
      await bot.sendMessage(
        targetUserId,
        `📩 *Admin Reply:*\n\n${text}`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  if (msg.chat.type !== "private") return;

  if (!users[chatId]) users[chatId] = { step: 0 };
  const user = users[chatId];

  /* ===== BACK BUTTON ===== */
  if (text === "⬅️ BACK") {
    user.step--;
    if (user.step < 1) {
      user.step = 0;
      return bot.sendMessage(chatId, "🔙 Back to menu", {
        reply_markup: mainMenu(user)
      });
    }
  }

  /* ===== REGISTRATION STEPS ===== */

  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    return bot.sendMessage(chatId, "📧 Enter Email:", {
      reply_markup: backKeyboard()
    });
  }

  if (user.step === 2) {
    if (!text.includes("@"))
      return bot.sendMessage(chatId, "❌ Invalid Email");
    user.email = text;
    user.step = 3;
    return bot.sendMessage(chatId, "📱 Enter Phone:", {
      reply_markup: backKeyboard()
    });
  }

  if (user.step === 3) {
    user.phone = text;
    user.step = 4;
    return bot.sendMessage(chatId, "🐦 Enter Username:", {
      reply_markup: backKeyboard()
    });
  }

  if (user.step === 4) {
    user.username = text.replace("@", "");
    user.step = 5;
    return bot.sendMessage(chatId, "👥 Enter Subscribers:", {
      reply_markup: backKeyboard()
    });
  }

  if (user.step === 5) {
    user.subscribers = text;
    user.step = 6;
    return bot.sendMessage(chatId, "🔗 Enter Channel Link:", {
      reply_markup: backKeyboard()
    });
  }

  if (user.step === 6) {
    user.channelLink = text;
    user.status = "pending";
    user.step = 0;

    const sent = await bot.sendMessage(
      CHANNEL_ID,
      `📥 *NEW REQUEST*

👤 ${user.fullName}
📧 ${user.email}
📱 ${user.phone}
🐦 @${user.username}
👥 ${user.subscribers}
🔗 ${user.channelLink}

🆔 ${chatId}

⏳ Pending Approval`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ APPROVE", callback_data: `approve_${chatId}` },
              { text: "❌ REJECT", callback_data: `reject_${chatId}` }
            ],
            [
              { text: "📨 Ask Payment", callback_data: `askpay_${chatId}` },
              { text: "📋 Need Info", callback_data: `needinfo_${chatId}` }
            ],
            [
              { text: "⚠️ Invalid", callback_data: `invalid_${chatId}` }
            ]
          ]
        }
      }
    );

    channelMessageMap[sent.message_id] = chatId;

    return bot.sendMessage(chatId, "⏳ Waiting for admin approval...");
  }
});

/* ================= CALLBACK HANDLER ================= */

bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  /* ===== MAIN MENU ===== */

  if (data === "register") {
    users[chatId] = { step: 1 };
    await bot.sendMessage(chatId, "👤 Enter Full Name:", {
      reply_markup: backKeyboard()
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (data === "status") {
    const user = users[chatId];
    const statusEmoji =
      user?.status === "approved" ? "✅" :
      user?.status === "rejected" ? "❌" : "⏳";

    await bot.sendMessage(
      chatId,
      `📊 Status: ${statusEmoji} ${user?.status || "pending"}`
    );

    return bot.answerCallbackQuery(query.id);
  }

  if (data === "restart") {
    users[chatId] = { step: 0 };
    await bot.sendMessage(chatId, "🔄 Restarted", {
      reply_markup: mainMenu(users[chatId])
    });
    return bot.answerCallbackQuery(query.id);
  }

  if (data === "pay") {
    bot.emit("message", {
      chat: { id: chatId, type: "private" },
      text: "💰 PROCEED TO PAYMENT"
    });
    return bot.answerCallbackQuery(query.id);
  }

  /* ===== CHANNEL BUTTONS ===== */

  const [action, userId] = data.split("_");

  if (!users[userId]) return;

  if (action === "approve") {
    users[userId].status = "approved";
    users[userId].approvedAt = Date.now();
    await bot.sendMessage(userId, "✅ Approved!");
  }

  if (action === "reject") {
    users[userId].status = "rejected";
    await bot.sendMessage(userId, "❌ Rejected.");
  }

  if (action === "askpay") {
    await bot.sendMessage(userId, "💰 Please proceed to payment.");
  }

  if (action === "needinfo") {
    await bot.sendMessage(userId, "📋 Admin needs more information.");
  }

  if (action === "invalid") {
    users[userId].status = "rejected";
    await bot.sendMessage(userId, "⚠️ Invalid details. Register again.");
  }

  bot.answerCallbackQuery(query.id);
});

/* ================= PAYMENT ================= */

bot.on("message", async (msg) => {
  if (msg.text !== "💰 PROCEED TO PAYMENT") return;

  const user = users[msg.chat.id];
  if (!user || user.status !== "approved")
    return bot.sendMessage(msg.chat.id, "❌ Not approved yet.");

  if (user.paymentStatus === "paid")
    return bot.sendMessage(msg.chat.id, "✅ Already paid.");

  const approvedTime = new Date(user.approvedAt || Date.now());
  const hoursPassed = (Date.now() - approvedTime) / (1000 * 60 * 60);
  let amount = hoursPassed >= 24 ? 150 : 100;

  const tx_ref = `tx-${msg.chat.id}-${Date.now()}`;
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
        headers: { Authorization: `Bearer ${CHAPA_SECRET}` }
      }
    );

    await bot.sendMessage(
      msg.chat.id,
      `💰 Amount: ${amount} ETB\n\n${response.data.data.checkout_url}`
    );

  } catch {
    await bot.sendMessage(msg.chat.id, "❌ Payment error.");
  }
});

/* ================= SECURE VERIFY ================= */

app.post("/verify", async (req, res) => {
  try {
    const signature = req.headers["chapa-signature"];
    const payload = JSON.stringify(req.body);

    const hash = crypto
      .createHmac("sha256", CHAPA_SECRET)
      .update(payload)
      .digest("hex");

    if (hash !== signature) return res.sendStatus(401);

    const tx_ref = req.body.tx_ref;
    const userId = Object.keys(users).find(
      id => users[id]?.tx_ref === tx_ref
    );

    if (userId) {
      users[userId].paymentStatus = "paid";
      users[userId].tx_ref = null;

      await bot.sendMessage(userId, "🎉 Payment Confirmed!");
      await bot.sendMessage(
        CHANNEL_ID,
        `💎 New Paid User: ${users[userId].fullName}`
      );
    }

    res.sendStatus(200);
  } catch {
    res.sendStatus(500);
  }
});

console.log("🔥 FULL BOT SYSTEM ACTIVE");
