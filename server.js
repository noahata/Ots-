require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

const ADMIN_ID = Number(process.env.ADMIN_ID);
const DB_CHANNEL = process.env.DB_CHANNEL_ID;

const PRICING = {
  STANDARD: 99,
  PENALTY: 149
};

let users = {};
let processedTransactions = new Set();
let adminReplyTargets = {};


// ================= START COMMAND =================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    step: "name",
    createdAt: Date.now(),
    status: "collecting",
    penalty_applied: false
  };

  await bot.sendMessage(chatId,
`👋 *Welcome to DoctorET Registration Bot*

We are pleased to have you join our teaching platform.

Please enter your full legal name to begin registration.`,
{ parse_mode: "Markdown" });
});


// ================= MAIN MESSAGE HANDLER =================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId];

  // Admin reply system
  if (msg.from.id === ADMIN_ID && adminReplyTargets[ADMIN_ID]) {
    const target = adminReplyTargets[ADMIN_ID];

    await bot.sendMessage(target,
`📩 *Message from Administration*

${msg.text}`,
{ parse_mode: "Markdown" });

    await bot.sendMessage(ADMIN_ID, "✅ Message delivered successfully.");
    delete adminReplyTargets[ADMIN_ID];
    return;
  }

  if (!user) return;

  // ===== NAME STEP =====
  if (user.step === "name") {
    user.name = msg.text;
    user.step = "phone";

    return bot.sendMessage(chatId,
`📱 *Phone Verification Required*

For security purposes, please share your phone number using the button below.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [
      [{ text: "📲 Share Phone Number", request_contact: true }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
});
  }

  // ===== PHONE STEP =====
  if (user.step === "phone") {

    if (!msg.contact) {
      return bot.sendMessage(chatId,
"⚠ Please use the provided button to share your phone number.");
    }

    user.phone = msg.contact.phone_number;
    user.step = "subject";

    return bot.sendMessage(chatId,
`📚 *Subject Information*

Please enter the subject you wish to teach.`,
{
  parse_mode: "Markdown",
  reply_markup: { remove_keyboard: true }
});
  }

  // ===== SUBJECT STEP =====
  if (user.step === "subject") {
    user.subject = msg.text;
    user.step = "payment";

    const fee = getFee(user);

    return bot.sendMessage(chatId,
`💳 *Registration Fee*

Amount to Pay: ${fee} ETB

Click below to proceed securely.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "💰 Pay Now", callback_data: "pay_now" }]
    ]
  }
});
  }
});


// ================= PAYMENT BUTTON =================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const user = users[chatId];
  const data = query.data;

  if (data === "pay_now") {

    const fee = getFee(user);
    const tx_ref = `docoret_${Date.now()}_${chatId}`;

    try {
      const response = await axios.post(
        "https://api.chapa.co/v1/transaction/initialize",
        {
          amount: fee,
          currency: "ETB",
          email: `${chatId}@docoret.com`,
          tx_ref,
          callback_url: `${process.env.BASE_URL}/verify`
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
          }
        }
      );

      const checkout = response.data.data.checkout_url;

      user.status = "pending_payment";

      await bot.sendMessage(chatId,
`🔐 Click below to complete payment securely:

${checkout}`);

    } catch (err) {
      console.log(err.message);
      await bot.sendMessage(chatId, "❌ Payment initialization failed.");
    }
  }

  // ===== ADMIN REPLY BUTTON =====
  if (data.startsWith("reply_") && query.from.id === ADMIN_ID) {
    const targetId = Number(data.split("_")[1]);
    adminReplyTargets[ADMIN_ID] = targetId;

    await bot.sendMessage(ADMIN_ID,
"✍ Please type your reply message now.");
  }

  // ===== APPROVE =====
  if (data.startsWith("approve_") && query.from.id === ADMIN_ID) {
    const userId = Number(data.split("_")[1]);
    users[userId].status = "approved";

    await bot.sendMessage(userId,
"🎉 *Congratulations!*\n\nYour registration has been approved.",
{ parse_mode: "Markdown" });
  }

  // ===== REJECT =====
  if (data.startsWith("reject_") && query.from.id === ADMIN_ID) {
    const userId = Number(data.split("_")[1]);
    users[userId].status = "reapply_required";

    await bot.sendMessage(userId,
"❌ Your application was not approved.\nYou may reapply.");
  }

  bot.answerCallbackQuery(query.id);
});


// ================= FEE LOGIC =================

function getFee(user) {
  const hours = (Date.now() - user.createdAt) / (1000 * 60 * 60);

  if (user.status === "reapply_required") {
    user.penalty_applied = true;
    return PRICING.PENALTY;
  }

  if (hours > 24) {
    user.penalty_applied = true;
    return PRICING.PENALTY;
  }

  user.penalty_applied = false;
  return PRICING.STANDARD;
}


// ================= WEBHOOK =================

app.post("/verify", async (req, res) => {
  try {
    const { tx_ref } = req.body;

    if (!tx_ref || processedTransactions.has(tx_ref))
      return res.sendStatus(200);

    const verify = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
        }
      }
    );

    const data = verify.data.data;

    if (data.status !== "success")
      return res.sendStatus(200);

    const userId = Number(tx_ref.split("_")[2]);
    const user = users[userId];
    if (!user) return res.sendStatus(200);

    if (user.status === "payment_verified" || user.status === "approved")
      return res.sendStatus(200);

    processedTransactions.add(tx_ref);

    user.status = "payment_verified";

    await bot.sendMessage(userId,
"✅ Payment verified successfully.\nYour application is now under review.");

    await bot.sendMessage(DB_CHANNEL,
`📌 *New Paid Registration*

ID: ${userId}
Name: ${user.name}
Phone: ${user.phone}
Subject: ${user.subject}
Penalty: ${user.penalty_applied ? "Yes" : "No"}`,
{
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [
        { text: "💬 Reply", callback_data: `reply_${userId}` },
        { text: "✅ Approve", callback_data: `approve_${userId}` },
        { text: "❌ Reject", callback_data: `reject_${userId}` }
      ]
    ]
  }
});

    res.sendStatus(200);

  } catch (err) {
    console.log(err.message);
    res.sendStatus(500);
  }
});


// ================= SERVER =================

app.listen(3000, () => console.log("Server running on port 3000"));
