import os
import json
import hashlib
import datetime
import feedparser
import requests

STATE_FILE = "state.json"

# =========================
# Discord Webhook Helper
# =========================

def post(webhook, title, description, url=None):
    if not webhook:
        return

    embed = {
        "title": title,
        "description": description[:3500],
    }

    if url:
        embed["url"] = url

    payload = {"embeds": [embed]}

    try:
        requests.post(webhook, json=payload, timeout=15)
    except Exception as e:
        print(f"Failed to post webhook: {e}")


# =========================
# State / Duplicate Control
# =========================

def load_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"posted": []}


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def item_id(entry):
    raw = entry.get("id") or entry.get("link") or entry.get("title")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# =========================
# RSS Feeds
# =========================

FEEDS = {
    "game_updates": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GAME_UPDATES"),
        "keywords": []
    },
    "patch_notes": {
        "url": "https://en-forum.guildwars2.com/categories/game-release-notes/feed.rss",
        "webhook": os.getenv("WEBHOOK_PATCH_NOTES"),
        "keywords": []
    },
    "festivals": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_FESTIVALS"),
        "keywords": [
            "festival",
            "dragon bash",
            "wintersday",
            "halloween",
            "mad king",
            "four winds",
            "super adventure",
            "lunar new year"
        ]
    },
    "bonus_events": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BONUS_EVENTS"),
        "keywords": [
            "bonus event",
            "bonus xp",
            "world boss rush",
            "wvw rush",
            "fractal rush",
            "return to",
            "rush event"
        ]
    },
    "livestreams": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_LIVESTREAMS"),
        "keywords": [
            "livestream",
            "live stream",
            "guild chat",
            "arenanet live",
            "twitch"
        ]
    },
    "gemstore": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GEMSTORE"),
        "keywords": [
            "gem store",
            "gemstore",
            "sale",
            "discount",
            "new in the gem store"
        ]
    },
    "blacklion": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BLACKLION"),
        "keywords": [
            "black lion",
            "black lion chest",
            "black lion key",
            "black lion trading company"
        ]
    }
}


def matches(entry, keywords):
    if not keywords:
        return True

    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    return any(keyword.lower() in text for keyword in keywords)


def check_rss():
    state = load_state()

    for name, cfg in FEEDS.items():
        feed = feedparser.parse(cfg["url"])

        for entry in reversed(feed.entries[:10]):
            uid = f"{name}:{item_id(entry)}"

            if uid in state["posted"]:
                continue

            if not matches(entry, cfg["keywords"]):
                continue

            title = entry.get("title", "Guild Wars 2 Update")
            summary = entry.get("summary", "New Guild Wars 2 announcement.")
            link = entry.get("link")

            post(
                cfg["webhook"],
                f"📢 {title}",
                summary,
                link
            )

            state["posted"].append(uid)

    state["posted"] = state["posted"][-500:]
    save_state(state)


# =========================
# Scheduled Reminders
# GitHub Actions uses UTC time
# =========================

def scheduled_messages():
    now = datetime.datetime.utcnow()
    weekday = now.weekday()  # Monday = 0, Friday = 4

    # Daily reset reminder
    if now.hour == 23 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_DAILY_RESET"),
            "🕒 Daily Reset Reminder",
            "Daily reset is coming soon. Finish your dailies, Wizard's Vault tasks, and daily fractals."
        )

    # Weekly reset reminder, Monday UTC
    if weekday == 0 and now.hour == 8 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WEEKLY_RESET"),
            "📅 Weekly Reset",
            "Weekly raids, strikes, weekly achievements, and other weekly content have reset."
        )

    # WvW reset reminder, Friday UTC
    if weekday == 4 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_WVW_RESET"),
            "⚔️ WvW Reset Reminder",
            "WvW reset is coming soon. Get your squad ready."
        )

    # Guild reminder example, Sunday UTC
    if weekday == 6 and now.hour == 18 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_GUILD_REMINDERS"),
            "🏰 Guild Reminder",
            "Guild missions / guild activities reminder. Adjust this message in the script."
        )


