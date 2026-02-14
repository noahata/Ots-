// Load environment variables
require('dotenv').config();

// Import required packages
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Initialize Express app
const app = express();
app.use(express.json());

// Get port from environment
const PORT = process.env.PORT || 3000;

// Get bot token from environment
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY;

// Initialize Telegram Bot with polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store user data in memory
const users = {};

// Store channel message IDs to user IDs mapping
const channelMessageMap = {};

// Simple health check for Render
app.get('/', (req, res) => {
  res.send('✅ Bot is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ==================== WELCOME MESSAGE ====================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = 
`🌟 *WELCOME TO OUR PREMIUM PLATFORM* 🌟
we build website and telegram bot 
━━━━━━━━━━━━━━━━━━━

🔐 *Why Join Us?*
✓ 100% Secure & Verified ✅
✓ Trusted by 10,000+ Creators 👥
✓ 24/7 Premium Support 🎯
✓ Instant Payment Processing 💰

━━━━━━━━━━━━━━━━━━━

Click the button below to begin your registration!`;

  bot.sendMessage(
    chatId,
    welcomeMessage,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['📝 START REGISTRATION']],
        resize_keyboard: true
      }
    }
  );
});

// ==================== REGISTRATION FLOW ====================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if not a private chat
  if (msg.chat.type !== 'private') return;
  
  // Initialize user if not exists
  if (!users[chatId]) {
    users[chatId] = { step: 0 };
  }
  
  const user = users[chatId];
  
  // ========== STEP 1: START REGISTRATION ==========
  if (text === '📝 START REGISTRATION') {
    user.step = 1;
    
    const message = 
`📋 *REGISTRATION STEP 1/6*

━━━━━━━━━━━━━━━━━━━

👤 Please enter your *Full Name*

📝 *Example:* John Smith

━━━━━━━━━━━━━━━━━━━
🔒 Your information is encrypted and secure`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 2: FULL NAME ==========
  if (user.step === 1) {
    user.fullName = text;
    user.step = 2;
    
    const message = 
`📋 *REGISTRATION STEP 2/6*

━━━━━━━━━━━━━━━━━━━

📧 Please enter your *Email Address*

📝 *Example:* name@company.com

━━━━━━━━━━━━━━━━━━━
🔒 We'll never share your email with third parties`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 3: EMAIL ==========
  if (user.step === 2) {
    // Simple email validation
    if (!text.includes('@') || !text.includes('.')) {
      return bot.sendMessage(chatId, '❌ Please enter a valid email address (e.g., name@domain.com)');
    }
    
    user.email = text;
    user.step = 3;
    
    const message = 
`📋 *REGISTRATION STEP 3/6*

━━━━━━━━━━━━━━━━━━━

📱 Please enter your *Phone Number*

📝 *Example:* +251912345678

━━━━━━━━━━━━━━━━━━━
📞 For account verification and security`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 4: PHONE ==========
  if (user.step === 3) {
    user.phone = text;
    user.step = 4;
    
    const message = 
`📋 *REGISTRATION STEP 4/6*

━━━━━━━━━━━━━━━━━━━

🐦 Please enter your *Telegram Username*

📝 *Example:* @john_doe

━━━━━━━━━━━━━━━━━━━
💬 So our team can easily contact you`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 5: USERNAME ==========
  if (user.step === 4) {
    user.username = text.replace('@', '');
    user.step = 5;
    
    const message = 
`📋 *REGISTRATION STEP 5/6*

━━━━━━━━━━━━━━━━━━━

👥 How many *subscribers/followers* do you have?

📝 *Example:* 15000

━━━━━━━━━━━━━━━━━━━
📊 This helps us understand your audience`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 6: SUBSCRIBERS ==========
  if (user.step === 5) {
    user.subscribers = text;
    user.step = 6;
    
    const message = 
`📋 *REGISTRATION STEP 6/6*

━━━━━━━━━━━━━━━━━━━

🔗 Please enter your *Channel/Page Link*

📝 *Example:* https://t.me/yourchannel

━━━━━━━━━━━━━━━━━━━
🌐 For content verification purposes`;
    
    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
  
  // ========== STEP 7: CHANNEL LINK (COMPLETE) ==========
  if (user.step === 6) {
    user.channelLink = text;
    user.step = 0;
    user.status = 'pending';
    user.registeredAt = new Date().toISOString();
    
    // Confirmation message to user
    const confirmationMessage = 
`✅ *REGISTRATION SUBMITTED SUCCESSFULLY!*

━━━━━━━━━━━━━━━━━━━

📋 *Your Information:*
├ 👤 Name: ${user.fullName}
├ 📧 Email: ${user.email}
├ 📱 Phone: ${user.phone}
├ 🐦 Username: @${user.username}
├ 👥 Subscribers: ${user.subscribers}
└ 🔗 Channel: ${user.channelLink}

━━━━━━━━━━━━━━━━━━━

⏳ *What happens next:*
1️⃣ Admin review (usually within 24 hours)
2️⃣ You'll receive approval notification
3️⃣ Complete secure payment
4️⃣ Instant access to all features!

━━━━━━━━━━━━━━━━━━━
🔒 *Your data is protected with bank-level security*`;
    
    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: 'Markdown' });
    
    // Send to channel for approval
    const channelMessage = 
`📥 *NEW REGISTRATION REQUEST* 📥

━━━━━━━━━━━━━━━━━━━

👤 *Personal Details:*
├ Name: ${user.fullName}
├ Email: ${user.email}
├ Phone: ${user.phone}
└ Username: @${user.username}

📊 *Channel Details:*
├ Subscribers: ${user.subscribers}
└ Link: ${user.channelLink}

🆔 *User ID:* \`${chatId}\`

━━━━━━━━━━━━━━━━━━━
⏳ *Status: PENDING APPROVAL*
━━━━━━━━━━━━━━━━━━━

💡 *Reply to this message to contact the user directly*`;

    // Send to channel with buttons and STORE the message ID
    const sentMessage = await bot.sendMessage(CHANNEL_ID, channelMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ APPROVE', callback_data: `approve_${chatId}` },
            { text: '❌ REJECT', callback_data: `reject_${chatId}` }
          ]
        ]
      }
    });
    
    // STORE the mapping between channel message ID and user ID
    channelMessageMap[sentMessage.message_id] = chatId;
    console.log(`📝 Stored mapping: Channel msg ${sentMessage.message_id} -> User ${chatId}`);
    
    return bot.sendMessage(
      chatId,
      '📊 Use the button below to check your status:',
      {
        reply_markup: {
          keyboard: [['📊 CHECK STATUS']],
          resize_keyboard: true
        }
      }
    );
  }
  
  // ========== CHECK STATUS ==========
  if (text === '📊 CHECK STATUS') {
    const status = user.status || 'pending';
    let statusEmoji = '⏳';
    let statusText = 'Pending Review';
    
    if (status === 'approved') {
      statusEmoji = '✅';
      statusText = 'APPROVED';
    } else if (status === 'rejected') {
      statusEmoji = '❌';
      statusText = 'REJECTED';
    }
    
    const statusMessage = 
`📊 *APPLICATION STATUS* 📊

━━━━━━━━━━━━━━━━━━━

${statusEmoji} *Status:* ${statusText}

👤 *Name:* ${user.fullName}
📧 *Email:* ${user.email}
📱 *Phone:* ${user.phone}
🐦 *Username:* @${user.username}
👥 *Subscribers:* ${user.subscribers}
🔗 *Channel:* ${user.channelLink}

━━━━━━━━━━━━━━━━━━━`;

    let keyboard = { keyboard: [['📝 START REGISTRATION']], resize_keyboard: true };
    
    if (status === 'approved') {
      keyboard = { keyboard: [['💰 PROCEED TO PAYMENT'], ['📊 CHECK STATUS']], resize_keyboard: true };
    }
    
    return bot.sendMessage(chatId, statusMessage, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  }
});

