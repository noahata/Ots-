require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

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

// ================= FUNCTIONS =================
function getFee(user) {
  const hours = (Date.now() - user.createdAt) / (1000 * 60 * 60);
  if (user.status === "reapply_required" || hours > 24) {
    user.penalty = true;
    return PRICING.PENALTY;
  }
  user.penalty = false;
  return PRICING.STANDARD;
}

function verifyChapaWebhook(req) {
  const signature = req.headers["x-chapa-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha512", process.env.CHAPA_SECRET_KEY)
    .update(body)
    .digest("hex");
  return signature === hash;
}

// ================= START =================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: null, status: "idle", createdAt: Date.now() };

  await bot.sendMessage(
    chatId,
`👋 Welcome to *OTS Teacher Registration System*

Welcome to the professional OTS teaching platform.  

This bot will guide you step by step to register as a teacher.  

📌 All information you provide will be securely sent to our admin channel for review.  

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
    }
  );
});

// ================= MESSAGE HANDLER =================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = users[chatId];

  // ADMIN REPLY MODE
  if (msg.from.id === ADMIN_ID && adminReplyTarget) {
    await bot.sendMessage(
      adminReplyTarget,
`📩 *Message from OTS Administration*

${text}`,
      { parse_mode: "Markdown" }
    );
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
    return bot.sendMessage(
      chatId,
`📝 *Step 1 of 5 – Full Name*

Please enter your full legal name as it appears on official documents.

📌 Why we need this:  
- To verify your identity  
- To create your official teacher profile`,
      {
        parse_mode: "Markdown",
        reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true }
      }
    );
  }

  // STEP HANDLING
  switch (user.step) {
    case "name":
      if (text === "⬅️ Back")
        return bot.sendMessage(chatId, "You are at the first step.");
      user.name = text;
      user.step = "phone";
      return bot.sendMessage(
        chatId,
`📱 *Step 2 of 5 – Phone Number*

We require your verified phone number for:  
- Secure communication  
- Payment verification  
- Account recovery  

📌 Your number will be kept private and only visible to admins.`,
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
        }
      );

    case "phone":
      if (text === "⬅️ Back") {
        user.step = "name";
        return bot.sendMessage(chatId, "⬅️ Returning to previous step. Enter full name:");
      }
      if (!msg.contact)
        return bot.sendMessage(chatId, "⚠ Please use the secure contact button.");
      user.phone = msg.contact.phone_number;
      user.step = "subject";
      return bot.sendMessage(
        chatId,
`📚 *Step 3 of 5 – Teaching Subject*

Please enter the subject you specialize in teaching.

📌 Why we need this:  
- To match you with students interested in your expertise  
- To display on your profile once approved

Example: Mathematics, English, Physics, Biology`,
        { parse_mode: "Markdown", reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true } }
      );

    case "subject":
      if (text === "⬅️ Back") {
        user.step = "phone";
        return bot.sendMessage(chatId, "⬅️ Returning to phone step.", {
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
      user.step = "youtube";
      return bot.sendMessage(chatId,
`🌐 *Step 4 of 5 – YouTube Channel*

Please enter the full link to your YouTube channel.

📌 Why we need this:  
- To verify your teaching content  
- To feature your channel in the platform  
- To check activity and quality of your educational videos  

Example: https://www.youtube.com/channel/UCxxxxxx`,
        { parse_mode: "Markdown", reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true } }
      );

    case "youtube":
      if (text === "⬅️ Back") {
        user.step = "subject";
        return bot.sendMessage(chatId, "⬅️ Returning to subject step. Enter your subject:");
      }
      if (!text.includes("youtube.com")) return bot.sendMessage(chatId, "⚠ Please provide a valid YouTube channel link.");
      user.youtube = text;
      user.step = "email";
      return bot.sendMessage(chatId,
`✉️ *Step 5 – Email (Optional)*

Please enter your email address.  

📌 Why optional:  
- Enables better communication  
- Helps with payment receipts and notifications  

If you do not have an email, type "Skip".`,
        { parse_mode: "Markdown", reply_markup: { keyboard: [["⬅️ Back"]], resize_keyboard: true } }
      );

    case "email":
      if (text === "⬅️ Back") {
        user.step = "youtube";
        return bot.sendMessage(chatId, "⬅️ Returning to YouTube step. Enter your YouTube channel link:");
      }
      user.email = text.includes("@") ? text : "Not provided";
      user.step = "completed";
      user.status = "pending_review";

      // Get Telegram channel info
      let channelName = "Unknown";
      let channelLink = "No link available";
      let subscribers = "Unknown";
      try {
        const info = await bot.getChat(DB_CHANNEL);
        channelName = info.title;
        channelLink = info.invite_link || "No link available";
        subscribers = info.members_count || "Unknown";
      } catch (err) {}

      // Send registration info to admin channel
      await bot.sendMessage(DB_CHANNEL,
`📌 *New Teacher Registration Pending Review*

👤 Name: ${user.name}
📱 Phone: ${user.phone}
📚 Subject: ${user.subject}
🌐 YouTube Channel: ${user.youtube}
📧 Email: ${user.email}
🕒 Registered At: ${new Date().toLocaleString()}

🏷 Telegram Channel Info:
• Name: ${channelName}
• Link: ${channelLink}
• Subscribers: ${subscribers}

✅ Payment: Pending
Status: Pending Review

📌 Transparency: All user information collected is visible to admin for verification purposes.`,
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

      return bot.sendMessage(chatId,
`✅ Your registration has been submitted and is now under admin review.  

📌 Next Steps:
1. Admin reviews your registration.
2. If approved, you will receive a secure payment link.
3. After payment verification, your profile becomes active and visible to students.

💳 Fee: ${PRICING.STANDARD} ETB (standard)  
Late re-application fee: ${PRICING.PENALTY} ETB (if applicable)

💰 Commission: You will earn 55% of app profits after profile activation.`
      );
  }

  // STATUS BUTTON
  if (text === "📊 My Status") {
    return bot.sendMessage(chatId,
`📄 *Your Current Registration Status*

Status: ${user.status || "Idle"}

📌 Notes:
- "pending_review" → waiting for admin approval
- "approved_pending_payment" → payment required
- "payment_verified" → active profile
- "reapply_required" → not approved, may reapply`,
      { parse_mode: "Markdown" });
  }

  // ABOUT PLATFORM
  if (text === "ℹ️ About Platform") {
    return bot.sendMessage(chatId,
`OTS connects qualified teachers with students in a secure and professional platform across Ethiopia.

📌 Features:
- Verified teacher profiles
- Secure registration and payments
- 55% commission for teachers
- Admin monitored system for quality control`,
      { parse_mode: "Markdown" });
  }
});