# =========================
# World Boss Reminders
# Times are UTC
# Edit these based on your preferred boss schedule
# =========================

WORLD_BOSS_ALERTS = [
    ("Tequatl the Sunless", "23:30"),
    ("Triple Trouble", "18:30"),
]


def world_boss_messages():
    now = datetime.datetime.utcnow().replace(second=0, microsecond=0)

    for boss, boss_time_str in WORLD_BOSS_ALERTS:
        hour, minute = map(int, boss_time_str.split(":"))

        boss_time = now.replace(hour=hour, minute=minute)
        alert_time = boss_time - datetime.timedelta(minutes=30)

        if now.hour == alert_time.hour and now.minute < 30 and now.minute >= alert_time.minute:
            post(
                os.getenv("WEBHOOK_WORLD_BOSSES"),
                f"🐉 {boss} in 30 minutes",
                f"{boss} begins soon. Get to the map early."
            )


# =========================
# GW2 Daily API
# =========================

def daily_achievements():
    now = datetime.datetime.utcnow()

    # Posts once per day after reset window
    if now.hour != 0 or now.minute >= 30:
        return

    try:
        r = requests.get("https://api.guildwars2.com/v2/achievements/daily", timeout=15)
        data = r.json()

        pve = data.get("pve", [])
        pvp = data.get("pvp", [])
        wvw = data.get("wvw", [])
        fractals = data.get("fractals", [])

        message = (
            f"PvE dailies: {len(pve)} available\n"
            f"PvP dailies: {len(pvp)} available\n"
            f"WvW dailies: {len(wvw)} available\n"
            f"Fractal dailies: {len(fractals)} available\n\n"
            "Open the game or check a GW2 daily tracker for exact achievement names."
        )

        post(
            os.getenv("WEBHOOK_DAILIES"),
            "✅ Daily Achievements Updated",
            message
        )

        if fractals:
            post(
                os.getenv("WEBHOOK_FRACTALS"),
                "🌀 Daily Fractals Updated",
                f"{len(fractals)} daily fractal achievements are available today."
            )

    except Exception as e:
        print(f"Failed to fetch daily achievements: {e}")


# =========================
# Strike Rotation Placeholder
# =========================

def strike_rotation_reminder():
    now = datetime.datetime.utcnow()
    weekday = now.weekday()

    if weekday == 0 and now.hour == 8 and now.minute < 30:
        post(
            os.getenv("WEBHOOK_STRIKES"),
            "⚔️ Weekly Strike Rotation",
            "Weekly strike rewards have reset. Check the current strike rotation in-game."
        )


# =========================
# Economy Alerts
# Mystic Coin + Ectoplasm example
# =========================

ECONOMY_ITEMS = {
    19976: "Mystic Coin",
    19721: "Glob of Ectoplasm",
}


def economy_alerts():
    now = datetime.datetime.utcnow()

    # Check once per day
    if now.hour != 12 or now.minute >= 30:
        return

    ids = ",".join(str(i) for i in ECONOMY_ITEMS.keys())
    url = f"https://api.guildwars2.com/v2/commerce/prices?ids={ids}"

    try:
        r = requests.get(url, timeout=15)
        prices = r.json()

        lines = []

        for item in prices:
            item_id_value = item["id"]
            name = ECONOMY_ITEMS.get(item_id_value, f"Item {item_id_value}")

            buy_price = item["buys"]["unit_price"]
            sell_price = item["sells"]["unit_price"]

            lines.append(
                f"**{name}**\n"
                f"Buy order: {buy_price / 10000:.2f}g\n"
                f"Sell price: {sell_price / 10000:.2f}g"
            )

        post(
            os.getenv("WEBHOOK_ECONOMY"),
            "💰 Daily Economy Snapshot",
            "\n\n".join(lines)
        )

    except Exception as e:
        print(f"Failed to fetch economy prices: {e}")


# =========================
# Main
# =========================

def main():
    check_rss()
    scheduled_messages()
    world_boss_messages()
    daily_achievements()
    strike_rotation_reminder()
    economy_alerts()


if __name__ == "__main__":
    main()
