/**
 * Helper to construct Wikipedia links from a slug or event/team name
 */
function getWikipediaUrl(slugOrUrl) {
  if (!slugOrUrl) return "";
  const trimmed = slugOrUrl.toString().trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const wikiSlug = trimmed.replace(/\s+/g, "_");
  return `https://en.wikipedia.org/wiki/${encodeURI(wikiSlug)}`;
}

/**
 * Case-insensitive property lookup helper
 */
function getVal(row, key) {
  if (!row) return "";
  if (row[key] !== undefined) return row[key];
  const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
  return foundKey ? row[foundKey] : "";
}

/**
 * Flexible date parser for strings like "11 June 2026", "June 2030", or ISO dates
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === "") return null;
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  d = new Date("1 " + dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Calculates date difference in days relative to midnight
 */
function getDaysDiff(targetDate, referenceDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const target = new Date(targetDate).setHours(0, 0, 0, 0);
  const ref = new Date(referenceDate).setHours(0, 0, 0, 0);
  return Math.round((target - ref) / msPerDay);
}

/**
 * Helper to format single-day or multi-day climax date ranges
 */
function formatClimaxDisplay(startDateStr, endDateStr) {
  const start = startDateStr ? startDateStr.toString().trim() : "";
  const end = endDateStr ? endDateStr.toString().trim() : "";

  if (!start && !end) return "";
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}

/**
 * Categorises events into dashboard sections based on overall and climax dates
 */
function categorizeEvent(row) {
  const today = new Date();
  const startDate = parseDate(getVal(row, "Start Date"));
  const endDate = parseDate(getVal(row, "End Date"));
  const climaxStart = parseDate(getVal(row, "Climax Start Date"));
  const climaxEnd = parseDate(getVal(row, "Climax End Date")) || climaxStart;
  const nextStartDate = parseDate(getVal(row, "Next Start Date"));

  const daysSinceEnd = endDate ? getDaysDiff(today, endDate) : null;

  // 1. Just Finished (Ended within the last 14 days)
  if (daysSinceEnd !== null && daysSinceEnd >= 0 && daysSinceEnd <= 14) {
    return "finished";
  }

  // 2. Past Events (Ended more than 14 days ago)
  if (daysSinceEnd !== null && daysSinceEnd > 14) {
    return "past";
  }

  // 3. Season Climax Phase (14 days or less until Climax / Season End, or inside window)
  if (climaxStart) {
    const daysUntilClimax = getDaysDiff(climaxStart, today);
    const isInsideClimaxWindow = climaxEnd ? (today >= climaxStart && today <= climaxEnd) : false;
    
    if (isInsideClimaxWindow || (daysUntilClimax >= 0 && daysUntilClimax <= 14)) {
      return "climax";
    }
  } else if (endDate) {
    // Fallback: If no explicit climax event date exists, use the season End Date
    const daysUntilEnd = getDaysDiff(endDate, today);
    if (daysUntilEnd >= 0 && daysUntilEnd <= 14) {
      return "climax";
    }
  }

  // 4. Standard Ongoing Event
  if (startDate && endDate && today >= startDate && today <= endDate) {
    return "ongoing";
  }

  // 5. Future / Upcoming Events
  if ((startDate && today < startDate) || (nextStartDate && today < nextStartDate)) {
    return "future";
  }

  return "future";
}

/**
 * Creates HTML elements for individual tournament event cards
 */
