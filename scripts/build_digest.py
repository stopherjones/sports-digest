import os
import json
import datetime
import resend
from jinja2 import Template

# Set up Resend API key
resend.api_key = os.environ.get("RESEND_API_KEY", "")
user_email = os.environ.get("USER_EMAIL", "")

def generate_sample_data():
    """Generates structured sample data for the MVP pipeline."""
    today = datetime.date.today().strftime("%Y-%m-%d")
    return {
        "week_ending": today,
        "dashboard": [
            {"event": "EPL Season Opener", "status": "Commencing", "detail": "Pre-season wraps up; Matchday 1 kicks off this weekend."},
            {"event": "AFL Round 20", "status": "Ongoing", "detail": "Top 8 battle intensifies in the final stretch."},
            {"event": "The Open Championship", "status": "Concluding", "detail": "Final round wrapped up at Royal Birkdale."}
        ],
        "regional": {
            "Europe": "Pre-season friendlies in full flow while continental transfers dominate news cycles.",
            "Americas": "MLB approaching crucial August series; NFL training camps officially open.",
            "Asia_Pacific": "AFL heading into late-season drama; domestic T20 cricket leagues active."
        },
        "surprises": [
            {
                "title": "All-Ireland Senior Hurling Final",
                "location": "Dublin, Ireland",
                "description": "One of Europe's fastest, most intense amateur field sports crowns its champion at a packed Croke Park."
            }
        ]
    }

def build_email_html(data):
    """Renders data into a clean HTML email layout."""
    template_str = """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a365d; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">🏆 Weekly Sports Digest</h1>
        <p style="color: #666;"><strong>Week Ending:</strong> {{ data.week_ending }}</p>
        
        <h2 style="color: #2b6cb0;">Key Dashboard Movements</h2>
        <ul>
        {% for item in data.dashboard %}
            <li><strong>[{{ item.status }}] {{ item.event }}:</strong> {{ item.detail }}</li>
        {% endfor %}
        </ul>

        <h2 style="color: #2b6cb0;">Wildcard Event of the Week 🎯</h2>
        {% for s in data.surprises %}
            <div style="background-color: #f7fafc; border-left: 4px solid #4299e1; padding: 10px 15px; margin-bottom: 10px;">
                <h3 style="margin: 0 0 5px 0;">{{ s.title }} ({{ s.location }})</h3>
                <p style="margin: 0; color: #4a5568;">{{ s.description }}</p>
            </div>
        {% endfor %}

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #a0aec0;">Generated automatically via GitHub Actions.</p>
    </body>
    </html>
    """
    return Template(template_str).render(data=data)

def main():
    data = generate_sample_data()

    # 1. Save data for GitHub Pages Dashboard
    os.makedirs("docs/data", exist_ok=True)
    with open("docs/data/latest.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("Saved latest data to docs/data/latest.json")

    # 2. Render and send HTML email if credentials exist
    if resend.api_key and user_email:
        html_body = build_email_html(data)
        resend.Emails.send({
            "from": "Digest <onboarding@resend.dev>",
            "to": user_email,
            "subject": f"🏆 Global Sports Digest - {data['week_ending']}",
            "html": html_body
        })
        print(f"Digest email sent successfully to {user_email}")
    else:
        print("Skipped email sending: Missing RESEND_API_KEY or USER_EMAIL environment variables.")

if __name__ == "__main__":
    main()