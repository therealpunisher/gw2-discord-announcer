import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const RESET_ROLE_ID = process.env.RESET_ROLE_ID || "";

const API_BASE = "https://api.guildwars2.com/v2";
const GREECE_TIMEZONE = "Europe/Athens";

const BOARD_MARKER = "GW2_DAILY_BOARD_MARKER";
const PING_MARKER = "GW2_DAILY_RESET_PING";

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

function greeceDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GREECE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function nextResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

function lastResetUtc() {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(0, 0, 0, 0);
  return reset;
}

function minutesSinceLastReset() {
  return Math.floor((new Date() - lastResetUtc()) / 60000);
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

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

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
  const data = await api("/achievements/daily");

  if (!data?.fractals) {
    return {
      status: "unreliable",
      dailies: [],
      recommendeds: []
    };
  }

  const ids = data.fractals.map(f => f.id).filter(Boolean);
  const names = await getAchievementNames(ids);

  if (!names.length) {
    return {
      status: "unreliable",
      dailies: [],
      recommendeds: []
    };
  }

  const dailies = [];
  const recommendeds = [];

  for (const name of names) {
    const clean = cleanFractalName(name);

    if (name.toLowerCase().includes("recommended")) {
      recommendeds.push(clean);
    } else {
      dailies.push(clean);
    }
  }

  return {
    status: "available",
    dailies,
    recommendeds
  };
}

function cleanFractalName(name) {
  return name
    .replace(/Daily Recommended Fractal[—-]\s*/i, "")
    .replace(/Daily Fractal[—-]\s*/i, "")
    .replace(/Daily\s+/i, "")
    .trim();
}

function formatList(items, fallback = "Updates haven’t been made yet.") {
  if (!items || items.length === 0) return `• ${fallback}`;
  return items.map(item => `• ${item}`).join("\n");
}

function shortText(text) {
  if (!text) return "—";
  return text.length > 1024 ? text.slice(0, 1020) + "..." : text;
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("PSNA Wiki")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Link)
      .setURL("https://wiki.guildwars2.com/wiki/Pact_Supply_Network_Agent"),

    new ButtonBuilder()
      .setLabel("Strike Wiki")
      .setEmoji("👹")
      .setStyle(ButtonStyle.Link)
      .setURL("https://wiki.guildwars2.com/wiki/Strike_Mission"),

    new ButtonBuilder()
      .setLabel("Fractal Wiki")
      .setEmoji("🌀")
      .setStyle(ButtonStyle.Link)
      .setURL("https://wiki.guildwars2.com/wiki/Fractals_of_the_Mists"),

    new ButtonBuilder()
      .setLabel("Daily Reset")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Link)
      .setURL("https://wiki.guildwars2.com/wiki/Server_reset")
  );
}

async function deleteOldBoardMessages(channel, client) {
  const messages = await channel.messages.fetch({ limit: 50 });

  const oldMessages = messages.filter(message =>
    message.author.id === client.user.id &&
    message.embeds.some(embed =>
      embed.description?.includes(BOARD_MARKER) ||
      embed.footer?.text?.includes(BOARD_MARKER)
    )
  );

  for (const message of oldMessages.values()) {
    await message.delete().catch(() => {});
  }
}

async function sendResetPingIfNeeded(channel, client) {
  if (!RESET_ROLE_ID) return;

  const mins = minutesSinceLastReset();

  if (mins < 0 || mins > 20) return;

  const todayKey = greeceDateKey();
  const pingKey = `${PING_MARKER}_${todayKey}`;

  const messages = await channel.messages.fetch({ limit: 100 });

  const alreadyPinged = messages.some(message =>
    message.author.id === client.user.id &&
    message.content.includes(pingKey)
  );

  if (alreadyPinged) return;

  await channel.send({
    content:
      `<@&${RESET_ROLE_ID}> 🔄 **Daily reset is live!**\n` +
      `New PSNA, Strike, and Fractal rotation is available.\n\n` +
      `||${pingKey}||`
  });
}

async function buildEmbed() {
  const reset = nextResetUtc();
  const fractals = await getFractals();

  const psnaToday = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length)];
  const psnaTomorrow = PSNA_ROTATION[rotationIndex(PSNA_ROTATION.length, 1)];

  const strikeToday = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length)];
  const strikeTomorrow = DAILY_STRIKES[rotationIndex(DAILY_STRIKES.length, 1)];

  const fractalStatus =
    fractals.status === "available"
      ? "🟢 **Available**"
      : "🟡 **Unreliable right now**";

  const fractalText =
    fractals.status === "available"
      ? `**Status:** ${fractalStatus}\n\n` +
        `🌀 **Dailies**\n${formatList(fractals.dailies)}\n\n` +
        `⭐ **Recommendeds**\n${formatList(fractals.recommendeds)}`
      : `**Status:** ${fractalStatus}\n\n` +
        `• Fractal updates haven’t refreshed yet.\n` +
        `• This section will update automatically when the data is available.`;

  return new EmbedBuilder()
    .setColor(0xf2b632)
    .setTitle("⚔️ Guild Wars 2 Daily Board")
    .setDescription(
      `🕒 **Now:** ${greeceTime()}\n` +
      `🔄 **Reset:** ${greeceTime(reset)}\n` +
      `⏳ **Time Left:** **${timeUntil(reset)}**\n\n` +
      `${BOARD_MARKER}`
    )
    .setThumbnail("https://wiki.guildwars2.com/images/thumb/9/93/GW2Logo_new.png/128px-GW2Logo_new.png")
    .addFields(
      {
        name: "🛒 **PSNA**",
        value:
          `📍 **Today:** ${psnaToday}\n` +
          `➡️ **Tomorrow:** ${psnaTomorrow}\n\n` +
          `**What is it?**\n` +
          `A daily rotating **Pact Supply Network Agent** vendor.`,
        inline: false
      },
      {
        name: "👹 **Daily Strike**",
        value:
          `🎯 **Today:** ${strikeToday}\n` +
          `➡️ **Tomorrow:** ${strikeTomorrow}\n\n` +
          `**What is it?**\n` +
          `A **10-player boss mission** with daily rewards.`,
        inline: false
      },
      {
        name: "🌀 **Fractals**",
        value: shortText(fractalText),
        inline: false
      },
      {
        name: "📌 **Quick View**",
        value:
          `🛒 **PSNA:** ${psnaToday}\n` +
          `👹 **Strike:** ${strikeToday}\n` +
          `🌀 **Fractals:** ${fractals.status === "available" ? "Available" : "Unreliable"}`,
        inline: false
      },
      {
        name: "🕘 **Last Updated**",
        value: `**${greeceTime()}**`,
        inline: false
      }
    )
    .setFooter({
      text: `GW2 Daily Board • ${BOARD_MARKER}`
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

      await sendResetPingIfNeeded(channel, client);

      const embed = await buildEmbed();
      const buttons = buildButtons();

      await deleteOldBoardMessages(channel, client);
      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

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