function createCard(row, category) {
  const card = document.createElement("div");
  card.className = `card ${category}`;

  const sportName = getVal(row, "Sport").trim();
  const displayName = getVal(row, "Common Name") || getVal(row, "Event Name") || "Unnamed Event";

  let climaxName = getVal(row, "Climax Name").trim();
  let climaxStartStr = getVal(row, "Climax Start Date").trim();
  let climaxEndStr = getVal(row, "Climax End Date").trim();

  if (!climaxStartStr && category === "climax" && getVal(row, "End Date")) {
    climaxStartStr = getVal(row, "End Date").trim();
    climaxEndStr = getVal(row, "End Date").trim();
  }

  const climaxDisplay = formatClimaxDisplay(climaxStartStr, climaxEndStr);

  if (!climaxName && climaxDisplay) {
    climaxName = getVal(row, "Common Name") ? `${getVal(row, "Common Name")} Final` : "Season Climax";
  }

  const searchQuery = `${displayName} format status schedule results highlights defending champion`;
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&udm=50`;
  
  let youtubeQuery = "";
  let ytBtnLabel = "";
  let spParam = "EgIYAw%3D%3D";

  if (category === "finished" || category === "past") {
    youtubeQuery = `${displayName} final highlights recap`;
    ytBtnLabel = "▶️ Highlights";
  } else if (category === "ongoing") {
    youtubeQuery = `${displayName} latest highlights`;
    ytBtnLabel = "▶️ Latest highlights";
    spParam = "EgQIAxAD";
  } else if (category === "climax") {
    youtubeQuery = `${displayName} ${climaxName || 'final'} preview`;
    ytBtnLabel = "▶️ Preview";
  } else {
    youtubeQuery = `${displayName} preview teaser promo`;
    ytBtnLabel = "▶️ Preview / Teaser";
  }

  const cleanQuery = youtubeQuery.replace(/\s+/g, ' ').trim();
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}&sp=${spParam}`;

  const rawEventName = getVal(row, "Event Name") || getVal(row, "event_name") || displayName;
  const eventWikiUrl = getWikipediaUrl(rawEventName);
  const titleHtml = eventWikiUrl
    ? `<a href="${eventWikiUrl}" target="_blank" rel="noopener noreferrer" class="event-title-link">${displayName}</a>`
    : displayName;

  const logoUrl = getVal(row, "Logo") || getVal(row, "logo");
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${displayName} logo" class="team-badge-img" onerror="this.style.display='none'" />`
    : "";

  let contentHtml = `
    <div class="card-header">
      <div class="card-header-flex">
        ${logoHtml}
        <div class="header-titles">
          <div class="tag-row">
            ${sportName ? `<span class="sport-tag">${sportName}</span>` : ""}
            ${category === "climax" ? `<span class="climax-tag">🔥 Final Phase</span>` : ""}
          </div>
          <div class="event-name">${titleHtml}</div>
        </div>
      </div>
      <div class="dates">🗓️ ${getVal(row, "Start Date") || "TBD"} – ${getVal(row, "End Date") || "TBD"}</div>
    </div>
  `;

  const isUnfinished = (category === "ongoing" || category === "future" || category === "climax");

  if (isUnfinished && (climaxName || climaxDisplay)) {
    const climaxSlug = getVal(row, "Climax slug") || getVal(row, "climax_slug");
    const climaxWikiUrl = getWikipediaUrl(climaxSlug);
    const climaxTitleHtml = climaxWikiUrl
      ? `<a href="${climaxWikiUrl}" target="_blank" rel="noopener noreferrer" class="climax-title-link">${climaxName}</a>`
      : climaxName;

    contentHtml += `
      <div class="climax-banner">
        <span class="climax-banner-icon">🏆</span>
        <div class="climax-banner-details">
          <span class="climax-banner-title">${climaxTitleHtml}</span>
          ${climaxDisplay ? `<span class="climax-banner-date">${climaxDisplay}</span>` : ""}
        </div>
      </div>
    `;
  }

  contentHtml += `<div class="card-body">`;

  if (isUnfinished) {
    contentHtml += `
      <div class="data-row">
        <span class="data-label">Defending Champion</span>
        <span class="data-value">${getVal(row, "Defending Champion") || "N/A"}</span>
      </div>
    `;
  } else if (category === "finished" || category === "past") {
    const nextIteration = getVal(row, "Next Iteration").trim();
    const nextStartDate = getVal(row, "Next Start Date").trim();

    contentHtml += `
      <div class="data-row">
        <span class="data-label">Winner</span>
        <span class="data-value">🏆 ${getVal(row, "Winner") || "N/A"}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Runner-up</span>
        <span class="data-value">${getVal(row, "Runner-up") || "N/A"}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Final Score</span>
        <span class="data-value">${getVal(row, "Final Score") || "N/A"}</span>
      </div>
    `;

    if (nextIteration) {
      contentHtml += `
        <div class="data-row">
          <span class="data-label">Next Event</span>
          <span class="data-value">${nextIteration}${nextStartDate ? ` (${nextStartDate})` : ""}</span>
        </div>
      `;
    }
  }

  contentHtml += `
      <div class="card-actions">
        <a href="${googleSearchUrl}" target="_blank" class="ai-search-btn">
          ✨ AI Overview
        </a>
        <a href="${youtubeSearchUrl}" target="_blank" class="yt-search-btn">
          ${ytBtnLabel}
        </a>
      </div>
    </div>
  `;

  card.innerHTML = contentHtml;
  return card;
}

/**
 * Ensures the Season Climax grid section exists in index.html dynamically
 */
