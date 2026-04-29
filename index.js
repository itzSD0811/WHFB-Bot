const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Silence annoying Baileys/libsignal visual spam
const util = require('util');
const originalConsoleLog = console.log;
console.log = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? util.inspect(a) : String(a)).join(' ');
    if (msg.includes('SessionEntry') || msg.includes('Failed to decrypt') || msg.includes('Bad MAC')) return;
    originalConsoleLog.apply(console, args);
};

const originalConsoleError = console.error;
console.error = function (...args) {
    const msg = args.map(a => typeof a === 'object' ? util.inspect(a) : String(a)).join(' ');
    if (msg.includes('SessionEntry') || msg.includes('Failed to decrypt') || msg.includes('Bad MAC')) return;
    originalConsoleError.apply(console, args);
};

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
    const e = String(err);
    if (e.includes('conflict') || e.includes('not-authorized') || e.includes('Socket connection timeout')) return;
    console.error('Uncaught Exception:', err.message || err);
});

process.on('unhandledRejection', (err) => {
    const e = String(err);
    if (e.includes('conflict') || e.includes('not-authorized') || e.includes('Socket connection timeout')) return;
    console.error('Unhandled Rejection:', err.message || err);
});

const userSessions = new Map();
const otpRequests = new Map();
const sentMessageIds = new Set();

