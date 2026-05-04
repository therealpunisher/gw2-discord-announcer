import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const API_BASE = "https://api.guildwars2.com/v2";
const GREECE_TIMEZONE = "Europe/Athens";
const MARKER = "GW2_DAILY_BOARD_MARKER";

if (!TOKEN || !CHANNEL_ID) {
  throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID");
}

const PSNA_ROTATION = [
  "Plains of Ashford",
  "Wayfarer Foothills",
  "Queensdale",
  "Metrica Province",
  "Caledon Forest",
  "Lion's Arch"
];

const DAILY_STRIKES = [
  "Shiverpeaks Pass",
  "Fraenir of Jormag",
  "Voice of the Fallen and Claw of the Fallen",
  "Boneskinner",
  "Whisper of Jormag",
  "Cold War"
];

function greeceTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GREECE_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function timeUntil(date) {
  const ms = date - new Date();

  if (ms <= 0) return "now";

  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);

  return `${h}h ${m}m`;
}

function rotationIndex(length, offset = 0) {
  const start = Math.floor(Date.UTC(2024, 0, 1) / 86400000);
  const today = Math.floor(Date.now() / 86400000);

  return ((today - start + offset) % length + length) % length;
}

async function api(path, retries = 2) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "User-Agent": "GW2 Daily Board"
      }
    });

    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return api(path, retries - 1);
    }

    return null;
  }
}

async function getAchievementNames(ids) {
  if (!ids || ids.length === 0) return [];

  const achievements = await api(`/achievements?ids=${ids.join(",")}`);

  if (!achievements) return [];

  return achievements.map(a => a.name || `Achievement ${a.id}`);
}

async function getFractals() {
  const category = await api("/achievements/categories/88?v=latest");

  if (!category?.achievements) {
    return {
      dailies: [],
      recommendeds: [],
      available: false
    };
  }

  const names = await getAchievementNames(category.achievements);

  if (!names.length) {
    return {
      dailies: [],
      recommendeds: [],
      available: false
    };
  }

  const dailyNames = names.filter(name =>
    name.toLowerCase().includes("daily") &&
    !name.toLowerCase().includes("tomorrow")
  );

  const dailies = [];
  const recommendeds = [];

  for (const name of dailyNames) {
    const clean = cleanFractalName(name);

    if (name.toLowerCase().includes("recommended")) {
      recommendeds.push(clean);
    } else {
      dailies.push(clean);
    }
  }

  return {
    dailies,
    recommendeds,
    available: dailies.length > 0 || recommendeds.length > 0
  };
}

function cleanFractalName(name) {
  return name
    .replace(/Daily Recommended Fractal[—-]\s*/i, "")
    .replace(/Daily Fractal[—-]\s*/i, "")
    .replace(/Daily\s+/i, "")
    .trim();
}

function formatList(items) {
  if (!items || items.length === 0) return "• Currently unreliable / unavailable.";
  return items.map(item => `• ${item}`).join("\n");
}

function shortText(text) {
  if (!text) return "• Currently unreliable / unavailable.";
  return text.length > 1024 ? text.slice(0, 1020) + "..." : text;
}

async function deleteOldMessages(channel, client) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const oldMessages = messages.filter(message =>
    message.author.id === client.user.id &&
    message.embeds.some(embed =>
      embed.description?.includes(MARKER) ||
      embed.footer?.text?.includes(MARKER)
    )
  );

  for (const message of oldMessages.values()) {
    await message.delete().catch(() => {});
  }
}

async function buildEmbed() {
  const reset = nextResetUtc();

  const fractals = await getFractals();

  const psnaToday = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length)];
  const psnaTomorrow = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length, 1)];

  const strikeToday = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length)];
  const strikeTomorrow = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length, 1)];

  const fractalText = fractals.available
    ? `🌀 **Dailies**\n${formatList(fractals.dailies)}\n\n⭐ **Recommendeds**\n${formatList(fractals.recommendeds)}`
    : `🌀 **Fractals are currently unreliable / unavailable.**\nThe tracker will refresh them again after reset.`;

  return new EmbedBuilder()
    .setColor(0xf2b632)
    .setTitle("⚔️ Guild Wars 2 Daily Board")
    .setDescription(
      `🕒 **Now:** ${greeceTime()}\n` +
      `🔄 **Reset:** ${greeceTime(reset)}\n` +
      `⏳ **Time Left:** **${timeUntil(reset)}**\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "🌀 **Fractals**",
        value: shortText(fractalText),
        inline: false
      },
      {
        name: "🛒 **PSNA**",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}\n\n` +
          `**What is PSNA?**\n` +
          `A daily rotating **Pact Supply Network Agent** vendor.`,
        inline: false
      },
      {
        name: "👹 **Daily Strike**",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}\n\n` +
          `**What is a Strike?**\n` +
          `A **10-player boss mission** with daily rewards.`,
        inline: false
      }
    )
    .setFooter({
      text: `GW2 Daily Board • ${MARKER}`
    })
    .setTimestamp();
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once("clientReady", async () => {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      const embed = await buildEmbed();

      await deleteOldMessages(channel, client);
      await channel.send({ embeds: [embed] });

      console.log("Daily board posted.");
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      client.destroy();
    }
  });

  await client.login(TOKEN);
}

main();
