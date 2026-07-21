import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from groq import Groq


def fetch_wikipedia_text(wiki_title: str) -> str:
    """
    Fetches raw text from a Wikipedia page body, stripping scripts,
    formatting, and sidebars to get clean readable content for the LLM.
    """
    url = f"https://en.wikipedia.org/wiki/{wiki_title}"
    headers = {"User-Agent": "SportsDigestEngine/1.0 (contact@example.com)"}
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as response:
            html_data = response.read().decode("utf-8")
            soup = BeautifulSoup(html_data, "html.parser")
            
            # Remove clutter elements
            for element in soup(["script", "style", "footer", "nav", "header"]):
                element.decompose()

            # Extract main content text
            content = soup.find("div", {"id": "bodyContent"})
            text = content.get_text(separator=" ") if content else soup.get_text(separator=" ")
            
            # Collapse extra whitespace and take first 25,000 characters
            clean_text = " ".join(text.split())
            return clean_text[:25000]
    except Exception as e:
        print(f"Warning: Could not fetch Wikipedia page '{wiki_title}': {e}")
        return ""


def parse_wiki_data_with_groq(client: Groq, wiki_title: str, event_name: str, status: str) -> dict:
    """
    Passes raw Wikipedia page text to Groq as a deterministic parser
    to extract current leader or final winner details.
    """
    raw_text = fetch_wikipedia_text(wiki_title)
    if not raw_text:
        return {}

    model_name = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    
    prompt = f"""
    You are a precise sports data extraction tool. Analyze the following raw text from the Wikipedia page for "{event_name}".

    RAW PAGE TEXT:
    ---
    {raw_text}
    ---

    INSTRUCTIONS:
    1. If the event is ongoing, identify the CURRENT standings leader, overall classification leader (e.g. Yellow Jersey), or points leader mentioned.
    2. If the event has concluded, identify the winner, runner-up, and score/margin.
    3. Return ONLY a single valid JSON object. Do not invent information; if a value is unknown, use null.

    JSON SCHEMA:
    {{
      "current_leader": "Name of current leader/driver/team or null",
      "winner": "Winner name or null",
      "runner_up": "Runner-up name or null",
      "score": "Final score, margin, or time or null"
    }}
    """

    try:
        completion = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are a data parser that outputs strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        return json.loads(completion.choices[0].message.content.strip())
    except Exception as e:
        print(f"Error parsing Wikipedia text with Groq for '{event_name}': {e}")
        return {}

def get_next_edition_data(client: Groq, event: dict) -> dict | None:
    """
    Queries Groq to discover the next edition's Wikipedia title, name, 
    start date, and end date for an event that has completed.
    """
    prompt = f"""
    A sporting event entry has concluded and needs to roll over to its NEXT upcoming edition.

    Completed Event Details:
    - Name: {event['name']}
    - Wikipedia Title: {event['wikipedia_title']}
    - End Date: {event['end_date']}
    - Winner: {event.get('winner', 'Unknown')}

    INSTRUCTIONS:
    1. Identify the official Wikipedia page title and display name for the NEXT edition/season of this event.
    2. Provide official or estimated start_date and end_date in YYYY-MM-DD format based on typical annual/quadrennial schedules.
    3. Return ONLY a single valid JSON object.

    JSON SCHEMA:
    {{
      "name": "Updated Event Name (e.g. 2027 Tour de France)",
      "wikipedia_title": "Updated_Wiki_Title (e.g. 2027_Tour_de_France)",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD"
    }}
    """
    try:
        model_name = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        completion = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are an automated sports data rollover tool that outputs strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        return json.loads(completion.choices[0].message.content.strip())
    except Exception as e:
        print(f"Warning: Could not find next edition for '{event['name']}': {e}")
        return None

