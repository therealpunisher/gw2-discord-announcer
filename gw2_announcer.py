import os
import requests


def post(webhook, title, description, url=None):
    if not webhook:
        print(f"Missing webhook for {title}")
        return

    embed = {
        "title": title,
        "description": description
    }

    if url:
        embed["url"] = url

    payload = {
        "embeds": [embed]
    }

    try:
        r = requests.post(
            webhook,
            json=payload,
            timeout=15
        )

        print(
            f"{title} -> {r.status_code}"
        )

    except Exception as e:
        print(
            f"Error posting {title}: {e}"
        )


def test_scheduled_channels():

    post(
        os.getenv(
            "WEBHOOK_DAILY_RESET"
        ),
        "🕒 Test Daily Reset",
        "Daily reset reminder channel is working."
    )

    post(
        os.getenv(
            "WEBHOOK_WEEKLY_RESET"
        ),
        "📅 Test Weekly Reset",
        "Weekly reset reminder channel is working."
    )

    post(
        os.getenv(
            "WEBHOOK_WVW_RESET"
        ),
        "⚔️ Test WvW Reset",
        "WvW reset reminder channel is working."
    )

    post(
        os.getenv(
            "WEBHOOK_GUILD_REMINDERS"
        ),
        "🏰 Test Guild Reminder",
        "Guild reminder channel is working."
    )


def main():
    test_scheduled_channels()


if __name__ == "__main__":
    main()
