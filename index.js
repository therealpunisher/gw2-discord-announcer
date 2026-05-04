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
  "Voice & Claw",
  "Boneskinner",
  "Whisper of Jormag"
];

function nowGreece() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GREECE_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function formatGreeceTime(date) {
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
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return api(path, retries - 1);
    }

    return null;
  }
}

async function getAchievementNames(entries) {
  if (!entries || entries.length === 0) return [];

  const ids = entries.map(entry => entry.id).filter(Boolean);
  if (ids.length === 0) return [];

  const achievements = await api(`/achievements?ids=${ids.join(",")}`);
  if (!achievements) return [];

  return entries.map(entry => {
    const achievement = achievements.find(a => a.id === entry.id);
    return achievement?.name ?? `Achievement ${entry.id}`;
  });
}

async function getFractals() {
  const daily = await api("/achievements/daily");

  if (!daily?.fractals) {
    return [];
  }

  return getAchievementNames(daily.fractals);
}

function cleanFractalName(name) {
  return name
    .replace(/Daily Recommended Fractal[—-]\s*/i, "")
    .replace(/Daily Fractal[—-]\s*/i, "")
    .replace(/Daily\s+/i, "")
    .trim();
}

function formatFractals(names) {
  if (!names || names.length === 0) {
    return "🌀 **Fractals:** updating soon";
  }

  const recommended = [];
  const dailies = [];

  for (const name of names) {
    const cleaned = cleanFractalName(name);

    if (name.toLowerCase().includes("recommended")) {
      recommended.push(cleaned);
    } else {
      dailies.push(cleaned);
    }
  }

  const parts = [];

  if (dailies.length > 0) {
    parts.push(`🌀 **Dailies**\n${dailies.map(x => `• ${x}`).join("\n")}`);
  }

  if (recommended.length > 0) {
    parts.push(`⭐ **Recommendeds**\n${recommended.map(x => `• ${x}`).join("\n")}`);
  }

  return parts.join("\n\n") || "🌀 **Fractals:** updating soon";
}

function shortText(text) {
  if (!text) return "—";
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

  return new EmbedBuilder()
    .setColor(0xf2b632)
    .setTitle("⚔️ **Guild Wars 2 Daily Board**")
    .setDescription(
      `🕒 **Now:** ${nowGreece()}\n` +
      `🔄 **Reset:** ${formatGreeceTime(reset)}\n` +
      `⏳ **Time left:** ${timeUntil(reset)}\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "🌀 **Fractals**",
        value: shortText(formatFractals(fractals)),
        inline: false
      },
      {
        name: "🛒 **PSNA**",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}`,
        inline: true
      },
      {
        name: "👹 **Strike**",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}`,
        inline: true
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
