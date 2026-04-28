import os
import json
import hashlib
import datetime
from zoneinfo import ZoneInfo

import feedparser
import requests

STATE_FILE = "state.json"


def post(webhook, title, description, url=None):
    if not webhook:
        print(f"Missing webhook for {title}")
        return

    embed = {
        "title": title,
        "description": description[:3500],
    }

    if url:
        embed["url"] = url

    try:
        r = requests.post(
            webhook,
            json={"embeds": [embed]},
            timeout=15
        )
        print(f"{title} -> {r.status_code}")

    except Exception as e:
        print(f"Error posting {title}: {e}")


def load_state():
    try:
        with open(
            STATE_FILE,
            "r",
            encoding="utf-8"
        ) as f:
            return json.load(f)

    except FileNotFoundError:
        return {
            "posted": [],
            "initialized": False
        }


def save_state(state):
    with open(
        STATE_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            state,
            f,
            indent=2
        )


def item_id(entry):
    raw = (
        entry.get("id")
        or entry.get("link")
        or entry.get("title", "")
    )

    return hashlib.sha256(
        raw.encode("utf-8")
    ).hexdigest()


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
            "mad king",
            "halloween",
            "four winds",
            "super adventure",
            "lunar new year",
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
            "fractal rush"
        ]
    },

    "gemstore": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_GEMSTORE"),
        "keywords": [
            "gem store",
            "sale",
            "discount"
        ]
    },

    "blacklion": {
        "url": "https://www.guildwars2.com/en/feed",
        "webhook": os.getenv("WEBHOOK_BLACKLION"),
        "keywords": [
            "black lion",
            "black lion chest"
        ]
    }
}


def matches(entry, keywords):
    if not keywords:
        return True

    text = (
        f"{entry.get('title','')} "
        f"{entry.get('summary','')}"
    ).lower()

    return any(
        k.lower() in text
        for k in keywords
    )


def check_rss():
    state = load_state()

    if "posted" not in state:
        state["posted"] = []

    first_run = not state.get(
        "initialized",
        False
    )

    for name, cfg in FEEDS.items():
        feed = feedparser.parse(
            cfg["url"]
        )

        for entry in reversed(
            feed.entries[:10]
        ):
            uid = (
                f"{name}:"
                f"{item_id(entry)}"
            )

            if uid in state["posted"]:
                continue

            if not matches(
                entry,
                cfg["keywords"]
            ):
                continue

            if first_run:
                state["posted"].append(uid)
                continue

            post(
                cfg["webhook"],
                f"📢 {entry.get('title','Guild Wars 2 Update')}",
                entry.get(
                    "summary",
                    "New update."
                ),
                entry.get("link")
            )

            state["posted"].append(uid)

    state["initialized"] = True
    state["posted"] = state["posted"][-500:]

    save_state(state)


def scheduled_messages():
    now = datetime.datetime.now(
        ZoneInfo("Europe/Athens")
    )

    weekday = now.weekday()

    # Daily reset reminder
    if (
        now.hour == 2
        and now.minute < 30
    ):
        post(
            os.getenv("WEBHOOK_DAILY_RESET"),
            "🕒 Daily Reset Reminder",
            "Daily reset in one hour."
        )

    # Weekly reset
    if (
        weekday == 0
        and now.hour == 11
        and now.minute < 30
    ):
        post(
            os.getenv("WEBHOOK_WEEKLY_RESET"),
            "📅 Weekly Reset",
            "Weekly content has reset."
        )

    # WvW reset
    if (
        weekday == 4
        and now.hour == 21
        and now.minute < 30
    ):
        post(
            os.getenv("WEBHOOK_WVW_RESET"),
            "⚔️ WvW Reset Reminder",
            "WvW reset in 1 hour."
        )


WORLD_BOSS_ALERTS = [
    ("Tequatl the Sunless", "21:30"),
    ("Triple Trouble", "20:30"),
]


def world_boss_messages():
    now = datetime.datetime.now(
        ZoneInfo("Europe/Athens")
    ).replace(
        second=0,
        microsecond=0
    )

    for boss, boss_time_str in WORLD_BOSS_ALERTS:
        hour, minute = map(
            int,
            boss_time_str.split(":")
        )

        boss_time = now.replace(
            hour=hour,
            minute=minute
        )

        alert_time = (
            boss_time
            - datetime.timedelta(minutes=30)
        )

        if (
            now.hour == alert_time.hour
            and alert_time.minute <= now.minute < alert_time.minute + 30
        ):
            post(
                os.getenv("WEBHOOK_WORLD_BOSSES"),
                f"🐉 {boss} in 30 minutes",
                f"{boss} begins soon."
            )


def daily_achievements():
    now = datetime.datetime.now(
        ZoneInfo("Europe/Athens")
    )

    if (
        now.hour != 3
        or now.minute >= 30
    ):
        return

    try:
        r = requests.get(
            "https://api.guildwars2.com/v2/achievements/daily",
            timeout=15
        )

        data = r.json()

        pve = len(
            data.get("pve", [])
        )

        fractals = len(
            data.get("fractals", [])
        )

        post(
            os.getenv("WEBHOOK_DAILIES"),
            "✅ Daily Achievements Updated",
            f"PvE dailies: {pve}"
        )

        post(
            os.getenv("WEBHOOK_FRACTALS"),
            "🌀 Daily Fractals Updated",
            f"{fractals} fractal dailies available."
        )

    except Exception as e:
        print(e)


ECONOMY_ITEMS = {
    19976: "Mystic Coin",
    19721: "Glob of Ectoplasm",
}


def economy_alerts():
    now = datetime.datetime.now(
        ZoneInfo("Europe/Athens")
    )

    if (
        now.hour != 15
        or now.minute >= 30
    ):
        return

    ids = ",".join(
        str(i)
        for i in ECONOMY_ITEMS.keys()
    )

    url = (
        "https://api.guildwars2.com/v2/commerce/prices?ids="
        + ids
    )

    try:
        r = requests.get(
            url,
            timeout=15
        )

        prices = r.json()

        lines = []

        for item in prices:
            name = ECONOMY_ITEMS[
                item["id"]
            ]

            buy_price = (
                item["buys"]["unit_price"]
                / 10000
            )

            sell_price = (
                item["sells"]["unit_price"]
                / 10000
            )

            lines.append(
                f"{name}\n"
                f"Buy {buy_price:.2f}g\n"
                f"Sell {sell_price:.2f}g"
            )

        post(
            os.getenv("WEBHOOK_ECONOMY"),
            "💰 Daily Economy Snapshot",
            "\n\n".join(lines)
        )

    except Exception as e:
        print(e)


def main():
    check_rss()
    scheduled_messages()
    world_boss_messages()
    daily_achievements()
    economy_alerts()


if __name__ == "__main__":
    main()
