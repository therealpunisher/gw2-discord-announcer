import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const GW2_API_ROOT = "https://api.guildwars2.com/";
const GW2_API = new URL("/v2", GW2_API_ROOT).toString();

const GREECE_TIMEZONE = "Europe/Athens";
const MARKER = "GW2_DAILIES_TRACKER_MESSAGE";

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

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function formatGreeceTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: GREECE_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function timeUntil(date) {
  const ms = date - new Date();

  if (ms <= 0) return "Resetting now";

  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);

  return `${h}h ${m}m`;
}

function rotationIndex(length, offset = 0) {
  const start = Math.floor(Date.UTC(2024, 0, 1) / 86400000);
  const today = Math.floor(Date.now() / 86400000);
  return ((today - start + offset) % length + length) % length;
}

async function gw2(path, retries = 3) {
  try {
    const url = `${GW2_API}${path}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "GW2 Discord Daily Tracker"
      }
    });

    if (!res.ok) {
      throw new Error(`GW2 API ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (err) {
    if (retries > 0) {
      console.log(`Retrying GW2 API... ${path} (${retries})`);
      await new Promise(resolve => setTimeout(resolve, 2500));
      return gw2(path, retries - 1);
    }

    console.error(`GW2 API failed for ${path}:`, err.message);
    return null;
  }
}

async function getAchievementDetails(entries) {
  if (!entries || entries.length === 0) return [];

  const ids = entries.map(entry => entry.id);
  const achievements = await gw2(`/achievements?ids=${ids.join(",")}`);

  if (!achievements) return [];

  return entries.map(entry => {
    const achievement = achievements.find(a => a.id === entry.id);

    return {
      id: entry.id,
      name: achievement?.name ?? `Achievement ${entry.id}`,
      requirement: achievement?.requirement ?? "",
      description: achievement?.description ?? "",
      level: entry.level ?? null
    };
  });
}

async function getFractalsToday() {
  const data = await gw2("/achievements/daily");

  if (!data || !data.fractals) {
    return [];
  }

  return getAchievementDetails(data.fractals);
}

function fractalTierFromName(name) {
  const match = name.match(/Scale\s+(\d+)/i);

  if (!match) return "Other";

  const scale = Number(match[1]);

  if (scale <= 25) return "T1";
  if (scale <= 50) return "T2";
  if (scale <= 75) return "T3";
  if (scale <= 100) return "T4";

  return "Other";
}

function cleanFractalName(name) {
  return name
    .replace("Daily Recommended Fractal—", "Recommended: ")
    .replace("Daily Recommended Fractal - ", "Recommended: ")
    .replace("Daily Fractal—", "")
    .replace("Daily Fractal - ", "")
    .trim();
}

function formatFractals(fractals) {
  if (!fractals || fractals.length === 0) {
    return (
      "⚠️ **Fractal data unavailable right now.**\n" +
      "The official GW2 daily endpoint sometimes fails.\n" +
      "The bot will try again on the next scheduled update."
    );
  }

  const recommended = [];
  const tiers = {
    T1: [],
    T2: [],
    T3: [],
    T4: [],
    Other: []
  };

  for (const fractal of fractals) {
    const cleaned = cleanFractalName(fractal.name);

    if (fractal.name.toLowerCase().includes("recommended")) {
      recommended.push(cleaned);
    } else {
      const tier = fractalTierFromName(fractal.name);
      tiers[tier].push(cleaned);
    }
  }

  let output = "";

  if (recommended.length > 0) {
    output += "⭐ **Recommended Fractals**\n";
    output += recommended.map(x => `> ${x}`).join("\n");
    output += "\n\n";
  }

  for (const [tier, items] of Object.entries(tiers)) {
    if (items.length > 0) {
      output += `🔹 **${tier} Daily Fractals**\n`;
      output += items.map(x => `> ${x}`).join("\n");
      output += "\n\n";
    }
  }

  return output.trim() || "No fractal data found.";
}

function shortText(text) {
  if (!text) return "No data.";
  return text.length > 1024 ? text.slice(0, 1020) + "..." : text;
}

async function deleteOldTrackerMessages(channel, client) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const oldMessages = messages.filter(message =>
    message.author.id === client.user.id &&
    message.embeds.some(embed =>
      embed.description && embed.description.includes(MARKER)
    )
  );

  for (const message of oldMessages.values()) {
    await message.delete().catch(error => {
      console.log(`Could not delete old tracker message: ${error.message}`);
    });
  }
}

async function buildEmbed() {
  const reset = nextResetUtc();

  const fractalsToday = await getFractalsToday();

  const psnaToday = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length)];
  const psnaTomorrow = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length, 1)];

  const strikeToday = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length)];
  const strikeTomorrow = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length, 1)];

  return new EmbedBuilder()
    .setColor(0xf6c343)
    .setAuthor({
      name: "Guild Wars 2 Daily Board",
      iconURL: "https://wiki.guildwars2.com/images/thumb/9/93/GW2Logo_new.png/64px-GW2Logo_new.png"
    })
    .setTitle("⚔️ Today’s Guild Wars 2 Rotation")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌍 **Region Time:** Greece / Europe Athens\n` +
      `🔄 **Next Reset:** **${formatGreeceTime(reset)}**\n` +
      `⏳ **Time Left:** **${timeUntil(reset)}**\n` +
      `🕒 **Auto Update:** Every 15 minutes\n` +
      `🧹 **Mode:** Deletes old tracker message + sends fresh one\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚠️ **Note:** Wizard’s Vault PvE / PvP / WvW dailies are not reliably available from the official API.\n\n` +
      `${MARKER}`
    )
    .addFields(
      {
        name: "🌀 Fractals",
        value: shortText(formatFractals(fractalsToday)),
        inline: false
      },
      {
        name: "🛒 Pact Supply Network Agent",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}\n\n` +
          `💡 Check the PSNA vendor for rotating map purchases.`,
        inline: false
      },
      {
        name: "👹 Daily Strike Mission",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}\n\n` +
          `💡 Good daily group content for prophet shards and strike rewards.`,
        inline: false
      },
      {
        name: "📌 Quick Reminders",
        value:
          `• Daily reset is based on **00:00 UTC**.\n` +
          `• Greece reset time changes with daylight saving time.\n` +
          `• This message refreshes automatically from GitHub Actions.\n` +
          `• If fractals say unavailable, the GW2 API is probably failing temporarily.`,
        inline: false
      }
    )
    .setFooter({
      text: "Guild Wars 2 Tracker • Fresh post mode"
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

      await deleteOldTrackerMessages(channel, client);
      await channel.send({ embeds: [embed] });

      console.log("Deleted old tracker message and sent a fresh one.");
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