function ensureClimaxSectionExists() {
  if (!document.getElementById("grid-climax")) {
    const dashboard = document.getElementById("dashboard");
    const climaxSection = document.createElement("div");
    climaxSection.className = "dashboard-section";
    climaxSection.innerHTML = `
      <div class="section-title">
        <span>🔥 Season Climax / Finals Phase</span>
        <span id="count-climax" class="badge-count">0</span>
      </div>
      <div id="grid-climax" class="grid"></div>
    `;
    dashboard.appendChild(climaxSection);
  }
}

/**
 * Dynamically reorders DOM section containers in the desired top-to-bottom layout
 */
function reorderDashboardSections() {
  const dashboard = document.getElementById("dashboard");
  const sectionOrder = ["tracked-teams", "finished", "climax", "ongoing", "future", "past"];

  sectionOrder.forEach(cat => {
    let sectionWrapper = null;
    if (cat === "tracked-teams") {
      sectionWrapper = document.getElementById("section-tracked-teams");
    } else {
      const gridEl = document.getElementById(`grid-${cat}`);
      if (gridEl) sectionWrapper = gridEl.closest(".dashboard-section");
    }

    if (sectionWrapper) {
      dashboard.appendChild(sectionWrapper);
    }
  });
}

/**
 * Comparator helper function for ascending date sorting (soonest first)
 */
function compareDates(dateA, dateB) {
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateA - dateB;
}