// ================= CALLBACK HANDLER =================
bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (query.from.id === ADMIN_ID) {
    const userId = Number(data.split("_")[1]);
    const user = users[userId];
    if (!user) return;

    if (data.startsWith("reply_")) {
      adminReplyTarget = userId;
      return bot.sendMessage(ADMIN_ID, "✍ Please type your reply message:");
    }

    if (data.startsWith("approve_")) {
      user.status = "approved_pending_payment";

      await bot.sendMessage(userId,
`🎉 Congratulations! Your registration has been approved.  

📌 Next: Secure payment to activate your profile.

Fee: ${getFee(user)} ETB
Commission: 55% of app profit post-activation`
      );

      // Trigger Chapa payment after approval
      const fee = getFee(user);
      const tx_ref = `ots_${Date.now()}_${userId}`;
      try {
        const response = await axios.post(
          "https://api.chapa.co/v1/transaction/initialize",
          {
            amount: fee,
            currency: "ETB",
            email: `${userId}@ots.com`,
            tx_ref,
            callback_url: `${process.env.BASE_URL}/verify`
          },
          { headers: { Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}` } }
        );

        await bot.sendMessage(userId,
`💳 *Secure Payment Link Generated*

Please complete your payment using the Chapa checkout link below:

${response.data.data.checkout_url}

📌 After payment verification, your profile becomes active.`
        );
      } catch (err) {
        await bot.sendMessage(userId, "❌ Unable to generate payment link. Try again later.");
      }
    }

    if (data.startsWith("reject_")) {
      user.status = "reapply_required";
      await bot.sendMessage(userId,
"❌ Your registration was not approved. You may reapply. All submitted information remains secure.");
    }
  }

  bot.answerCallbackQuery(query.id);
});

// ================= CHAPA WEBHOOK =================
app.post("/verify", async (req, res) => {
  try {
    if (!verifyChapaWebhook(req)) return res.sendStatus(401);

    const { tx_ref } = req.body;
    if (!tx_ref || processedTransactions.has(tx_ref)) return res.sendStatus(200);

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
"✅ Payment verified successfully. Your teacher profile is now active and visible to students.");

    await bot.sendMessage(DB_CHANNEL,
`📌 *Payment Completed*

Name: ${user.name}
Paid: ${user.paidAmount} ETB
Commission (55%): ${user.commission} ETB`,
      { parse_mode: "Markdown" }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err.message);
    res.sendStatus(500);
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