// ==================== FIXED CHANNEL REPLY HANDLER ====================

// Listen for ALL messages and check if they are replies in the channel
bot.on('message', async (msg) => {
  try {
    // Check if this message is in the channel and is a reply
    if (msg.chat && 
        msg.chat.id && 
        msg.chat.id.toString() === CHANNEL_ID.toString() && 
        msg.reply_to_message) {
      
      console.log('📨 Channel reply detected!');
      console.log('Reply to message ID:', msg.reply_to_message.message_id);
      console.log('Reply text:', msg.text);
      
      // Get the original message ID that was replied to
      const originalMessageId = msg.reply_to_message.message_id;
      
      // Find which user this channel message belongs to
      const targetUserId = channelMessageMap[originalMessageId];
      
      console.log('Looking for user with message ID:', originalMessageId);
      console.log('Found user ID:', targetUserId);
      console.log('Current mapping:', channelMessageMap);
      
      if (targetUserId && users[targetUserId]) {
        const user = users[targetUserId];
        
        // Format the admin reply message
        const adminName = msg.from.first_name || 'Admin';
        const replyText = msg.text || msg.caption || '';
        
        const forwardMessage = 
`✉️ *Message from Administration* ✉️

━━━━━━━━━━━━━━━━━━━

${replyText}

━━━━━━━━━━━━━━━━━━━
👤 *Admin:* ${adminName}
🕒 *Time:* ${new Date().toLocaleTimeString()}

_This is an official message from our support team._`;

        // Send the message to the user
        await bot.sendMessage(targetUserId, forwardMessage, { parse_mode: 'Markdown' });
        
        console.log(`✅ Reply forwarded to user ${targetUserId}`);
        
        // Confirm to admin that message was sent
        await bot.sendMessage(
          CHANNEL_ID,
          `✅ *Reply Sent Successfully!*\n\n👤 To: ${user.fullName}\n🆔 User ID: \`${targetUserId}\``,
          { 
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id 
          }
        );
        
      } else {
        console.log('❌ User not found for message ID:', originalMessageId);
        
        // Try to extract user ID from the original message text as fallback
        const originalText = msg.reply_to_message.text || '';
        const userIdMatch = originalText.match(/User ID:\s*`?(\d+)`?/);
        
        if (userIdMatch) {
          const fallbackUserId = userIdMatch[1];
          console.log('Fallback: Found user ID in text:', fallbackUserId);
          
          if (users[fallbackUserId]) {
            const user = users[fallbackUserId];
            
            const forwardMessage = 
`✉️ *Message from Administration* ✉️

━━━━━━━━━━━━━━━━━━━

${msg.text || ''}

━━━━━━━━━━━━━━━━━━━
👤 *Admin:* ${msg.from.first_name || 'Admin'}

_This is an official message from our support team._`;

            await bot.sendMessage(fallbackUserId, forwardMessage, { parse_mode: 'Markdown' });
            
            await bot.sendMessage(
              CHANNEL_ID,
              `✅ *Reply Sent Successfully!*\n\n👤 To: ${user.fullName}`,
              { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
            );
          } else {
            await bot.sendMessage(
              CHANNEL_ID,
              `❌ *User Not Found*\n\nUser ID \`${fallbackUserId}\` is not in the database.`,
              { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
            );
          }
        } else {
          await bot.sendMessage(
            CHANNEL_ID,
            `❌ *Cannot Process Reply*\n\nCould not find the user associated with this message.`,
            { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
          );
        }
      }
    }
  } catch (error) {
    console.error('Error in channel reply handler:', error);
  }
});

// ==================== ADMIN APPROVAL ====================

bot.on('callback_query', async (query) => {
  const data = query.data;
  const message = query.message;
  const [action, userId] = data.split('_');
  const adminName = query.from.first_name || 'Admin';
  
  if (action === 'approve' || action === 'reject') {
    
    // Update user status
    if (users[userId]) {
      users[userId].status = action === 'approve' ? 'approved' : 'rejected';
      users[userId].approvedBy = adminName;
      users[userId].approvedAt = new Date().toISOString();
    }
    
    // Update channel message
    const newStatus = action === 'approve' ? '✅ APPROVED' : '❌ REJECTED';
    const newText = message.text.replace(/⏳.*PENDING APPROVAL/, `${newStatus} by ${adminName}`);
    
    await bot.editMessageText(newText, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }
    });
    
    // Notify user
    if (action === 'approve') {
      const approvalMessage = 
`✅ *CONGRATULATIONS! YOUR REGISTRATION IS APPROVED!* ✅

━━━━━━━━━━━━━━━━━━━

Dear ${users[userId].fullName},

We're pleased to inform you that your application has been *APPROVED*!

━━━━━━━━━━━━━━━━━━━

💰 *Payment Details:*
├ Standard Fee: 100 ETB (within 24h)
├ Late Fee: 150 ETB (after 24h)
└ Secure Payment: 🔒 Chapa Gateway

━━━━━━━━━━━━━━━━━━━

Click the button below to complete your payment and activate your account.`;

      await bot.sendMessage(
        userId,
        approvalMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['💰 PROCEED TO PAYMENT'], ['📊 CHECK STATUS']],
            resize_keyboard: true
          }
        }
      );
      
      // Notify channel
      await bot.sendMessage(
        CHANNEL_ID,
        `✅ *User Approved*\n\n👤 ${users[userId].fullName}\n🆔 \`${userId}\`\n✅ By: ${adminName}`,
        { parse_mode: 'Markdown' }
      );
      
    } else {
      const rejectionMessage = 
`❌ *REGISTRATION UPDATE* ❌

━━━━━━━━━━━━━━━━━━━

Dear ${users[userId].fullName},

We regret to inform you that your registration has been *REJECTED*.

━━━━━━━━━━━━━━━━━━━

📋 *Possible Reasons:*
• Information could not be verified
• Channel doesn't meet guidelines
• Duplicate application

━━━━━━━━━━━━━━━━━━━

Please contact support for assistance.`;

      await bot.sendMessage(
        userId,
        rejectionMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['📝 START REGISTRATION']],
            resize_keyboard: true
          }
        }
      );
    }
    
    // Answer callback
    bot.answerCallbackQuery(query.id, { text: `User ${action}d!` });
  }
});