def process_event_lifecycle(events: list, today: datetime, groq_client: Groq | None) -> tuple[dict, list]:
    digest_output = {
        "generated_at": today.strftime("%Y-%m-%d"),
        "starting_soon": [],
        "ending_soon": [],
        "recent_results": [],
        "active_seasons": [],
        "future_events": []
    }
    
    updated_master = []

    for event in events:
        start_dt = datetime.strptime(event["start_date"], "%Y-%m-%d")
        end_dt = datetime.strptime(event["end_date"], "%Y-%m-%d")
        
        days_until_start = (start_dt - today).days
        days_until_end = (end_dt - today).days
        days_since_end = (today - end_dt).days

        # 1. Automatic Lifecycle Status Check
        if start_dt <= today <= end_dt:
            event["status"] = "ongoing"
        elif today < start_dt:
            event["status"] = "upcoming" if days_until_start <= 7 else "scheduled"

        # 2. Check Live Standings (ONLY for ONGOING events)
        if event["status"] == "ongoing" and groq_client:
            print(f"Checking live standings for active event '{event['name']}' via Wikipedia + Groq...")
            parsed = parse_wiki_data_with_groq(groq_client, event["wikipedia_title"], event["name"], event["status"])
            if parsed.get("current_leader"):
                event["current_leader"] = parsed["current_leader"]

        # 3. Fetch Final Results for Recently Concluded Events (Past 7 Days)
        if 0 <= days_since_end <= 7 and groq_client and not event.get("winner"):
            print(f"Fetching final results for concluded event '{event['name']}'...")
            parsed = parse_wiki_data_with_groq(groq_client, event["wikipedia_title"], event["name"], "concluded")
            event["status"] = "concluded"
            if parsed.get("winner"):
                event["winner"] = parsed["winner"]
            if parsed.get("runner_up"):
                event["runner_up"] = parsed["runner_up"]
            if parsed.get("score"):
                event["score"] = parsed["score"]

        # 4. Automatic Rollover (Triggers once event is > 7 days past end date)
        if days_since_end > 7 and groq_client:
            print(f"🔄 Event '{event['name']}' is >7 days completed. Rolling over to next edition...")
            next_edition = get_next_edition_data(groq_client, event)
            if next_edition:
                winner = event.get("winner")
                if winner and winner != "Result pending verification":
                    event["previous_holder"] = f"{winner} ({event['name']})"
                
                # Store old Wikipedia page title as the previous event reference BEFORE overwriting
                event["previous_event_wikipedia_title"] = event.get("wikipedia_title")

                # Overwrite fields in place for the next edition
                event["name"] = next_edition["name"]
                event["wikipedia_title"] = next_edition["wikipedia_title"]
                event["start_date"] = next_edition["start_date"]
                event["end_date"] = next_edition["end_date"]
                event["status"] = "scheduled"
                event["winner"] = None
                event["current_leader"] = None
                event["runner_up"] = None
                event["score"] = None
                
                # Recalculate date offsets for the newly rolled-over event
                start_dt = datetime.strptime(event["start_date"], "%Y-%m-%d")
                end_dt = datetime.strptime(event["end_date"], "%Y-%m-%d")
                days_until_start = (start_dt - today).days
                days_until_end = (end_dt - today).days
                days_since_end = (today - end_dt).days
                
                print(f"  └─ Rolled over to '{event['name']}' ({event['start_date']} -> {event['end_date']})")

        # 5. Dashboard Output Categorisation
        
        # Top Section: Starting Soon
        if 0 <= days_until_start <= 7 and event["status"] in ["scheduled", "upcoming"]:
            digest_output["starting_soon"].append({
                "event": event["name"],
                "sport": event["sport"],
                "icon": event["icon"],
                "wikipedia_title": event["wikipedia_title"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "days_left": days_until_start,
                "previous_holder": event.get("previous_holder"),
                "previous_event_wikipedia_title": event.get("previous_event_wikipedia_title")
            })

        # Second Section: Ongoing / Ending Soon
        if 0 <= days_until_end <= 7 and event["status"] == "ongoing":
            digest_output["ending_soon"].append({
                "event": event["name"],
                "sport": event["sport"],
                "icon": event["icon"],
                "wikipedia_title": event["wikipedia_title"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "days_remaining": days_until_end,
                "current_leader": event.get("current_leader"),
                "previous_holder": event.get("previous_holder"),
                "previous_event_wikipedia_title": event.get("previous_event_wikipedia_title")
            })

        # Top Section: Recent Results
        if 0 <= days_since_end <= 7:
            digest_output["recent_results"].append({
                "event": event["name"],
                "sport": event["sport"],
                "icon": event["icon"],
                "wikipedia_title": event["wikipedia_title"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "completed_date": event["end_date"],
                "winner": event.get("winner") or "Result pending verification",
                "runner_up": event.get("runner_up", "N/A"),
                "score": event.get("score", "N/A"),
                "previous_holder": event.get("previous_holder"),
                "previous_event_wikipedia_title": event.get("previous_event_wikipedia_title")
            })

        # Second Section: Long-running Active Seasons (e.g. MLB, F1)
        if start_dt <= today <= end_dt and (end_dt - start_dt).days > 30:
            digest_output["active_seasons"].append({
                "event": event["name"],
                "sport": event["sport"],
                "icon": event["icon"],
                "wikipedia_title": event["wikipedia_title"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "current_leader": event.get("current_leader"),
                "previous_holder": event.get("previous_holder"),
                "previous_event_wikipedia_title": event.get("previous_event_wikipedia_title")
            })

        # Third Section: Remaining Scheduled / Future Events
        if days_until_start > 7 and event["status"] in ["scheduled", "upcoming"]:
            digest_output["future_events"].append({
                "event": event["name"],
                "sport": event["sport"],
                "icon": event["icon"],
                "wikipedia_title": event["wikipedia_title"],
                "start_date": event["start_date"],
                "end_date": event["end_date"],
                "previous_holder": event.get("previous_holder"),
                "previous_event_wikipedia_title": event.get("previous_event_wikipedia_title")
            })

        updated_master.append(event)

    return digest_output, updated_master


def main():
    master_file = os.path.join("data", "events_master.json")
    output_file = os.path.join("data", "digest.json")

    if not os.path.exists(master_file):
        print(f"Error: Could not find '{master_file}'.", file=sys.stderr)
        sys.exit(1)

    with open(master_file, "r", encoding="utf-8") as f:
        events = json.load(f)

    # Initialize Groq client if API key exists
    api_key = os.environ.get("GROQ_API_KEY")
    groq_client = Groq(api_key=api_key) if api_key else None
    if not groq_client:
        print("Notice: GROQ_API_KEY not found. Running in offline/date-only mode.")

    today = datetime.now()
    print(f"Running event scan for date: {today.strftime('%d %b %Y')}...")

    digest_output, updated_events = process_event_lifecycle(events, today, groq_client)

    # Save updated states back to master file
    with open(master_file, "w", encoding="utf-8") as f:
        json.dump(updated_events, f, indent=2, ensure_ascii=False)

    # Save calculated digest JSON for front-end
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(digest_output, f, indent=2, ensure_ascii=False)

    print(f"Successfully generated digest cache at '{output_file}'!")


if __name__ == "__main__":
    main()