def fetch_sports_data_with_gemini(start_date, end_date, date_str):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is missing.")

    client = genai.Client(api_key=api_key)
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    prompt = f"""
    You are an expert sports journalist generating a weekly global sports digest for the week ending {end_date} (period: {start_date} to {end_date}).

    Please search the web and produce structured data covering major international sports.
    
    Specific required coverage for this week:
    1. FIFA World Cup 2026: Concluded on Sunday 19 July 2026. Detail the winner and final result.
    2. Tour de France 2026: Finishing on Sunday 26 July 2026. Detail the Alpine mountain stages and GC race status.
    3. Include 2-3 other major or wildcard sports events happening during this exact week (e.g. AFL, Formula 1, Wimbledon recaps, GAA, Cricket).

    Return ONLY a single valid JSON object matching this schema EXACTLY:
    {{
      "week_ending": "{date_str}",
      "highlights": {{
        "last_week": "1-2 sentence summary of major results from the previous week (e.g. World Cup conclusion).",
        "this_week": "1-2 sentence teaser for major events finishing or continuing this week (e.g. Tour de France final stages)."
      }},
      "sports_cards": [
        {{
          "sport": "Sport Name",
          "icon": "Emoji",
          "event": "Event/Tournament Name",
          "status": "e.g. Concluded (19 July 2026) or In Progress",
          "details": "2-3 clear sentences on key results or current standings.",
          "previous_winner": "Who won the previous edition or season"
        }}
      ]
    }}
    """

    # Properly defined configuration object
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