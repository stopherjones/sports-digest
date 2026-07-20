import os
import json
import datetime
from google import genai
from google.genai import types
from jinja2 import Template

def get_target_dates():
    """Calculates the target week ending date (Sunday)."""
    today = datetime.date.today()
    days_until_sunday = (6 - today.weekday()) % 7
    sunday = today + datetime.timedelta(days=days_until_sunday)
    monday = sunday - datetime.timedelta(days=6)
    return monday.strftime("%d %b %Y"), sunday.strftime("%d %b %Y"), sunday.strftime("%Y-%m-%d")

def fetch_sports_data_with_gemini(start_date, end_date, date_str):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is missing.")

    client = genai.Client(api_key=api_key)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    prompt = f"""
    You are an expert sports journalist generating an automated global weekly sports digest for the week ending {end_date} (period: {start_date} to {end_date}).

    Use the Wikipedia Current Events Sports Portal (https://en.wikipedia.org/wiki/Portal:Current_events/Sports) and global sports news search as your primary reference starting points.

    Instructions:
    1. Search for major sporting events, finals, and league matchdays occurring globally between {start_date} and {end_date}.
    2. Cover a mix of major international sports (e.g., Football/EPL/Copa/World Cup, Aussie Rules, Cricket/IPL, US Big Four, Tennis Grand Slams, Cycling Grand Tours, Formula 1, Rugby Union/League, GAA).
    3. Include 2-3 eye-catching "wildcard" or unique regional sporting highlights that peaked or reached a climax during this exact week.
    4. Provide factual summaries of key results, standings, or tournament phases, alongside previous winners for context.

    Return ONLY a single valid JSON object matching this exact schema:
    {{
      "week_ending": "{date_str}",
      "highlights": {{
        "last_week": "1-2 sentence summary highlighting the single biggest global sports result or climax from the past 7 days.",
        "this_week": "1-2 sentence teaser highlighting major upcoming events, final rounds, or key matchdays for the week ahead."
      }},
      "sports_cards": [
        {{
          "sport": "Sport Name",
          "icon": "Emoji",
          "event": "Event/Tournament Name",
          "status": "e.g. Concluded (26 Jul 2026) or In Progress",
          "details": "2-3 clear sentences summarising key results, standings, or action.",
          "previous_winner": "Who won the previous edition or season"
        }}
      ]
    }}
    """

    generation_config = types.GenerateContentConfig(
        response_mime_type="application/json",
        tools=[{"google_search": {}}]
    )

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=generation_config
    )

    return json.loads(response.text)

def build_email_html(data):
    template_str = """
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #2d3748; max-width: 650px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 8px; margin-bottom: 15px;">🏆 Weekly Sports Digest</h1>
        <p style="color: #718096; font-size: 14px;"><strong>Week Ending:</strong> {{ data.week_ending }}</p>
        
        <div style="background-color: #ebf8ff; border-left: 4px solid #3182ce; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
            <h2 style="color: #2b6cb0; margin-top: 0; font-size: 18px;">✨ This Week's Highlights</h2>
            <p style="margin-bottom: 10px;"><strong>Last Week:</strong> {{ data.highlights.last_week }}</p>
            <p style="margin-bottom: 0;"><strong>This Week:</strong> {{ data.highlights.this_week }}</p>
        </div>

        <h2 style="color: #1a365d; font-size: 18px; margin-top: 25px;">🏅 Sport Focus</h2>
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
    start_date, end_date, date_str = get_target_dates()
    print(f"Fetching sports data for period: {start_date} to {end_date}...")

    # 1. Fetch live data via Gemini API with search grounding
    data = fetch_sports_data_with_gemini(start_date, end_date, date_str)

    # 2. Save JSON for GitHub Pages Frontend
    os.makedirs("docs/data", exist_ok=True)
    with open("docs/data/latest.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 3. Save Email HTML for Gmail Action Step
    html_body = build_email_html(data)
    with open("docs/email.html", "w", encoding="utf-8") as f:
        f.write(html_body)

    print("Digest successfully compiled and saved.")

if __name__ == "__main__":
    main()