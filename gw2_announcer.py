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

        print(f"{title} -> {r.status_code}")

    except Exception as e:
        print(f"Error posting {title}: {e}")


def test_world_boss_alerts():

    post(
        os.getenv(
            "WEBHOOK_WORLD_BOSSES"
        ),
        "🐉 Tequatl in 30 minutes",
        "Test world boss alert. Move to Sparkfly Fen."
    )

    post(
        os.getenv(
            "WEBHOOK_WORLD_BOSSES"
        ),
        "⚠️ Triple Trouble begins soon",
        "Test world boss alert. Squad up."
    )


def main():
    test_world_boss_alerts()


if __name__ == "__main__":
    main()