const startBot = async () => {
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', `
 __          ___    _ ______ ____  
 \ \        / / |  | |  ____|  _ \ 
  \ \  /\  / /| |__| | |__  | |_) |
   \ \/  \/ / |  __  |  __| |  _ < 
    \  /\  /  | |  | | |    | |_) |
     \/  \/   |_|  |_|_|    |____/ 
    `);
    console.log('\x1b[33m%s\x1b[0m', '==================================================');
    console.log('\x1b[1m\x1b[37m%s\x1b[0m', '      WHATSAPP HOOK FOR FB PAGE HANDLING');
    console.log('\x1b[33m%s\x1b[0m', '==================================================');
    console.log('\x1b[32m%s\x1b[0m', 'Project By: ItzSD');
    console.log('\x1b[34m%s\x1b[0m', 'GitHub: https://github.com/itzsd0811');
    console.log('\x1b[33m%s\x1b[0m', '--------------------------------------------------');
    console.log('\x1b[35m%s\x1b[0m', 'Status: Initializing Core Components...');
    console.log('\x1b[33m%s\x1b[0m', '==================================================\n');

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    let usePairingCode = false;
    let phoneNumber = '';

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }).child({ level: "silent" })),
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    // Intercept sendMessage to automatically track all bot-sent messages
    const originalSendMessage = sock.sendMessage;
    sock.sendMessage = async (...args) => {
        const sentMsg = await originalSendMessage.apply(sock, args);
        if (sentMsg && sentMsg.key && sentMsg.key.id) {
            sentMessageIds.add(sentMsg.key.id);
        }
        return sentMsg;
    };

    // Check if we already have a session
    if (!state.creds.registered) {
        console.log('\n=========================================');
        console.log('          WHATSAPP BOT STARTUP           ');
        console.log('=========================================');
        console.log('Select connection method:');
        console.log('1. QR Code');
        console.log('2. Pairing Code');
        const answer = await question('Enter 1 or 2: ');

        if (answer.trim() === '2') {
            usePairingCode = true;
            phoneNumber = await question('Enter your phone number with country code (e.g., 212xxxxxxxxx): ');
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        }
    }

    // --- PERFORMANCE OPTIMIZATION: Load configs once at startup ---
    let msgs = {};
    let config = {};
    let prefix = '?';
    let commands = {};
    let whitelist = [];

    const reloadConfigs = () => {
        try {
            msgs = yaml.load(fs.readFileSync('messages.yml', 'utf8')) || {};
            if (fs.existsSync('commands.yml')) {
                commands = yaml.load(fs.readFileSync('commands.yml', 'utf8')) || {};
            }
            prefix = commands.prefix || '?';
            config = yaml.load(fs.readFileSync('config.yml', 'utf8')) || {};

            if (fs.existsSync('whitelist.yml')) {
                const content = yaml.load(fs.readFileSync('whitelist.yml', 'utf8'));
                whitelist = content && content.whitelist ? content.whitelist : [];
            } else {
                whitelist = [];
            }
        } catch (e) {
            console.error('Error loading config files:', e.message);
        }
    };

    const saveWhitelist = (list) => {
        whitelist = list; // Update memory cache
        fs.writeFileSync('whitelist.yml', yaml.dump({ whitelist: list }));
    };

    // Initial load
    reloadConfigs();

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
            qrcode.generate(qr, { small: true }, function (qrCode) {
                const lines = qrCode.split('\n');
                const padding = '               '; // Centering padding
                const centeredQr = lines.map(line => padding + line).join('\n');
                console.log('\n\nScan this QR code:\n');
                console.log(centeredQr);
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            } else {
                console.log('Logged out. Please delete the auth_info_baileys folder and restart.');
                process.exit();
            }
        } else if (connection === 'open') {
            console.log('\n=========================================');
            console.log('       Bot successfully connected!       ');
            console.log('=========================================\n');

            // Send a message to self
            const jid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            try {
                const fileContents = fs.readFileSync('messages.yml', 'utf8');
                const messages = yaml.load(fileContents);
                const startMsg = messages.bot_started || 'bot started';
                await sock.sendMessage(jid, { text: startMsg });
            } catch (error) {
                console.error('Error reading messages.yml:', error.message);
                await sock.sendMessage(jid, { text: 'bot started' });
            }
        }
    });

    if (usePairingCode && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('\n==================================================');
                console.log(`Pairing Code: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.error('Failed to request pairing code:', err);
            }
        }, 3000);
    }

    const processMessage = async (msg) => {
        if (!msg.message) return;
        if (msg.key.id && sentMessageIds.has(msg.key.id)) return; // Completely ignore messages generated by this script

        const jid = msg.key.remoteJid;
        const sender = msg.key.participant || jid;
        const myNum = sock.user?.id ? sock.user.id.split(':')[0] : '';

        // Robust Self-Chat (Owner) Detection
        const isOwnerChat = myNum && jid.includes(myNum);

        let isAllowed = false;

        // 1. Owner always allowed in self-chat
        if (isOwnerChat) {
            isAllowed = true;
        }

        // 2. Check Whitelist (from memory cache for speed)
        if (!isAllowed) {
            const senderClean = sender.split('@')[0];
            const found = whitelist.find(u => senderClean.includes(u.id) || (u.id && senderClean.includes(u.id.toString())));
            if (found && !msg.key.fromMe) {
                isAllowed = true;
            }
        }

        // Failsafe: Never process the bot's own text prompts if they accidentally get through
        if (msg.key.fromMe && !isOwnerChat) {
            const tempTxt = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (tempTxt.includes('Invalid response') || tempTxt.includes('Request timed out')) {
                return;
            }
        }

        // Extract text safely from various message types (including quoted, ephemeral, media captions)
        let text = '';
        let msgContent = msg.message;

        // Unpack deeply nested message wrappers
        if (msgContent?.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message;
        if (msgContent?.viewOnceMessage) msgContent = msgContent.viewOnceMessage.message;
        if (msgContent?.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message;
        if (msgContent?.documentWithCaptionMessage) msgContent = msgContent.documentWithCaptionMessage.message;

        text = msgContent?.conversation ||
            msgContent?.extendedTextMessage?.text ||
            msgContent?.imageMessage?.caption ||
            msgContent?.videoMessage?.caption ||
            msgContent?.documentMessage?.caption ||
            '';

        // Detect Button/List Responses
        const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId ||
            msg.message?.templateButtonReplyMessage?.selectedId ||
            msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

        const normalizedText = (buttonId || text).trim();
        const lowerText = normalizedText.toLowerCase();

        // Detect Image Media
        let isImage = false;
        let mediaMessage = msg;
        if (msgContent?.imageMessage) {
            isImage = true;
            mediaMessage = { key: msg.key, message: msgContent };
        } else if (msgContent?.documentMessage?.mimetype?.startsWith('image/')) {
            isImage = true;
            mediaMessage = { key: msg.key, message: msgContent };
        }

        const clearSession = (id) => {
            const s = userSessions.get(id);
            if (s && s.timer) clearTimeout(s.timer);
            userSessions.delete(id);
        };

        const cmdExit = prefix + (commands.exit || 'exit');
        const cmdRequest = prefix + (commands.request || 'request');
        const cmdTest = prefix + (commands.test || 'test');
        const cmdStart = prefix + (commands.start || 'start');
        const cmdDone = prefix + (commands.done || 'done');
        const cmdYes = prefix + (commands.yes || 'yes');
        const cmdNo = prefix + (commands.no || 'no');

        // GLOBAL COMMAND: Exit / Cancel
        if (lowerText === cmdExit) {
            let exited = false;
            if (userSessions.has(jid)) {
                clearSession(jid);
                exited = true;
            }
            if (otpRequests.has(sender)) {
                const req = otpRequests.get(sender);
                if (req.timer) clearTimeout(req.timer);
                otpRequests.delete(sender);
                exited = true;
            }

            if (exited) {
                await sock.sendMessage(jid, { text: msgs.session_cancelled || 'All active sessions for your number have been terminated.' });
            } else {
                await sock.sendMessage(jid, { text: 'No active session found.' });
            }
            return;
        }

        // UNAUTHORIZED USER OTP FLOW
        if (!isAllowed) {
            if (!text || msg.key.fromMe) return; // Never process the bot's own automated unauthorized messages

            // Log commands for debugging to see exactly why it passes/fails
            if (lowerText.startsWith(prefix)) {
                console.log(`\n[DEBUG] Command Received: "${text.trim()}"`);
                console.log(`[DEBUG] Sender: ${sender} | FromMe: ${msg.key.fromMe}`);
                console.log(`[DEBUG] Was it allowed? NO ❌`);
            }

            if (lowerText === cmdRequest) {
                if (otpRequests.has(sender)) {
                    await sock.sendMessage(jid, { text: msgs.otp_request_active || 'You already have an active request. Please check with the owner.' });
                    return;
                }

                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const senderName = msg.pushName || sender.split('@')[0];

                const ownerJid = myNum + '@s.whatsapp.net';
                let ownerReqMsg = msgs.otp_owner_request || "🔔 *Access Request*\nUser: {NAME}\nID: {ID}\n\nOTP Code: *${OTP}*";
                ownerReqMsg = ownerReqMsg.replace('{NAME}', senderName).replace('{ID}', sender.split('@')[0]).replace('{OTP}', otp);
                await sock.sendMessage(ownerJid, { text: ownerReqMsg });

                const timer = setTimeout(() => {
                    otpRequests.delete(sender);
                    let timeoutMsg = msgs.otp_request_timeout || `Your OTP request timed out. Please send \`${cmdRequest}\` again.`;
                    sock.sendMessage(jid, { text: timeoutMsg.replace('{PREFIX}', prefix) }).catch(() => { });
                }, 60000);

                otpRequests.set(sender, { otp, timer, name: senderName, attempts: 0 });
                await sock.sendMessage(jid, { text: msgs.otp_request_sent || 'Request sent to the owner! Please enter the 6-digit OTP to get access (expires in 1 minute).' });
                return;
            }

            if (otpRequests.has(sender)) {
                const req = otpRequests.get(sender);
                if (normalizedText === req.otp) {
                    clearTimeout(req.timer);
                    otpRequests.delete(sender);

                    const list = [...whitelist];
                    list.push({ id: sender.split('@')[0], name: req.name });
                    saveWhitelist(list);

                    let grantedMsg = msgs.otp_granted || "✅ Access Granted! You can now use the bot. Send `{PREFIX}start`";
                    await sock.sendMessage(jid, { text: grantedMsg.replace('{PREFIX}', prefix) });

                    const ownerJid = myNum + '@s.whatsapp.net';
                    let ownerGrantMsg = msgs.otp_owner_granted || "✅ *Access Granted*\nUser *{NAME}* successfully entered the OTP.";
                    await sock.sendMessage(ownerJid, { text: ownerGrantMsg.replace('{NAME}', req.name) });
                } else {
                    req.attempts += 1;
                    if (req.attempts >= 3) {
                        clearTimeout(req.timer);
                        otpRequests.delete(sender);
                        await sock.sendMessage(jid, { text: msgs.otp_max_attempts || '❌ Too many invalid attempts. Your request has been cancelled for security.' });
                    } else {
                        let invalidMsg = msgs.otp_invalid || '❌ Invalid OTP. Try again. ({ATTEMPTS} attempts remaining)';
                        await sock.sendMessage(jid, { text: invalidMsg.replace('{ATTEMPTS}', (3 - req.attempts)) });
                    }
                }
                return;
            }

            return; // Ignore all other unauthorized messages
        }

        // --- AUTHORIZED USERS PAST THIS POINT ---

        // Log commands for debugging
        if (text && text.trim().startsWith(prefix)) {
            console.log(`\n[DEBUG] Command Received: "${text.trim()}"`);
            console.log(`[DEBUG] Sender: ${sender} | FromMe: ${msg.key.fromMe}`);
            console.log(`[DEBUG] Was it allowed? YES ✅\n`);
        }

        // CRITICAL FIX: Ignore messages sent by the bot itself (Baileys IDs start with BAE5)
        if (msg.key.id && msg.key.id.startsWith('BAE5')) return;

        if (!text && !isImage) return;

        const session = userSessions.get(jid);

        // --- FACEBOOK PUBLISHING HELPER ---
        const publishToFacebook = async () => {
            const fbConfig = config.facebook || {};
            if (!fbConfig.page_id || !fbConfig.access_token) {
                await sock.sendMessage(jid, { text: msgs.fb_not_configured || 'Facebook credentials are not configured in config.yml!' });
                return;
            }

            await sock.sendMessage(jid, { text: msgs.uploading_to_fb || 'Uploading to Facebook... Please wait ⏳' });

            try {
                const attachedMedia = [];
                for (let i = 0; i < session.images.length; i++) {
                    const formData = new FormData();
                    formData.append('access_token', fbConfig.access_token);
                    formData.append('published', 'false');
                    formData.append('source', new Blob([session.images[i]], { type: 'image/jpeg' }), `photo${i}.jpg`);

                    const res = await fetch(`https://graph.facebook.com/v19.0/${fbConfig.page_id}/photos`, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message);
                    if (data.id) attachedMedia.push({ media_fbid: data.id });
                }

                const footerLine1 = msgs.footer_line1 || "";
                const footerLine2 = msgs.footer_line2 || "";
                const footerLine3 = msgs.footer_line3 || "";
                const fullFooter = `\n\n${footerLine1}\n${footerLine2}\n${footerLine3}`.trimEnd();

                const finalDescription = session.textToPost + (fullFooter ? `\n\n${fullFooter}` : "");

                const postBody = {
                    message: finalDescription,
                    access_token: fbConfig.access_token
                };

                if (attachedMedia.length > 0) {
                    postBody.attached_media = attachedMedia;
                }

                const postRes = await fetch(`https://graph.facebook.com/v19.0/${fbConfig.page_id}/feed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(postBody)
                });

                const postData = await postRes.json();
                if (postData.error) throw new Error(postData.error.message);

                await sock.sendMessage(jid, { text: msgs.post_success || 'Successfully posted to Facebook! 🎉' });
            } catch (err) {
                let errMsg = msgs.post_failed || 'Failed to post. Error: {ERROR}';
                await sock.sendMessage(jid, { text: errMsg.replace('{ERROR}', err.message) });
            }
            clearSession(jid);
        };

        // --- COMMAND HANDLERS ---
        if (lowerText === cmdTest) {
            const helpText = `🌟 *WHFB BOT FOR YOUR FB PAGE* 🌟

Welcome to your professional posting assistant. Here are the available commands:

🚀 *${cmdStart}*
Begin a new posting session. You can upload photos and set a description.

🔑 *${cmdRequest}*
Request access to the bot (for new users).

⏹️ *${cmdExit}*
Cancel any active session or request.

ℹ️ *${cmdTest}*
Show this professional help menu.

*Current Mode:* ${config.simple_mode ? '⚡ Simple Mode (Enabled)' : '📝 Standard Mode'}
*Status:* System Online ✅`;

            const logoPath = path.join(__dirname, 'Media', 'logo.png');
            if (fs.existsSync(logoPath)) {
                await sock.sendMessage(jid, {
                    image: fs.readFileSync(logoPath),
                    caption: helpText
                });
            } else {
                await sock.sendMessage(jid, { text: helpText });
            }
            return;
        }



        // Command: Start Flow
        if (lowerText === cmdStart || lowerText === cmdStart.trim()) {
            clearSession(jid);

            const timer = setTimeout(async () => {
                await sock.sendMessage(jid, { text: msgs.request_timeout || 'Request timed out.' });
                userSessions.delete(jid);
            }, 60000); // 1 minute timeout

            userSessions.set(jid, { state: 'WAITING_MEDIA', images: [], timer });

            let askMediaStr = config.simple_mode ? (msgs.ask_media_simple || `Please send photo(s). When ready, simply send your text description to post instantly! ⚡`) : (msgs.ask_media || `Please send photo(s). Reply ${cmdDone} when finished.`);
            await sock.sendMessage(jid, { text: askMediaStr.replace(/{PREFIX}/g, prefix) });
            return;
        }

        // Handle Active Session State
        if (session) {
            // Refresh timeout
            clearTimeout(session.timer);
            const timer = setTimeout(async () => {
                await sock.sendMessage(jid, { text: msgs.request_timeout || 'Request timed out.' });
                userSessions.delete(jid);
            }, 60000);
            session.timer = timer;

            if (session.state === 'WAITING_MEDIA') {
                let processedImage = false;
                if (isImage) {
                    session.activeDownloads = (session.activeDownloads || 0) + 1;
                    try {
                        const buffer = await downloadMediaMessage(mediaMessage, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        session.images.push(buffer);
                        processedImage = true;
                    } catch (e) {
                        console.error('Failed to download image', e);
                        await sock.sendMessage(jid, { text: 'Failed to download that image. Try sending it again.' });
                    } finally {
                        session.activeDownloads--;
                    }
                }

                if (lowerText === cmdDone) {
                    if (session.activeDownloads > 0) {
                        await sock.sendMessage(jid, { text: `⏳ Still processing your previous photo(s)... Please wait a few seconds and reply \`${cmdDone}\` again.` });
                        return;
                    }

                    if (session.images.length === 0) {
                        await sock.sendMessage(jid, { text: `You haven't sent any photos! Please send a photo first, or reply \`${cmdExit}\` to cancel.` });
                        return;
                    }
                    session.state = 'CONFIRM_MEDIA';
                    let confirmMsg = msgs.confirm_media || `You have {COUNT} image(s) ready to post.\nConfirm with ${cmdYes}`;
                    await sock.sendMessage(jid, {
                        text: confirmMsg.replace('{COUNT}', session.images.length).replace(/{PREFIX}/g, prefix),
                        buttons: [
                            { buttonId: cmdYes, buttonText: { displayText: '👍 Yes' }, type: 1 },
                            { buttonId: cmdNo, buttonText: { displayText: '👎 No' }, type: 1 },
                            { buttonId: cmdExit, buttonText: { displayText: '❌ Exit' }, type: 1 }
                        ],
                        headerType: 1
                    });
                } else if (lowerText === cmdNo || lowerText === cmdExit) {
                    clearSession(jid);
                    await sock.sendMessage(jid, { text: msgs.post_cancelled || 'Post cancelled.' });
                } else if (processedImage) {
                    let reply = config.simple_mode ? (msgs.media_received_simple || `📸 {COUNT} image(s) received. Send your description to post instantly! ⚡`) : (msgs.media_received || `📸 {COUNT} image(s) received. Reply ${cmdDone} to continue.`);

                    const btnOptions = config.simple_mode ? [
                        { buttonId: cmdExit, buttonText: { displayText: '❌ Cancel' }, type: 1 }
                    ] : [
                        { buttonId: cmdDone, buttonText: { displayText: '✅ Done' }, type: 1 },
                        { buttonId: cmdExit, buttonText: { displayText: '❌ Exit' }, type: 1 }
                    ];

                    await sock.sendMessage(jid, {
                        text: reply.replace('{COUNT}', session.images.length).replace(/{PREFIX}/g, prefix),
                        buttons: btnOptions,
                        headerType: 1
                    });
                } else if (!isImage) {
                    if (config.simple_mode && session.images.length > 0) {
                        // SIMPLE MODE: Text message acts as description and trigger
                        session.textToPost = text;
                        await publishToFacebook();
                    } else {
                        let textMsg = config.simple_mode ? `Please send photos first.` : `Please send photos, or reply \`${cmdDone}\` if you are finished.`;
                        const btnOptions = config.simple_mode ? [
                            { buttonId: cmdExit, buttonText: { displayText: '❌ Cancel' }, type: 1 }
                        ] : [
                            { buttonId: cmdDone, buttonText: { displayText: '✅ Done' }, type: 1 },
                            { buttonId: cmdExit, buttonText: { displayText: '❌ Cancel' }, type: 1 }
                        ];

                        await sock.sendMessage(jid, {
                            text: textMsg,
                            buttons: btnOptions,
                            headerType: 1
                        });
                    }
                }
                return;
            }

            if (session.state === 'CONFIRM_MEDIA') {
                if (lowerText === cmdYes || lowerText === cmdYes.trim()) {
                    session.state = 'WAITING_DESCRIPTION';
                    await sock.sendMessage(jid, { text: msgs.ask_description || 'Please send the description for your post.' });
                } else if (lowerText === cmdNo || lowerText === cmdNo.trim()) {
                    clearSession(jid);
                    await sock.sendMessage(jid, { text: msgs.post_cancelled || 'Post cancelled.' });
                } else {
                    await sock.sendMessage(jid, { text: `Reply \`${cmdYes}\` or \`${cmdNo}\`.` });
                }
                return;
            }

            if (session.state === 'WAITING_DESCRIPTION') {
                if (!text) {
                    await sock.sendMessage(jid, { text: msgs.invalid_description || 'Please send a valid text description.' });
                    return;
                }
                session.textToPost = text;

                if (config.simple_mode) {
                    await publishToFacebook();
                } else {
                    session.state = 'WAITING_FINAL_CONFIRM';

                    let confirmMsg = msgs.ask_final_confirmation || `Almost ready! {COUNT} photo(s) attached.\n\n*Preview:*\n{TEXT}\n\nReply with ${cmdYes} to post`;
                    confirmMsg = confirmMsg.replace('{COUNT}', session.images.length)
                        .replace('{TEXT}', session.textToPost)
                        .replace(/{PREFIX}/g, prefix);

                    await sock.sendMessage(jid, {
                        text: confirmMsg,
                        buttons: [
                            { buttonId: cmdYes, buttonText: { displayText: '🚀 Post Now' }, type: 1 },
                            { buttonId: cmdNo, buttonText: { displayText: '👎 Cancel' }, type: 1 },
                            { buttonId: cmdExit, buttonText: { displayText: '❌ Exit' }, type: 1 }
                        ],
                        headerType: 1
                    });
                }
                return;
            }

            if (session.state === 'WAITING_FINAL_CONFIRM') {
                if (lowerText === cmdYes || lowerText === cmdYes.trim()) {
                    await publishToFacebook();
                } else if (lowerText === cmdNo || lowerText === cmdNo.trim()) {
                    clearSession(jid);
                    await sock.sendMessage(jid, { text: msgs.post_cancelled || 'Post cancelled.' });
                } else {
                    await sock.sendMessage(jid, { text: `Reply \`${cmdYes}\` or \`${cmdNo}\`.` });
                }
                return;
            }
        }
    };

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            await processMessage(msg);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Shutdown Notification
    const handleShutdown = async () => {
        console.log('\nShutting down bot...');
        if (sock.user?.id) {
            const myNum = sock.user.id.split(':')[0];
            const ownerJid = myNum + '@s.whatsapp.net';
            try {
                await sock.sendMessage(ownerJid, { text: msgs.bot_stopped || 'Bot is stopping... Goodbye! 👋' });
            } catch (e) {
                console.error('Failed to send shutdown message:', e);
            }
        }
        process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
}

startBot();
