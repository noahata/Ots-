require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();
app.use(express.json());

const ADMIN_ID = Number(process.env.ADMIN_ID);
const DB_CHANNEL = process.env.DB_CHANNEL_ID;

const PRICING = { STANDARD: 99, PENALTY: 149 };
const TEACHER_PERCENT = 0.55;

let users = {};
let processedTransactions = new Set();
let adminReplyTarget = null;

// ================= START =================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {
    step: null,
    status: "idle",
    createdAt: Date.now()
  };

  await bot.sendMessage(chatId,
`👋 Welcome to *OTS Teacher Registration System*

Welcome to the professional OTS teaching platform.  

Through this system, you can securely register and activate your teaching profile.  

Please select an option below to begin.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [
      ["📝 Register"],
      ["📊 My Status", "ℹ️ About Platform"]
    ],
    resize_keyboard: true
  }
});
});

// ================= MESSAGE HANDLER =================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = users[chatId];

  // ADMIN REPLY MODE
  if (msg.from.id === ADMIN_ID && adminReplyTarget) {
    await bot.sendMessage(adminReplyTarget,
`📩 *Message from OTS Administration*

${text}`,
{ parse_mode: "Markdown" });

    await bot.sendMessage(ADMIN_ID, "✅ Reply delivered successfully.");
    adminReplyTarget = null;
    return;
  }

  if (!user) return;

  // REGISTER BUTTON
  if (text === "📝 Register") {
    user.step = "name";
    user.status = "collecting";
    user.createdAt = Date.now();

    return bot.sendMessage(chatId,
`📝 *Step 1 of 3 – Personal Information*

Please enter your full legal name as it appears on official documents.

This ensures accurate profile verification.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [["⬅️ Back"]],
    resize_keyboard: true
  }
});
  }

  // NAME STEP
  if (user.step === "name") {
    if (text === "⬅️ Back")
      return bot.sendMessage(chatId, "You are currently at the first step.");

    user.name = text;
    user.step = "phone";

    return bot.sendMessage(chatId,
`📱 *Step 2 of 3 – Phone Verification*

For security, communication, and payment validation, we require your verified phone number.

Please use the secure button below to share your contact.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [
      [{ text: "📲 Share Phone Number", request_contact: true }],
      ["⬅️ Back"]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
});
  }

  // PHONE STEP
  if (user.step === "phone") {
    if (text === "⬅️ Back") {
      user.step = "name";
      return bot.sendMessage(chatId,
"⬅️ Returning to previous step.\n\nPlease re-enter your full name:",
{
  reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true }
});
    }

    if (!msg.contact)
      return bot.sendMessage(chatId,
"⚠ Please use the secure contact sharing button.");

    user.phone = msg.contact.phone_number;
    user.step = "subject";

    return bot.sendMessage(chatId,
`📚 *Step 3 of 3 – Teaching Subject*

Please enter the subject you specialize in teaching.

Example:
• Mathematics
• English
• Physics
• Biology`,
{
  parse_mode: "Markdown",
  reply_markup: {
    keyboard: [["⬅️ Back"]],
    resize_keyboard: true
  }
});
  }

  // SUBJECT STEP
  if (user.step === "subject") {
    if (text === "⬅️ Back") {
      user.step = "phone";
      return bot.sendMessage(chatId,
"⬅️ Returning to phone verification step.",
{
  reply_markup: {
    keyboard: [
      [{ text: "📲 Share Phone Number", request_contact: true }],
      ["⬅️ Back"]
    ],
    resize_keyboard: true
  }
});
    }

    user.subject = text;
    user.step = "payment";

    const fee = getFee(user);

    return bot.sendMessage(chatId,
`💳 *Final Step – Registration Fee*

To activate your teaching profile on OTS, a one-time registration fee is required.

Standard Fee: 99 ETB  
Late Re-application Fee: 149 ETB (if applicable)

Your payable amount: *${fee} ETB*

Click the secure payment button below to proceed via Chapa.`,
{
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "💳 Pay Securely via Chapa", callback_data: "pay_now" }]
    ]
  }
});
  }

  // STATUS BUTTON
  if (text === "📊 My Status") {
    return bot.sendMessage(chatId,
`📄 *Your Current Registration Status*

Status: ${user.status}

If payment is completed, verification will be processed automatically.`,
{ parse_mode: "Markdown" });
  }

  if (text === "ℹ️ About Platform") {
    return bot.sendMessage(chatId,
"OTS connects qualified teachers with students in a secure and professional platform across Ethiopia.",
{ parse_mode: "Markdown" });
  }

});

// ================= PAYMENT INLINE BUTTON =================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const user = users[chatId];

  if (query.data === "pay_now") {
    const fee = getFee(user);
    const tx_ref = `ots_${Date.now()}_${chatId}`;

    try {
      const response = await axios.post(
        "https://api.chapa.co/v1/transaction/initialize",
        {
          amount: fee,
          currency: "ETB",
          email: `${chatId}@ots.com`,
          tx_ref,
          callback_url: `${process.env.BASE_URL}/verify`
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
          }
        }
      );

      user.status = "pending_payment";

      await bot.sendMessage(chatId,
`🔐 *Secure Payment Link Generated*

Please complete your payment using the Chapa checkout link below:

${response.data.data.checkout_url}

Payment verification will be processed automatically.`,
{
  parse_mode: "Markdown",
  reply_markup: { remove_keyboard: true }
});

    } catch (err) {
      await bot.sendMessage(chatId,
"❌ Unable to initialize payment. Please try again later.");
    }
  }

  // ADMIN CALLBACKS
  if (query.from.id === ADMIN_ID) {
    const data = query.data;
    const userId = Number(data.split("_")[1]);

    if (data.startsWith("reply_")) {
      adminReplyTarget = userId;
      await bot.sendMessage(ADMIN_ID, "✍ Please type your reply message:");
    }

    if (data.startsWith("approve_")) {
      users[userId].status = "approved";
      await bot.sendMessage(userId,
"🎉 Congratulations! Your registration has been approved.");
    }

    if (data.startsWith("reject_")) {
      users[userId].status = "reapply_required";
      await bot.sendMessage(userId,
"❌ Your registration was not approved. You may reapply.");
    }
  }

  bot.answerCallbackQuery(query.id);
});

// ================= FEE LOGIC =================

function getFee(user) {
  const hours = (Date.now() - user.createdAt) / (1000 * 60 * 60);

  if (user.status === "reapply_required" || hours > 24) {
    user.penalty = true;
    return PRICING.PENALTY;
  }

  user.penalty = false;
  return PRICING.STANDARD;
}

// ================= CHAPA WEBHOOK =================

app.post("/verify", async (req, res) => {
  try {
    const { tx_ref } = req.body;
    if (!tx_ref || processedTransactions.has(tx_ref))
      return res.sendStatus(200);

    const verify = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` } }
    );

    const data = verify.data.data;
    if (data.status !== "success")
      return res.sendStatus(200);

    const telegramId = Number(tx_ref.split("_")[2]);
    const user = users[telegramId];
    if (!user) return res.sendStatus(200);

    processedTransactions.add(tx_ref);

    user.status = "payment_verified";
    user.paidAmount = data.amount;
    user.commission = data.amount * TEACHER_PERCENT;

    await bot.sendMessage(telegramId,
"✅ Payment verified successfully. Your application is now under review.");

    await bot.sendMessage(DB_CHANNEL,
`📌 *New Paid Registration*

Name: ${user.name}
Phone: ${user.phone}
Subject: ${user.subject}
Paid: ${user.paidAmount} ETB
Commission (55%): ${user.commission} ETB`,
{
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [
        { text: "💬 Reply", callback_data: `reply_${telegramId}` },
        { text: "✅ Approve", callback_data: `approve_${telegramId}` },
        { text: "❌ Reject", callback_data: `reject_${telegramId}` }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
