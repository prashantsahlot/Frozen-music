addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// Add your bot token here.
const BOT_TOKEN = "7351497568:AAG_al7ZMH4QTIF5L3_CbfT47XoPvfvv-gg";

//Pro people: don't change this else your bot will be fucked.
const API_BASE_URL = "https://eligible-hilda-frozenbotspvt-ae522a1a.koyeb.app";

//Pro people: don't change this else your bot will be fucked.
const ASSISTANT_ID = "7049510852";


let songQueue = [];
let isPlaying = false;
let startMessages = {}; 

const botStartTime = Date.now();

async function isUserAdmin(chatId, userId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.ok) return false;
    const status = data.result.status;
    return (status === "creator" || status === "administrator");
  } catch (error) {
    console.error("Error in isUserAdmin:", error);
    return false;
  }
}

function getPlaybackKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "▶️", callback_data: "resume" },
        { text: "⏸", callback_data: "pause" },
        { text: "⏭", callback_data: "skip" },
        { text: "⏹", callback_data: "stop" }
      ]
    ]
  };
}

function getQueueKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⏭ Skip", callback_data: "skip" },
        { text: "🗑 Clear", callback_data: "clear" }
      ]
    ]
  };
}

async function sendMessage(chatId, text, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("sendMessage error:", data);
      throw new Error(data.description || "Failed to send message");
    }
    return data.result;
  } catch (error) {
    console.error("Error in sendMessage:", error);
    throw error;
  }
}

async function sendPhoto(chatId, photoUrl, caption, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    const payload = { chat_id: chatId, photo: photoUrl, caption, parse_mode: "Markdown" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("sendPhoto error:", data);
      throw new Error(data.description || "Failed to send photo message");
    }
    return data.result;
  } catch (error) {
    console.error("Error in sendPhoto:", error);
    throw error;
  }
}

async function editMessage(chatId, messageId, text, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown" };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("editMessage error:", data);
      throw new Error(data.description || "Failed to edit message");
    }
    return data;
  } catch (error) {
    console.error("Error in editMessage:", error);
    throw error;
  }
}

async function editPhotoMessage(chatId, messageId, photoUrl, caption, replyMarkup = null) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageMedia`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      media: {
        type: "photo",
        media: photoUrl,
        caption,
        parse_mode: "Markdown"
      }
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("editPhotoMessage error:", data);
      throw new Error(data.description || "Failed to edit photo message");
    }
    return data.result;
  } catch (error) {
    console.error("Error editing photo message:", error);
    throw error;
  }
}

async function updateMessage(chatId, messageId, text, replyMarkup = null) {
  try {
    await editMessage(chatId, messageId, text, replyMarkup);
  } catch (error) {
    await sendMessage(chatId, text, replyMarkup);
  }
}


async function answerCallback(callbackId, text = "") {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
    const payload = { callback_query_id: callbackId, text };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Error answering callback query:", error);
  }
}


async function fetchWithTimeout(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}


async function ensureAssistantInChat(chat) {
  const chatId = chat.id;
  const getMemberUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(ASSISTANT_ID)}`;
  try {
    let response = await fetch(getMemberUrl);
    let data = await response.json();
    if (!data.ok || ['left', 'kicked'].includes(data.result?.status)) {
      const chatIdentifier = chat.username ? `@${chat.username}` : chatId;
      const joinUrl = `${API_BASE_URL}/join?chat=${encodeURIComponent(chatIdentifier)}`;
      let joinResponse = await fetch(joinUrl);
      let joinData = await joinResponse.json();
      if (!joinResponse.ok) {
        await sendMessage(chatId, `Failed to invite assistant: ${joinData.error || 'unknown error'}.`);
      }
    }
  } catch (error) {
    console.error("Error in ensureAssistantInChat:", error);
  }
}


