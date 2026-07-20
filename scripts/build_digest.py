import os
import json
from jinja2 import Template

def generate_weekly_data():
    return {
        "week_ending": "2026-07-26",
        "highlights": {
            "last_week": "The 2026 FIFA World Cup reached its climax on Sunday 19 July at MetLife Stadium, crowning the new world champions after a 39-day tournament across North America.",
            "this_week": "The 2026 Tour de France enters its brutal final mountain stretch through the Alps before the traditional sprint finish on the Champs-Élysées in Paris this Sunday, 26 July."
        },
        "sports_cards": [
            {
                "sport": "Football",
                "icon": "⚽",
                "event": "FIFA World Cup 2026",
                "status": "Concluded (19 July 2026)",
                "details": "The expanded 48-team tournament wrapped up after six weeks of action across Canada, Mexico, and the United States. Following 104 matches, world football's biggest prize was awarded in New Jersey.",
                "previous_winner": "Argentina (2022)"
            },
            {
                "sport": "Cycling",
                "icon": "🚴",
                "event": "Tour de France 2026",
                "status": "In Progress (Finishes 26 July 2026)",
                "details": "The peloton tackles high-altitude Alpine passes this week before Sunday's final ceremonial and sprint leg into Paris. General Classification contenders face their final opportunities on the mountain summits.",
                "previous_winner": "Tadej Pogačar (2025 — 4th title)"
            }
        ]
    }

def build_email_html(data):
    template_str = """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #2d3748; max-width: 650px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 8px; margin-bottom: 15px;">🏆 Weekly Sports Digest</h1>
        <p style="color: #718096; font-size: 14px;"><strong>Week Ending:</strong> {{ data.week_ending }}</p>
        
        <!-- Highlights Box -->
        <div style="background-color: #ebf8ff; border-left: 4px solid #3182ce; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
            <h2 style="color: #2b6cb0; margin-top: 0; font-size: 18px;">✨ This Week's Highlights</h2>
            <p style="margin-bottom: 10px;"><strong>Last Week:</strong> {{ data.highlights.last_week }}</p>
            <p style="margin-bottom: 0;"><strong>This Week:</strong> {{ data.highlights.this_week }}</p>
        </div>

        <!-- Sport Cards -->
        <h2 style="color: #1a365d; font-size: 18px; margin-top: 25px;">🏅 Featured Sports</h2>
        {% for card in data.sports_cards %}
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; background-color: #ffffff;">
                <div style="border-bottom: 1px solid #edf2f7; padding-bottom: 8px; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: #2d3748; font-size: 16px;">{{ card.icon }} {{ card.sport }} — {{ card.event }}</h3>
                    <span style="font-size: 12px; color: #718096;"><strong>Status:</strong> {{ card.status }}</span>
                </div>
                <p style="margin: 0 0 12px 0; font-size: 14px;">{{ card.details }}</p>
                <div style="background-color: #f7fafc; padding: 6px 10px; border-radius: 4px; font-size: 12px; color: #4a5568;">
                    🏆 <strong>Previous Winner:</strong> {{ card.previous_winner }}
                </div>
            </div>
        {% endfor %}

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0 15px 0;">
        <p style="font-size: 11px; color: #a0aec0; text-align: center;">Generated automatically via GitHub Actions</p>
    </body>
    </html>
    """
    return Template(template_str).render(data=data)

def main():
    data = generate_weekly_data()

    # Save JSON for Web Dashboard
    os.makedirs("docs/data", exist_ok=True)
    with open("docs/data/latest.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # Save Email HTML
    html_body = build_email_html(data)
    with open("docs/email.html", "w", encoding="utf-8") as f:
        f.write(html_body)

    print(f"Digest generated for week ending {data['week_ending']}.")

if __name__ == "__main__":
    main()