// ==================== PAYMENT ====================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!users[chatId]) return;
  
  const user = users[chatId];
  
  if (text === '💰 PROCEED TO PAYMENT') {
    
    if (user.status !== 'approved') {
      return bot.sendMessage(chatId, '❌ Please wait for admin approval first.');
    }
    
    const tx_ref = `tx-${chatId}-${Date.now()}`;
    
    try {
      const response = await axios.post(
        'https://api.chapa.co/v1/transaction/initialize',
        {
          amount: '100',
          currency: 'ETB',
          email: user.email,
          first_name: user.fullName,
          tx_ref: tx_ref,
          callback_url: `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}/verify`,
          return_url: `https://${process.env.RENDER_EXTERNAL_URL || 'localhost'}/`
        },
        {
          headers: {
            Authorization: `Bearer ${CHAPA_SECRET}`
          }
        }
      );
      
      user.tx_ref = tx_ref;
      
      const paymentMessage = 
`💰 *SECURE PAYMENT* 💰

━━━━━━━━━━━━━━━━━━━

💳 *Amount:* 100 ETB
🔒 *Gateway:* Chapa Secure Payments
🛡️ *Protected by:* SSL Encryption

━━━━━━━━━━━━━━━━━━━

Click the secure link below to complete your payment:

[🔐 CLICK TO PAY SECURELY](${response.data.data.checkout_url})

━━━━━━━━━━━━━━━━━━━
✅ Instant verification after payment`;

      bot.sendMessage(chatId, paymentMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      bot.sendMessage(chatId, '❌ Payment system error. Please try again later.');
      console.error(error);
    }
  }
});