function formatDuration(duration) {
  if (!duration) return "Unknown duration";
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  if (!matches) return duration;
  const hours = parseInt(matches[1] || "0");
  const minutes = parseInt(matches[2] || "0");
  const seconds = parseInt(matches[3] || "0");
  let result = "";
  if (hours) result += hours + " hour" + (hours > 1 ? "s " : " ");
  if (minutes) result += minutes + " min" + (minutes > 1 ? "s " : " ");
  if (seconds) result += seconds + " second" + (seconds > 1 ? "s" : "");
  return result.trim();
}


function formatUptime(seconds) {
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  let secs = seconds % 60;
  let result = "";
  if (hours) result += hours + " hour" + (hours > 1 ? "s " : " ");
  if (minutes) result += minutes + " min" + (minutes > 1 ? "s " : " ");
  if (secs) result += secs + " second" + (secs > 1 ? "s" : "");
  return result.trim();
}


function secondsToISO8601(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let iso = "PT";
  if (h > 0) iso += h + "H";
  if (m > 0) iso += m + "M";
  if (s > 0) iso += s + "S";
  return iso;
}


async function getSongDetails(title) {
  const searchUrl = `https://jiosaavn-api.lagendplayersyt.workers.dev/api/search/songs?query=${encodeURIComponent(title)}`;
  try {
    const response = await fetchWithTimeout(searchUrl, {}, 20000);
    const data = await response.json();
    if (!data.success) {
      throw new Error("API call was not successful");
    }
    if (!data.data || !data.data.results || data.data.results.length === 0) {
      throw new Error("No songs found");
    }
    
    
    const filteredResults = data.data.results.filter(song => {
      return song.language && song.language.toLowerCase() !== "instrumental";
    });
    
    if (filteredResults.length === 0) {
      throw new Error("No non-instrumental songs found");
    }
    
    const songResult = filteredResults[0];

    
    let durationISO = "PT0S";
    if (songResult.duration) {
      if (typeof songResult.duration === "number") {
        durationISO = secondsToISO8601(songResult.duration);
      } else if (typeof songResult.duration === "string") {
        durationISO = songResult.duration;
      }
    }

    
    let thumbnail = null;
if (songResult.image && songResult.image.length > 0) {
  const bestImage = songResult.image.find(img => img.quality === "500x500") || songResult.image[0];
  thumbnail = bestImage.url;
}


    return {
      title: songResult.name,
      link: songResult.url,
      duration: durationISO,
      thumbnail: thumbnail,
    };
  } catch (error) {
    throw new Error("Error fetching song details: " + error.message);
  }
}


async function sendQueueMessage(chatId, song, requester, queuePosition) {
  const queueButtons = getQueueKeyboard();
  // Show the queue number as (queuePosition + 1) while keeping backend indexing unchanged.
  const text = `✨ᴀᴅᴅᴇᴅ ᴛᴏ ǫᴜᴇᴜᴇ :\n\n` +
               `**❍ ᴛɪᴛʟє ➥** ${song.title}\n\n` +
               `**❍ ᴛɪᴍє ➥** ${song.humanDuration}\n\n` +
               `**❍ ʙʏ ➥** ${requester}\n\n` +
               `**Queue number:** ${queuePosition + 1}\n`;
  if (song.thumbnail) {
    return await sendPhoto(chatId, song.thumbnail, text, queueButtons);
  } else {
    return await sendMessage(chatId, text, queueButtons);
  }
}


async function deleteMessage(chatId, messageId) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
  const payload = { chat_id: chatId, message_id: messageId };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!data.ok) {
      console.error("deleteMessage error:", data);
      throw new Error(data.description || "Failed to delete message");
    }
    return data.result;
  } catch (error) {
    console.error("Error in deleteMessage:", error);
    throw error;
  }
}


