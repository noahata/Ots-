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

This is your professional platform to register as a verified teacher.  

Please choose an option below to begin:`,
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
`📩 *Message from OTS Administration*\n\n${text}`,
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
`📝 *Step 1 – Full Name*

Please enter your full legal name.`,
{
      parse_mode: "Markdown",
      reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true }
    });
  }

  // BACK BUTTON HANDLER
  if (text === "⬅️ Back") {
    if (user.step === "phone") user.step = "name";
    else if (user.step === "youtube") user.step = "phone";
    else if (user.step === "email") user.step = "youtube";
    else if (!user.step) return; // first step
    return bot.sendMessage(chatId, "⬅️ Returned to previous step.", {
      keyboard: [["⬅️ Back"]],
      resize_keyboard: true
    });
  }

  // NAME STEP
  if (user.step === "name") {
    user.name = text;
    user.step = "phone";
    return bot.sendMessage(chatId,
`📱 *Step 2 – Phone Number*

Please share your phone number using the secure button below:`,
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
    if (!msg.contact || msg.contact.user_id !== chatId)
      return bot.sendMessage(chatId, "⚠ Please use the secure contact button.");

    user.phone = msg.contact.phone_number;
    user.step = "youtube";

    return bot.sendMessage(chatId,
`🌐 *Step 3 – YouTube Channel (Required)*

Please enter your YouTube channel link. This step is mandatory for registration.`,
{
      parse_mode: "Markdown",
      reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true }
    });
  }

  // YOUTUBE STEP – REQUIRED
  if (user.step === "youtube") {
    if (!text || text.toLowerCase() === "skip") {
      return bot.sendMessage(chatId,
"⚠ You must provide your YouTube channel link. This is required.\n\nPlease enter a valid YouTube channel URL:",
{ parse_mode: "Markdown", reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true } });
    }

    user.youtube = text;
    user.step = "email";

    return bot.sendMessage(chatId,
`📧 *Step 4 – Email Address*

Enter your email, or type 'Skip' to continue without email.`,
{
      parse_mode: "Markdown",
      reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true }
    });
  }

  // EMAIL STEP
  if (user.step === "email") {
    if (text.toLowerCase() === "skip") user.email = "Not provided";
    else if (text.includes("@") && text.includes(".")) user.email = text;
    else return bot.sendMessage(chatId, "⚠ Enter a valid email or type 'Skip'.");

    user.step = "completed";
    user.status = "pending_review";

    // Send info to DB channel
    (async () => {
      let channelName = "Unknown";
      let channelLink = "No link";
      let subscribers = "Unknown";
      try {
        const info = await bot.getChat(DB_CHANNEL);
        channelName = info.title;
        channelLink = info.invite_link || "No link";
        subscribers = info.members_count || "Unknown";
      } catch (err) {}

      await bot.sendMessage(DB_CHANNEL,
`📌 *New Teacher Registration Pending Review*

👤 Name: ${user.name}
📱 Phone: ${user.phone}
📚 Subject: ${user.subject || "Not provided"}
🌐 YouTube: ${user.youtube}
📧 Email: ${user.email}
🕒 Registered At: ${new Date().toLocaleString()}

🏷 Telegram Channel Info:
• Name: ${channelName}
• Link: ${channelLink}
• Subscribers: ${subscribers}

✅ Payment: Pending
Status: Pending Review`,
{
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💬 Reply", callback_data: `reply_${chatId}` },
              { text: "✅ Approve", callback_data: `approve_${chatId}` },
              { text: "❌ Reject", callback_data: `reject_${chatId}` }
            ]
          ]
        }
      });

      await bot.sendMessage(chatId,
`✅ Your registration has been submitted and is now under admin review.

📌 Next Steps:
1. Admin reviews your registration.
2. If approved, you will receive a secure payment link.
3. Payment amount may include a *penalty* if late.

💰 Commission: You earn 55% of app profits after profile activation.`
      );
    })();
  }

  // STATUS BUTTON
  if (text === "📊 My Status") {
    return bot.sendMessage(chatId,
`📄 *Your Current Registration Status*

Status: ${user.status}`,
{ parse_mode: "Markdown" });
  }

  if (text === "ℹ️ About Platform") {
    return bot.sendMessage(chatId,
`OTS connects qualified teachers with students securely across Ethiopia.`,
{ parse_mode: "Markdown" });
  }
});

// ================= ADMIN CALLBACKS =================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  if (query.from.id === ADMIN_ID) {
    const data = query.data;
    const targetId = Number(data.split("_")[1]);
    const targetUser = users[targetId];
    if (!targetUser) return;

    if (data.startsWith("reply_")) {
      adminReplyTarget = targetId;
      return bot.sendMessage(ADMIN_ID, "✍ Please type your reply message:");
    }

    if (data.startsWith("approve_")) {
      // Calculate fee with penalty
      const fee = getFee(targetUser);
      targetUser.status = "approved";
      await bot.sendMessage(targetId,
`🎉 Congratulations! Your registration is approved.

💳 Pay your registration fee: *${fee} ETB*

Click the button below to pay securely via Chapa.`,
{
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Pay Securely", callback_data: "pay_now" }]
          ]
        }
      });
    }

    if (data.startsWith("reject_")) {
      targetUser.status = "reapply_required";
      return bot.sendMessage(targetId,
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
    if (data.status !== "success") return res.sendStatus(200);

    const telegramId = Number(tx_ref.split("_")[2]);
    const user = users[telegramId];
    if (!user) return res.sendStatus(200);

    processedTransactions.add(tx_ref);

    user.status = "payment_verified";
    user.paidAmount = data.amount;
    user.commission = data.amount * TEACHER_PERCENT;

    await bot.sendMessage(telegramId,
`✅ Payment verified successfully. Your profile is now active!

💰 Commission (55%): ${user.commission} ETB`);
    res.sendStatus(200);
  } catch (err) {
    console.log(err.message);
    res.sendStatus(500);
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
