<div align="center">
  <img src="github-media/image1.png" alt="Header" width="100%">
</div>

# <div align="center">Whatsapp Hook For FB Page Handling 🛰️</div>

<div align="center">
  <img src="https://img.shields.io/badge/Status-Online-brightgreen" alt="Status">
  <img src="https://img.shields.io/badge/Node-v18%2B-blue" alt="Node">
  <img src="https://img.shields.io/badge/Platform-OS--Windows--%7C--Linux-orange" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</div>

<br>

<div align="center">
A streamlined tool to handle your Facebook Page posts directly from WhatsApp. No complex dashboards, just send your photos and text, and the bot handles the rest.
</div>

---

## ⚡ Main Features

<div align="center">
  <img src="github-media/image2.png" alt="Features" width="80%">
</div>

- **Multi-Photo Batching:** Upload several photos at once. The bot holds them in memory until you're ready to publish.
- **Smart Simple Mode:** A high-speed flow for power users.
- **Secure Access:** Only people you authorize can use the bot. New users have to request access with an OTP code sent to you.
- **Dynamic Buttons & Menus:** Uses interactive WhatsApp buttons and list menus for selecting post buttons (Messenger, WhatsApp, etc.).
- **Automatic Footers:** Add up to 3 lines of signature/footer text to every post automatically.
- **Session Cleanup:** Automatically terminates hanging sessions after 60 seconds of inactivity to keep things fast.

---

## 🏎️ What is "Simple Mode"?
By default, the bot asks for confirmation at every step. If you enable `simple_mode: true` in your `config.yml`, the process is cut in half:

1. Send **?start**.
2. Upload your photos (one or many).
3. Send your **Post Description** (The bot realizes you're done with photos the moment you send text).
4. Pick your **CTA Button** from the menu.
5. **BOOM!** The post is published instantly. No extra "Yes/No" confirmations needed.

---

## 🚀 How to Setup

### 1. Installation
Clone the repo and install the components:
```bash
git clone https://github.com/itzsd0811/whatsapp-hook-fb.git
cd whatsapp-hook-fb
npm install
```

### 2. Configure Your Credentials
Edit `config.yml` with your Facebook Page info:
- `page_id`: Find this in your Page's "About" section.
- `access_token`: Get this from the [Facebook Developers Portal](https://developers.facebook.com/). Ensure you have `pages_manage_posts` and `pages_read_engagement` permissions.

### 3. Start the Bot
Run the start command and scan the QR code:
```bash
npm start
```

---

## 🔧 Customization Guide

### **Messages & Text**
Open `messages.yml` to change any text the bot sends. You can change:
- **Prefix:** Change `?` to `!` or anything you like.
- **Footers:** Set `footer_line1`, `footer_line2`, and `footer_line3` for your signature.
- **Prompts:** Customize how the bot asks for media or descriptions.

---

## 🛠️ Troubleshooting & FAQ

**Q: The bot isn't seeing my images!**
A: Make sure you've sent `?start` first. If you're in a hurry, wait for the bot to reply "Received" before sending the next batch.

**Q: I get a "path not defined" or "myNum" error.**
A: Make sure you're using the latest version of the script. These were bugs in older versions that are now fixed.

**Q: Buttons aren't appearing on my phone.**
A: Some versions of WhatsApp don't support native buttons. Don't worry—you can still type the commands like `?yes` or `?no` and the bot will understand!

**Q: How do I remove a user?**
A: Open `whitelist.yml` and just delete the line with their number.

---

## ⚖️ License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

<div align="center">
  <br>
  <b>Project by ItzSD</b><br>
  <a href="https://github.com/itzsd0811">GitHub Profile</a>
  <br><br>
  <img src="github-media/image3.png" alt="Footer" width="100%">
</div>