async function playSong(chatId, song, processingMsg) {
  isPlaying = true; // Mark as playing immediately.
  const playUrl = `${API_BASE_URL}/play?chatid=${encodeURIComponent(chatId)}&title=${encodeURIComponent(song.title)}`;
  try {
    const playResponse = await fetchWithTimeout(playUrl, {}, 20000);
    const playData = await playResponse.json();
    if (playResponse.ok) {
      const keyboard = getPlaybackKeyboard();
      keyboard.inline_keyboard.push([
        { text: "✨ Updates ✨", url: "https://t.me/vibeshiftbots" },
        { text: "💕 Support 💕", url: "https://t.me/Frozensupport1" }
      ]);
      const caption = `**ғʀᴏᴢᴇɴ ✘ ᴍᴜsɪᴄ ση sᴛʀєᴧϻɪηɢ ⏤͟͞●**\n\n` +
                      `**❍ ᴛɪᴛʟє ➥** ${song.title}\n\n` +
                      `**❍ ᴛɪᴍє ➥** ${song.humanDuration}\n\n` +
                      `**❍ ʙʏ ➥** ${song.requester || "Unknown"}`;
      await sendPhoto(chatId, song.thumbnail, caption, keyboard);
      // Song is now playing.
    } else {
      await updateMessage(chatId, processingMsg.message_id, `Error playing song: ${playData.error}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      await updateMessage(chatId, processingMsg.message_id, 'Timed out');
    } else {
      await updateMessage(chatId, processingMsg.message_id, `Error: ${error.message}`);
    }
  }
}


async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  let updateData;
  try {
    updateData = await request.json();
  } catch (e) {
    return new Response('Bad Request', { status: 400 });
  }
  

  if (updateData.callback_query) {
    const callback = updateData.callback_query;
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const callbackId = callback.id;
    

    if (["resume", "pause", "skip", "stop"].includes(data)) {
      const isAdmin = await isUserAdmin(chatId, callback.from.id);
      if (!isAdmin) {
        await answerCallback(callbackId, "Only admins can use this command.");
        return new Response('OK', { status: 200 });
      }
    }
    
    if (data === "resume") {
      const resumeUrl = `${API_BASE_URL}/resume?chatid=${encodeURIComponent(chatId)}`;
      try {
        const resumeResponse = await fetchWithTimeout(resumeUrl, {}, 20000);
        const resumeData = await resumeResponse.json();
        if (resumeResponse.ok) {
          await sendMessage(chatId, `Resumed playback.`);
          await answerCallback(callbackId, "Resumed");
        } else {
          await sendMessage(chatId, `Error resuming playback: ${resumeData.error}`);
          await answerCallback(callbackId, "Error");
        }
      } catch (error) {
        await sendMessage(chatId, `Error: ${error.message}`);
      }
    } else if (data === "pause") {
      const pauseUrl = `${API_BASE_URL}/pause?chatid=${encodeURIComponent(chatId)}`;
      try {
        const pauseResponse = await fetchWithTimeout(pauseUrl, {}, 20000);
        const pauseData = await pauseResponse.json();
        if (pauseResponse.ok) {
          await sendMessage(chatId, `Paused playback.`);
          await answerCallback(callbackId, "Paused");
        } else {
          await sendMessage(chatId, `Error pausing playback: ${pauseData.error}`);
          await answerCallback(callbackId, "Error");
        }
      } catch (error) {
        await sendMessage(chatId, `Error: ${error.message}`);
      }
    } else if (data === "next" || data === "skip") {
      const skippedBy = callback.from.first_name || "Someone";
      try {
        const stopUrl = `${API_BASE_URL}/stop?chatid=${encodeURIComponent(chatId)}`;
        try {
          const stopResponse = await fetchWithTimeout(stopUrl, {}, 20000);
          const stopData = await stopResponse.json();
          if (!stopResponse.ok) {
            console.error("Stop API error:", stopData.error);
          }
        } catch (stopError) {
          console.error("Error during stop API call:", stopError);
        }
      } catch (outerError) {
        console.error("Unexpected error while stopping:", outerError);
      }
      isPlaying = false;
      if (songQueue.length > 0) {
        const nextSongItem = songQueue.shift();
        await playSong(chatId, nextSongItem.song, nextSongItem.processingMsg);
        await sendMessage(chatId, `Skipped to next song (skipped by ${skippedBy}).`);
      } else {
        await sendMessage(
          chatId,
          `Skipped the current song (skipped by ${skippedBy}). No more songs in the queue, playback stopped.`
        );
      }
      await answerCallback(callbackId, "Skipped");
    } else if (data === "stop") {
      const stoppedBy = callback.from.first_name || "Someone";
      songQueue = [];
      isPlaying = false;
      const stopUrl = `${API_BASE_URL}/stop?chatid=${encodeURIComponent(chatId)}`;
      try {
        const stopResponse = await fetchWithTimeout(stopUrl, {}, 20000);
        const stopData = await stopResponse.json();
        if (stopResponse.ok) {
          await sendMessage(chatId, `Stopped playback and cleared the queue (stopped by ${stoppedBy}).`);
          await answerCallback(callbackId, "Stopped");
        } else {
          await sendMessage(chatId, `Error stopping playback: ${stopData.error}`);
          await answerCallback(callbackId, "Error");
        }
      } catch (error) {
        await sendMessage(chatId, `Error: ${error.message}`);
      }
    } else if (data === "clear") {
      songQueue = [];
      isPlaying = false;
      await sendMessage(chatId, `Queue cleared.`);
      await answerCallback(callbackId, "Queue cleared");
    } else if (data === "show_help") {
      const helpText = "📜 Choose a category to explore commands:";
      const helpButtons = {
        inline_keyboard: [
          [
            { text: "🎵 Play", callback_data: "help_play" },
            { text: "⏹ Stop", callback_data: "help_stop" },
            { text: "⏸ Pause", callback_data: "help_pause" }
          ],
          [
            { text: "▶ Resume", callback_data: "help_resume" },
            { text: "⏭ Skip", callback_data: "help_skip" },
            { text: "🔄 Reboot", callback_data: "help_reboot" }
          ],
          [
            { text: "📶 Ping", callback_data: "help_ping" },
            { text: "🗑 Clear Queue", callback_data: "help_clear" }
          ],
          [
            { text: "🏠 Home", callback_data: "go_back" }
          ]
        ]
      };
      try {
        await editMessage(chatId, callback.message.message_id, helpText, helpButtons);
      } catch (error) {
        await sendMessage(chatId, helpText, helpButtons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_play") {
      const text = "🎵 **Play Command**\n\n➜ Use /play <song name> to play music.\n\n💡 Example: /play shape of you";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_stop") {
      const text = "⏹ **Stop Command**\n\n➜ Use /stop or /end to stop the music and clear the queue.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_pause") {
      const text = "⏸ **Pause Command**\n\n➜ Use /pause to pause the current song.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_resume") {
      const text = "▶ **Resume Command**\n\n➜ Use /resume to continue playing the paused song.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_skip") {
      const text = "⏭ **Skip Command**\n\n➜ Use /skip to move to the next song in the queue.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_reboot") {
      const text = "🔄 **Reboot Command**\n\n➜ Use /reboot to restart the bot if needed.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_ping") {
      const text = "📶 **Ping Command**\n\n➜ Use /ping to check the bot's response time and uptime.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_playlist") {
      const text = "🎶 **Playlist Command**\n\n➜ Use /playlist to view and manage your playlist.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "help_clear") {
      const text = "🗑 **Clear Queue Command**\n\n➜ Use /clear to remove all songs from the queue.";
      const buttons = { inline_keyboard: [[ { text: "🔙 Back", callback_data: "show_help" } ]] };
      try {
        await editMessage(chatId, callback.message.message_id, text, buttons);
      } catch (error) {
        await sendMessage(chatId, text, buttons);
      }
      await answerCallback(callbackId, "");
    } else if (data === "go_back") {
      const current_time = Date.now();
      const uptimeSeconds = Math.floor((current_time - botStartTime) / 1000);
      const userMention = callback.from && callback.from.first_name ? callback.from.first_name : "there";
      const caption = (
        `👋 нєу ${userMention} 💠, 🥀\n\n` +
        "🎶 Wᴇʟᴄᴏᴍᴇ ᴛᴏ Fʀᴏᴢᴇɴ 🥀 ᴍᴜsɪᴄ! 🎵\n\n" +
        "➻ 🚀 A Sᴜᴘᴇʀғᴀsᴛ & Pᴏᴡᴇʀғᴜʟ Tᴇʟᴇɢʀᴀᴍ Mᴜsɪᴄ Bᴏᴛ ᴡɪᴛʜ ᴀᴍᴀᴢɪɴɢ ғᴇᴀᴛᴜʀᴇs. ✨\n\n" +
        "🎧 Sᴜᴘᴘᴏʀᴛᴇᴅ Pʟᴀᴛғᴏʀᴍs: ʏᴏᴜᴛᴜʙᴇ, sᴘᴏᴛɪғʏ, ʀᴇssᴏ, ᴀᴘᴘʟᴇ ᴍᴜsɪᴄ, sᴏᴜɴᴅᴄʟᴏᴜᴅ.\n\n" +
        "🔹 Kᴇʏ Fᴇᴀᴛᴜʀᴇs:\n" +
        "🎵 Playlist Support for your favorite tracks.\n" +
        "🤖 AI Chat for engaging conversations.\n" +
        "🖼️ Image Generation with AI creativity.\n" +
        "👥 Group Management tools for admins.\n" +
        "💡 And many more exciting features!\n\n" +
        `**Uptime:** \`${formatUptime(uptimeSeconds)}\`\n\n` +
        "──────────────────\n" +
        "๏ ᴄʟɪᴄᴋ ᴛʜᴇ ʜᴇʟᴘ ʙᴜᴛᴛᴏɴ ғᴏʀ ᴍᴏᴅᴜʟᴇ ᴀɴᴅ ᴄᴏᴍᴍᴀɴᴅ ɪɴғᴏ.."
      );
      const buttons = {
        inline_keyboard: [
          [
            { text: "➕ Add me", url: "https://t.me/vcmusiclubot?startgroup=true" },
            { text: "💬 Support", url: "https://t.me/Frozensupport1" }
          ],
          [
            { text: "❓ Help", callback_data: "show_help" }
          ]
        ]
      };
      try {
        await editPhotoMessage(chatId, callback.message.message_id, "https://files.catbox.moe/kao3ip.jpeg", caption, buttons);
      } catch (error) {
        await sendPhoto(chatId, "https://files.catbox.moe/kao3ip.jpeg", caption, buttons);
      }
      await answerCallback(callbackId, "");
    }
    return new Response('OK', { status: 200 });
  }
  

  if (!updateData.message || !updateData.message.text) {
    return new Response('OK', { status: 200 });
  }
  
  const message = updateData.message;
  const text = message.text.trim();
  const chat = message.chat;
  const chatId = chat.id;
  let processingMsg;
  

  const streamEndedRegex = /Stream ended in chat id (-?\d+)/;
  const match = text.match(streamEndedRegex);
  if (match) {
    const targetChatId = match[1];
    console.log(`Stream ended received for chat ${targetChatId}, attempting to skip to next song.`);
    try {
      const stopUrl = `${API_BASE_URL}/stop?chatid=${encodeURIComponent(targetChatId)}`;
      const stopResponse = await fetchWithTimeout(stopUrl, {}, 20000);
      const stopData = await stopResponse.json();
      if (!stopResponse.ok) {
        console.error("Stop API error:", stopData.error);
      }
    } catch (error) {
      console.error("Error during stop API call:", error);
    }
    isPlaying = false;
    if (songQueue.length > 0) {
      const nextSongItem = songQueue.shift();
      await playSong(targetChatId, nextSongItem.song, nextSongItem.processingMsg);
      await sendMessage(targetChatId, "Skipped to next song (auto-skip triggered by stream end).");
    } else {
      await sendMessage(targetChatId, "Skipped current song. No more songs in the queue, playback stopped.");
    }
    return new Response('OK', { status: 200 });
  }
  

  if (["/pause", "/resume", "/skip", "/stop", "/end"].some(cmd => text.startsWith(cmd))) {
    const isAdmin = await isUserAdmin(chatId, message.from.id);
    if (!isAdmin) {
      await sendMessage(chatId, "Only admins can use this command.");
      return new Response('OK', { status: 200 });
    }
  }
  

  if (text.startsWith('/start')) {
    try {
      const uptimeSeconds = Math.floor((Date.now() - botStartTime) / 1000);
      const userMention = message.from ? message.from.first_name : "there";
      const caption = (
        `👋 нєу ${userMention} 💠, 🥀\n\n` +
        "🎶 Wᴇʟᴄᴏᴍᴇ ᴛᴏ Fʀᴏᴢᴇɴ 🥀 ᴍᴜsɪᴄ! 🎵\n\n" +
        "➻ 🚀 A Sᴜᴘᴇʀғᴀsᴛ & Pᴏᴡᴇʀғᴜʟ Tᴇʟᴇɢʀᴀᴍ Mᴜsɪᴄ Bᴏᴛ ᴡɪᴛʜ ᴀᴍᴀᴢɪɴɢ ғᴇᴀᴛᴜʀᴇs. ✨\n\n" +
        "🎧 Sᴜᴘᴘᴏʀᴛᴇᴅ Pʟᴀᴛғᴏʀᴍs: ʏᴏᴜᴛᴜʙᴇ, sᴘᴏᴛɪғʏ, ʀᴇssᴏ, ᴀᴘᴘʟᴇ ᴍᴜsɪᴄ, sᴏᴜɴᴅᴄʟᴏᴜᴅ.\n\n" +
        "🔹 Kᴇʏ Fᴇᴀᴛᴜʀᴇs:\n" +
        "🎵 Playlist Support for your favorite tracks.\n" +
        "🤖 AI Chat for engaging conversations.\n" +
        "🖼️ Image Generation with AI creativity.\n" +
        "👥 Group Management tools for admins.\n" +
        "💡 And many more exciting features!\n\n" +
        `**Uptime:** \`${formatUptime(uptimeSeconds)}\`\n\n` +
        "──────────────────\n" +
        "๏ ᴄʟɪᴄᴋ ᴛʜᴇ ʜᴇʟᴘ ʙᴜᴛᴛᴏɴ ғᴏʀ ᴍᴏᴅᴜʟᴇ ᴀɴᴅ ᴄᴏᴍᴍᴀɴᴅ ɪɴғᴏ.."
      );
      const buttons = {
        inline_keyboard: [
          [
            { text: "➕ Add me", url: "https://t.me/vcmusiclubot?startgroup=true" },
            { text: "💬 Support", url: "https://t.me/Frozensupport1" }
          ],
          [
            { text: "❓ Help", callback_data: "show_help" }
          ]
        ]
      };
      if (startMessages[chatId]) {
        try {
          await editPhotoMessage(chatId, startMessages[chatId].message_id, "https://files.catbox.moe/kao3ip.jpeg", caption, buttons);
        } catch (error) {
          const msg = await sendPhoto(chatId, "https://files.catbox.moe/kao3ip.jpeg", caption, buttons);
          startMessages[chatId] = { message_id: msg.message_id };
        }
      } else {
        const msg = await sendPhoto(chatId, "https://files.catbox.moe/kao3ip.jpeg", caption, buttons);
        startMessages[chatId] = { message_id: msg.message_id };
      }
    } catch (error) {
      await sendMessage(chatId, `Error processing /start: ${error.message}`);
    }
    return new Response('OK', { status: 200 });
  }
  

  try {
    if (['/play', '/stop', '/pause', '/resume', '/skip', '/end'].some(cmd => text.startsWith(cmd))) {
      processingMsg = await sendMessage(chatId, 'Processing...');
    }
  } catch (error) {
    console.error("Error sending processing message:", error);
  }
  

  if (text.startsWith('/play')) {
    const parts = text.split(' ');
    if (parts.length < 2) {
      if (processingMsg) {
        await updateMessage(chatId, processingMsg.message_id, 'Please provide a song title. Usage: /play <song name>');
      } else {
        await sendMessage(chatId, 'Please provide a song title. Usage: /play <song name>');
      }
      return new Response('OK', { status: 200 });
    }
    const queryTitle = parts.slice(1).join(' ');
    try {
      await ensureAssistantInChat(chat);
      const songData = await getSongDetails(queryTitle);
      const durationValue = songData.duration || "PT0S";
      const humanDuration = formatDuration(durationValue);
      const song = {
        title: songData.title,
        link: songData.link,
        duration: songData.duration,
        humanDuration: humanDuration,
        thumbnail: songData.thumbnail,
        requester: message.from ? message.from.first_name : "Unknown"
      };

      if (!isPlaying) {
        isPlaying = true;
        await playSong(chatId, song, processingMsg);
      } else {
        songQueue.push({ song, chatId, processingMsg });
        await sendQueueMessage(chatId, song, song.requester, songQueue.length - 1);
        await updateMessage(chatId, processingMsg.message_id, "");
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        await updateMessage(chatId, processingMsg.message_id, 'Timed out while searching for the song');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error: ${error.message}`);
      }
    }
  }
  else if (text.startsWith('/stop') || text.startsWith('/end')) {
    const stoppedBy = message.from.first_name || "Someone";
    songQueue = [];
    isPlaying = false;
    const stopUrl = `${API_BASE_URL}/stop?chatid=${encodeURIComponent(chatId)}`;
    try {
      const stopResponse = await fetchWithTimeout(stopUrl, {}, 20000);
      const stopData = await stopResponse.json();
      if (stopResponse.ok) {
        await updateMessage(chatId, processingMsg.message_id, `Stopped playing and cleared the queue (stopped by ${stoppedBy}).`);
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error stopping playback: ${stopData.error}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        await updateMessage(chatId, processingMsg.message_id, 'Timed out');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error: ${error.message}`);
      }
    }
  }
  else if (text.startsWith('/skip')) {
    const skippedBy = message.from.first_name || "Someone";
    try {
      const stopUrl = `${API_BASE_URL}/stop?chatid=${encodeURIComponent(chatId)}`;
      try {
        const stopResponse = await fetchWithTimeout(stopUrl, {}, 20000);
        const stopData = await stopResponse.json();
        if (!stopResponse.ok) {
          console.error("Stop API error:", stopData.error);
        }
      } catch (stopError) {
        console.error("Error during stop API call:", stopError);
      }
    } catch (outerError) {
      console.error("Unexpected error while stopping:", outerError);
    }
    isPlaying = false;
    if (songQueue.length > 0) {
      const nextSongItem = songQueue.shift();
      await playSong(chatId, nextSongItem.song, nextSongItem.processingMsg);
      await updateMessage(chatId, processingMsg.message_id, `Skipped to next song (skipped by ${skippedBy}).`);
    } else {
      await updateMessage(
        chatId,
        processingMsg.message_id,
        `Skipped the current song (skipped by ${skippedBy}). No more songs in the queue, playback stopped.`
      );
    }
  }
  else if (text.startsWith('/pause')) {
    const pauseUrl = `${API_BASE_URL}/pause?chatid=${encodeURIComponent(chatId)}`;
    try {
      const pauseResponse = await fetchWithTimeout(pauseUrl, {}, 20000);
      const pauseData = await pauseResponse.json();
      if (pauseResponse.ok) {
        await updateMessage(chatId, processingMsg.message_id, 'Paused playback.');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error pausing playback: ${pauseData.error}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        await updateMessage(chatId, processingMsg.message_id, 'Timed out');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error: ${error.message}`);
      }
    }
  }
  else if (text.startsWith('/resume')) {
    const resumeUrl = `${API_BASE_URL}/resume?chatid=${encodeURIComponent(chatId)}`;
    try {
      const resumeResponse = await fetchWithTimeout(resumeUrl, {}, 20000);
      const resumeData = await resumeResponse.json();
      if (resumeResponse.ok) {
        await updateMessage(chatId, processingMsg.message_id, 'Resumed playback.');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error resuming playback: ${resumeData.error}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        await updateMessage(chatId, processingMsg.message_id, 'Timed out');
      } else {
        await updateMessage(chatId, processingMsg.message_id, `Error: ${error.message}`);
      }
    }
  }
  
  return new Response('OK', { status: 200 });
}

