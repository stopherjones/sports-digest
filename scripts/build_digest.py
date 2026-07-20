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