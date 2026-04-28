import os
import requests


def post(webhook, title, description, url=None):
    if not webhook:
        print(f"Missing webhook for: {title}")
        return

    embed = {
        "title": title,
        "description": description[:3500],
    }

    if url:
        embed["url"] = url

    payload = {"embeds": [embed]}

    try:
        response = requests.post(webhook, json=payload, timeout=15)
        print(f"{title}: {response.status_code}")
    except Exception as e:
        print(f"Failed to post webhook for {title}: {e}")


def test_all_webhooks():
    tests = {
        "WEBHOOK_GAME_UPDATES": "📢 Test Game Updates",
        "WEBHOOK_PATCH_NOTES": "🛠️ Test Patch Notes",
        "WEBHOOK_FESTIVALS": "🎉 Test Festivals",
        "WEBHOOK_BONUS_EVENTS": "⭐ Test Bonus Events",
        "WEBHOOK_LIVESTREAMS": "🔴 Test Livestreams",
        "WEBHOOK_DAILY_RESET": "🕒 Test Daily Reset",
        "WEBHOOK_WEEKLY_RESET": "📅 Test Weekly Reset",
        "WEBHOOK_WORLD_BOSSES": "🐉 Test World Bosses",
        "WEBHOOK_WVW_RESET": "⚔️ Test WvW Reset",
        "WEBHOOK_DAILIES": "✅ Test Dailies",
        "WEBHOOK_FRACTALS": "🌀 Test Fractals",
        "WEBHOOK_STRIKES": "⚔️ Test Strikes",
        "WEBHOOK_GEMSTORE": "💎 Test Gem Store",
        "WEBHOOK_ECONOMY": "💰 Test Economy",
        "WEBHOOK_BLACKLION": "🦁 Test Black Lion",
        "WEBHOOK_GUILD_REMINDERS": "🏰 Test Guild Reminders",
    }

    for env_name, title in tests.items():
        webhook = os.getenv(env_name)
        post(
            webhook,
            title,
            "Webhook is working. This is a test message from your GW2 Discord Announcer."
        )


def main():
    test_all_webhooks()


if __name__ == "__main__":
    main()