// ==================== PAYMENT VERIFICATION ====================

app.post('/verify', async (req, res) => {
  const { tx_ref } = req.body;
  
  if (!tx_ref) {
    return res.status(400).send('No transaction reference');
  }
  
  try {
    const response = await axios.get(
      `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${CHAPA_SECRET}`
        }
      }
    );
    
    if (response.data.status === 'success') {
      const userId = Object.keys(users).find(id => users[id]?.tx_ref === tx_ref);
      
      if (userId) {
        const user = users[userId];
        user.paymentStatus = 'completed';
        user.paidAt = new Date().toISOString();
        
        const welcomeMessage = 
`🎉 *WELCOME TO THE FAMILY!* 🎉

━━━━━━━━━━━━━━━━━━━

Dear ${user.fullName},

Your payment has been *CONFIRMED* successfully!

━━━━━━━━━━━━━━━━━━━

✅ *Account Status:* ACTIVE
💰 *Amount Paid:* 100 ETB
📅 *Member Since:* ${new Date().toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━

Click below to access your dashboard and start using all features!`;

        await bot.sendMessage(
          userId,
          welcomeMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['📊 MY DASHBOARD'], ['❓ SUPPORT']],
              resize_keyboard: true
            }
          }
        );
        
        await bot.sendMessage(
          CHANNEL_ID,
          `💎 *NEW PAID MEMBER!* 💎\n\n👤 ${user.fullName}\n💰 100 ETB\n🆔 \`${userId}\``,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

// ==================== DASHBOARD ====================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!users[chatId]) return;
  
  const user = users[chatId];
  
  if (text === '📊 MY DASHBOARD' && user.paymentStatus === 'completed') {
    const dashboard = 
`📊 *YOUR DASHBOARD* 📊

━━━━━━━━━━━━━━━━━━━

👤 *Profile:*
├ Name: ${user.fullName}
├ Email: ${user.email}
├ Phone: ${user.phone}
└ Username: @${user.username}

📈 *Channel Stats:*
├ Subscribers: ${user.subscribers}
└ Link: ${user.channelLink}

💰 *Membership:*
├ Status: ✅ Active
├ Paid: 100 ETB
└ Member Since: ${new Date(user.paidAt).toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━
✨ *You have full access to all features*`;

    bot.sendMessage(chatId, dashboard, { parse_mode: 'Markdown' });
    
  } else if (text === '❓ SUPPORT') {
    const support = 
`📞 *PREMIUM SUPPORT* 📞

━━━━━━━━━━━━━━━━━━━

🕒 *24/7 Support Available*

📧 Email: hiabhiyu@gmail.com
💬 Live Chat: t.me/acespy 


━━━━━━━━━━━━━━━━━━━
⏱️ *Average response time: < 30 minutes*`;

    bot.sendMessage(chatId, support, { parse_mode: 'Markdown' });
  }
});

// Log that bot is running
console.log('🤖 Bot is started and listening for messages...');