import os
import json
import datetime
from jinja2 import Template

def generate_sample_data():
    today = datetime.date.today().strftime("%Y-%m-%d")
    return {
        "week_ending": today,
        "dashboard": [
            {"event": "EPL Season Opener", "status": "Commencing", "detail": "Pre-season wraps up; Matchday 1 kicks off this weekend."},
            {"event": "AFL Round 20", "status": "Ongoing", "detail": "Top 8 battle intensifies in the final stretch."},
            {"event": "The Open Championship", "status": "Concluding", "detail": "Final round wrapped up at Royal Birkdale."}
        ],
        "surprises": [
            {
                "title": "All-Ireland Senior Hurling Final",
                "location": "Dublin, Ireland",
                "description": "One of Europe's fastest, most intense amateur field sports crowns its champion at a packed Croke Park."
            }
        ]
    }

def build_email_html(data):
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

    # 1. Save JSON for GitHub Pages Dashboard
    os.makedirs("docs/data", exist_ok=True)
    with open("docs/data/latest.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 2. Save rendered HTML email to file
    html_body = build_email_html(data)
    with open("docs/email.html", "w", encoding="utf-8") as f:
        f.write(html_body)

    print("Data and email template built successfully.")

if __name__ == "__main__":
    main()