function getOrdinal(n) {
  if (typeof n !== 'number') {
    const parsed = parseInt(n, 10);
    if (isNaN(parsed)) return n;
    n = parsed;
  }
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Fetches teams-data.json and dynamically renders cards for all API-tracked teams
 */
async function renderTeamCards() {
  try {
    const res = await fetch('./teams-data.json');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.teams || data.teams.length === 0) return;

    const dashboard = document.getElementById("dashboard");

    const existingSection = document.getElementById("section-tracked-teams");
    if (existingSection) existingSection.remove();

    const teamsSection = document.createElement("div");
    teamsSection.className = "dashboard-section";
    teamsSection.id = "section-tracked-teams";

    let cardsHtml = '';

    data.teams.forEach(team => {
      const opponent = team.latestResult?.opponent || "Opponent";
      const searchTeam = team.searchName || team.name;

      const aiSearchQuery = `${team.name.toLowerCase()} vs ${opponent} match summary analysis, next fixture preview`;
      const ytSearchQuery = `${searchTeam} ${opponent} highlights`;

      const aiUrl = `https://www.google.com/search?q=${encodeURIComponent(aiSearchQuery)}&udm=50`;
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(ytSearchQuery)}&sp=EgQIAxAD`;

      let latestResultText = 'N/A';
      if (team.latestResult) {
        const resChar = team.latestResult.result ? `[${team.latestResult.result}] ` : '';
        const compStr = team.latestResult.competition ? ` (${team.latestResult.competition})` : '';
        latestResultText = `${resChar}${team.latestResult.score || ''} vs ${team.latestResult.opponent || ''}${compStr}`.trim();
      }

      let leaguePosText = 'N/A';
      if (team.leaguePosition && team.leaguePosition.rank !== 'N/A') {
        const rankOrd = getOrdinal(team.leaguePosition.rank);
        const playedStr = team.leaguePosition.played ? `, P${team.leaguePosition.played}` : '';
        const ptsStr = typeof team.leaguePosition.points === 'number' ? `${team.leaguePosition.points} pts` : (team.leaguePosition.points || '');
        leaguePosText = `${rankOrd} (${ptsStr}${playedStr})`;
      } else if (team.leaguePosition?.league) {
        const ptsStr = team.leaguePosition.points ? ` (${team.leaguePosition.points})` : '';
        leaguePosText = `${team.leaguePosition.league}${ptsStr}`;
      }

      let nextFixtureText = 'N/A';
      if (team.nextFixture) {
        const compStr = team.nextFixture.competition ? ` - ${team.nextFixture.competition}` : '';
        const timeStr = team.nextFixture.time && team.nextFixture.time !== 'TBD' ? ` at ${team.nextFixture.time}` : '';
        nextFixtureText = `vs ${team.nextFixture.opponent || 'TBD'}${timeStr}${compStr}`.trim();
      }

      let cupSectionHtml = '';
      if (Array.isArray(team.cups) && team.cups.length > 0 && team.sport !== 'American Football') {
        const cupsListHtml = team.cups.map(c => `
          <div class="cup-item">
            <span class="cup-name">${c.name}:</span>
            <span class="cup-status ${c.isEliminated ? 'status-eliminated' : 'status-active'}">${c.status}</span>
          </div>
        `).join('');

        cupSectionHtml = `
          <div class="data-row cup-progress-row">
            <span class="data-label">Cup Progress</span>
            <div class="cup-list">${cupsListHtml}</div>
          </div>
        `;
      } else if (typeof team.cupProgress === 'string' && team.cupProgress !== 'N/A' && team.sport !== 'American Football') {
        cupSectionHtml = `
          <div class="data-row">
            <span class="data-label">Cup Progress</span>
            <span class="data-value">${team.cupProgress}</span>
          </div>
        `;
      }

      const logoHtml = team.logo
        ? `<img src="${team.logo}" alt="${team.name} badge" class="team-badge-img" onerror="this.style.display='none'" />`
        : '';

      cardsHtml += `
        <div class="card ongoing">
          <div class="card-header">
            <div class="card-header-flex">
              ${logoHtml}
              <div class="header-titles">
                <div class="tag-row">
                  <span class="sport-tag">${team.sport || 'Soccer'}</span>
                  <span class="climax-tag">${team.leaguePosition?.league || 'League'}</span>
                </div>
                <div class="event-name">
                  <a href="${team.wikiUrl || getWikipediaUrl(team.name)}" target="_blank" rel="noopener noreferrer" class="event-title-link">${team.name}</a>
                </div>
              </div>
            </div>
          </div>
          <div class="card-body">
            <div class="data-row">
              <span class="data-label">Latest Result (${team.latestResult?.date || 'N/A'})</span>
              <span class="data-value">${latestResultText}</span>
            </div>
            <div class="data-row">
              <span class="data-label">League Position</span>
              <span class="data-value">${leaguePosText}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Next Fixture (${team.nextFixture?.date || 'N/A'})</span>
              <span class="data-value">${nextFixtureText}</span>
            </div>
            ${cupSectionHtml}
            <div class="card-actions">
              <a href="${aiUrl}" target="_blank" class="ai-search-btn">✨ AI Overview</a>
              <a href="${ytUrl}" target="_blank" class="yt-search-btn">▶️ Highlights</a>
            </div>
          </div>
        </div>
      `;
    });

    teamsSection.innerHTML = `
      <div class="section-title">
        <span>⚽ Tracked Teams</span>
      </div>
      <div class="grid">
        ${cardsHtml}
      </div>
    `;

    dashboard.insertBefore(teamsSection, dashboard.firstChild);

  } catch (err) {
    console.error("Could not load teams-data.json:", err);
  }
}

/**
 * Groups, sorts, and renders grid cards for general tournaments
 */
function renderDashboard(data) {
  ensureClimaxSectionExists();

  const categories = { climax: [], ongoing: [], finished: [], future: [], past: [] };

  data.forEach(row => {
    if (getVal(row, "Common Name").trim() !== "" || getVal(row, "Event Name").trim() !== "") {
      const category = categorizeEvent(row);
      categories[category].push(row);
    }
  });

  const getClimaxSortDate = (row) => parseDate(getVal(row, "Climax Start Date")) || parseDate(getVal(row, "End Date"));
  categories.climax.sort((a, b) => compareDates(getClimaxSortDate(a), getClimaxSortDate(b)));
  categories.ongoing.sort((a, b) => compareDates(getClimaxSortDate(a), getClimaxSortDate(b)));

  const getFutureSortDate = (row) => parseDate(getVal(row, "Start Date")) || parseDate(getVal(row, "Next Start Date"));
  categories.future.sort((a, b) => compareDates(getFutureSortDate(a), getFutureSortDate(b)));

  categories.finished.sort((a, b) => compareDates(parseDate(getVal(a, "End Date")), parseDate(getVal(b, "End Date"))));

  categories.past.sort((a, b) => compareDates(parseDate(getVal(a, "Next Start Date")), parseDate(getVal(b, "Next Start Date"))));

  Object.keys(categories).forEach(cat => {
    const gridEl = document.getElementById(`grid-${cat}`);
    const countEl = document.getElementById(`count-${cat}`);
    if (!gridEl || !countEl) return;

    gridEl.innerHTML = "";
    countEl.textContent = categories[cat].length;

    if (categories[cat].length === 0) {
      gridEl.innerHTML = `<div class="empty-state">No ${cat} events at this time.</div>`;
    } else {
      categories[cat].forEach(row => {
        gridEl.appendChild(createCard(row, cat));
      });
    }
  });

  reorderDashboardSections();

  document.getElementById("loading").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
}

/**
 * Application entry point
 */
window.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch tracked API teams data
  await renderTeamCards();

  // 2. Fetch static tournament data
  fetch("./data.json")
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      renderDashboard(data);
    })
    .catch(err => {
      document.getElementById("loading").textContent = "Error loading event data.";
      console.error("Error loading JSON:", err);
    });
});
