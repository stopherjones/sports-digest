import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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
 * Flexible date parser for various formats
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.toString().trim() === "") return null;
  const str = dateStr.toString().trim();

  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let [day, month, year] = parts.map(p => parseInt(p.trim(), 10));
      if (year < 100) year += 2000;
      d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  d = new Date("1 " + str);
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

function formatDateShort(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = dateObj.toLocaleDateString('en-GB', { day: '2-digit' });
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });
  const year = dateObj.toLocaleDateString('en-GB', { year: 'numeric' });
  return `${weekday} ${day} ${month} ${year}`;
}

function formatSubjectDate(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = dateObj.toLocaleDateString('en-GB', { day: '2-digit' });
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });
  const year = dateObj.toLocaleDateString('en-GB', { year: 'numeric' });
  return `${weekday} ${day} ${month} ${year}`;
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

function getEventLinks(row, category) {
  const displayName = getVal(row, "Common Name") || getVal(row, "Event Name") || "Event";
  const searchQuery = `${displayName} format status schedule results highlights defending champion`;
  const aiOverviewUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

  let youtubeQuery = "";
  let ytBtnLabel = "▶️ Preview";

  if (category === "finished") {
    youtubeQuery = `${displayName} final highlights recap`;
    ytBtnLabel = "▶️ Highlights";
  } else if (category === "climax") {
    youtubeQuery = `${displayName} final preview predictions`;
    ytBtnLabel = "▶️ Preview";
  } else if (category === "starting") {
    youtubeQuery = `${displayName} season preview schedule contenders`;
    ytBtnLabel = "▶️ Preview";
  } else {
    youtubeQuery = `${displayName} highlights`;
    ytBtnLabel = "▶️ Highlights";
  }

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`;

  return {
    aiOverviewUrl,
    youtubeUrl,
    ytBtnLabel
  };
}

/**
 * Filter events for the weekly email:
 * 1. Events finished in the last week (0 to 7 days ago)
 * 2. Events climaxing in the next week (within 0 to 7 days ahead or currently in climax window)
 * 3. Events starting in the next week (start date within 0 to 7 days ahead)
 */
export function filterWeeklyEvents(eventsData, today = new Date()) {
  const finishedLastWeek = [];
  const climaxingNextWeek = [];
  const startingNextWeek = [];

  if (!Array.isArray(eventsData)) {
    return { finishedLastWeek, climaxingNextWeek, startingNextWeek };
  }

  eventsData.forEach(row => {
    const commonName = getVal(row, "Common Name").trim();
    const eventName = getVal(row, "Event Name").trim();
    if (!commonName && !eventName) return;

    const startDate = parseDate(getVal(row, "Start Date"));
    const endDate = parseDate(getVal(row, "End Date"));
    const climaxStart = parseDate(getVal(row, "Climax Start Date"));
    const climaxEnd = parseDate(getVal(row, "Climax End Date")) || climaxStart;
    const nextStartDate = parseDate(getVal(row, "Next Start Date"));

    // 1. Finished in the last week (ended 0 to 7 days ago)
    if (endDate) {
      const daysSinceEnd = getDaysDiff(today, endDate);
      if (daysSinceEnd >= 0 && daysSinceEnd <= 7) {
        finishedLastWeek.push({ row, endDate, daysSinceEnd });
      }
    }

    // 2. Climaxing in the next week (next 7 days or actively in climax phase)
    let isClimaxing = false;
    let climaxDate = null;
    let daysUntilClimax = null;

    if (climaxStart) {
      const diff = getDaysDiff(climaxStart, today);
      const isInside = climaxEnd ? (today >= climaxStart && today <= climaxEnd) : false;
      if (isInside || (diff >= 0 && diff <= 7)) {
        isClimaxing = true;
        climaxDate = climaxStart;
        daysUntilClimax = diff;
      }
    } else if (endDate) {
      const diff = getDaysDiff(endDate, today);
      if (diff >= 0 && diff <= 7) {
        isClimaxing = true;
        climaxDate = endDate;
        daysUntilClimax = diff;
      }
    }

    if (isClimaxing) {
      climaxingNextWeek.push({ row, climaxDate, daysUntilClimax });
    }

    // 3. Starting in the next week (0 to 7 days ahead)
    const effectiveStart = startDate || nextStartDate;
    if (effectiveStart) {
      const daysUntilStart = getDaysDiff(effectiveStart, today);
      if (daysUntilStart >= 0 && daysUntilStart <= 7) {
        startingNextWeek.push({ row, startDate: effectiveStart, daysUntilStart });
      }
    }
  });

  // Sort by date proximity
  finishedLastWeek.sort((a, b) => a.daysSinceEnd - b.daysSinceEnd);
  climaxingNextWeek.sort((a, b) => (a.daysUntilClimax ?? 99) - (b.daysUntilClimax ?? 99));
  startingNextWeek.sort((a, b) => a.daysUntilStart - b.daysUntilStart);

  return { finishedLastWeek, climaxingNextWeek, startingNextWeek };
}

/**
 * Generates the clean weekly digest HTML email
 */
export function generateDigestHtml(eventsData, teamsData, today = new Date()) {
  const { finishedLastWeek, climaxingNextWeek, startingNextWeek } = filterWeeklyEvents(eventsData, today);
  const teams = teamsData?.teams || [];

  const subjectDateStr = formatSubjectDate(today);
  const subject = `🏆 Weekly Sports Digest — ${subjectDateStr}`;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:24px 12px; background-color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f8fafc; line-height:1.5;">
  <div style="max-width:620px; margin:0 auto; background-color:#1e293b; border:1px solid #334155; border-radius:12px; padding:28px 24px; box-shadow:0 10px 25px rgba(0,0,0,0.35);">
    
    <!-- Header -->
    <div style="border-bottom:1px solid #334155; padding-bottom:16px; margin-bottom:24px;">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
        🏆 Weekly Sports Digest
      </h1>
      <div style="font-size:13px; color:#94a3b8; margin-top:4px; font-weight:500;">
        ${subjectDateStr}
      </div>
    </div>
`;

  // SECTION 1: FOLLOWED TEAMS
  html += `
    <!-- 1. Followed Teams -->
    <div style="margin-bottom:28px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
        <h2 style="margin:0; font-size:16px; font-weight:700; color:#10b981;">
          ⚽ Followed Teams
        </h2>
        <span style="font-size:12px; background:#334155; color:#94a3b8; padding:2px 8px; border-radius:10px; font-weight:600;">${teams.length}</span>
      </div>
`;

  if (teams.length === 0) {
    html += `      <p style="margin:0; font-size:13px; color:#94a3b8; font-style:italic;">No followed teams tracked.</p>\n`;
  } else {
    html += `      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">\n`;
    teams.forEach(team => {
      const logoHtml = team.logo
        ? `<img src="${team.logo}" alt="${team.name}" width="22" height="22" style="width:22px; height:22px; object-fit:contain; vertical-align:middle; margin-right:8px; border-radius:3px; display:inline-block;" />`
        : '';

      // Latest Result
      let lastResultText = 'None';
      if (team.latestResult) {
        const resBadge = team.latestResult.result ? `<span style="display:inline-block; font-weight:700; color:#10b981; margin-right:4px;">[${team.latestResult.result}]</span>` : '';
        const comp = team.latestResult.competition ? ` <span style="color:#94a3b8; font-size:12px;">(${team.latestResult.competition})</span>` : '';
        const dateStr = team.latestResult.date ? ` <span style="color:#94a3b8; font-size:12px;">— ${team.latestResult.date}</span>` : '';
        lastResultText = `${resBadge}${team.latestResult.score || ''} vs ${team.latestResult.opponent || 'Opponent'}${comp}${dateStr}`.trim();
      }

      // League Position
      let leaguePosText = 'N/A';
      if (team.leaguePosition && team.leaguePosition.rank !== 'N/A' && team.leaguePosition.rank !== undefined) {
        const rankOrd = getOrdinal(team.leaguePosition.rank);
        const leagueName = team.leaguePosition.league || 'League';
        const played = team.leaguePosition.played ? `, P${team.leaguePosition.played}` : '';
        const points = typeof team.leaguePosition.points === 'number' ? `${team.leaguePosition.points} pts` : (team.leaguePosition.points || '');
        leaguePosText = `<strong>${rankOrd}</strong> in ${leagueName} <span style="color:#94a3b8; font-size:12px;">(${points}${played})</span>`;
      } else if (team.leaguePosition?.league) {
        const points = team.leaguePosition.points ? ` (${team.leaguePosition.points})` : '';
        leaguePosText = `${team.leaguePosition.league}${points}`;
      }

      // Next Fixture
      let nextFixtureText = 'None scheduled';
      if (team.nextFixture) {
        const opp = team.nextFixture.opponent || 'TBD';
        const dateStr = team.nextFixture.date || '';
        const timeStr = team.nextFixture.time && team.nextFixture.time !== 'TBD' ? ` at ${team.nextFixture.time}` : '';
        const comp = team.nextFixture.competition ? ` <span style="color:#94a3b8; font-size:12px;">(${team.nextFixture.competition})</span>` : '';
        nextFixtureText = `vs <strong>${opp}</strong> — ${dateStr}${timeStr}${comp}`.trim();
      }

      const opponent = team.latestResult?.opponent || "Opponent";
      const searchTeam = team.searchName || team.name;
      const aiSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${team.name} vs ${opponent} match summary analysis, next fixture preview`)}`;
      const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${searchTeam} ${opponent} highlights`)}&sp=EgQIAxAD`;

      html += `        <tr>
          <td style="padding-bottom:14px;">
            <div style="background-color:#0f172a; border:1px solid #334155; border-radius:8px; padding:14px 16px; width:100%; box-sizing:border-box;">
              
              <!-- Team Header -->
              <div style="font-size:15px; font-weight:700; color:#ffffff; padding-bottom:8px; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                ${logoHtml}<span style="vertical-align:middle;">${team.name}</span>
                <span style="font-size:11px; color:#94a3b8; font-weight:normal; margin-left:6px; vertical-align:middle;">(${team.sport || 'Sport'})</span>
              </div>
              
              <!-- Stacked Team Updates -->
              <div style="width:100%;">
                
                <!-- 1. Latest Result Row -->
                <div style="padding:4px 0; font-size:13px; color:#cbd5e1; line-height:1.5;">
                  <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">Latest Result</div>
                  <div style="color:#f8fafc;">${lastResultText}</div>
                </div>

                <!-- 2. League Position Row -->
                <div style="padding:4px 0; font-size:13px; color:#cbd5e1; line-height:1.5; border-top:1px dashed rgba(255,255,255,0.06); margin-top:4px;">
                  <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">League Position</div>
                  <div style="color:#f8fafc;">${leaguePosText}</div>
                </div>

                <!-- 3. Next Fixture Row -->
                <div style="padding:4px 0; font-size:13px; color:#cbd5e1; line-height:1.5; border-top:1px dashed rgba(255,255,255,0.06); margin-top:4px;">
                  <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">Next Fixture</div>
                  <div style="color:#f8fafc;">${nextFixtureText}</div>
                </div>

              </div>

              <!-- Quick Links -->
              <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); font-size:12px;">
                <a href="${aiSearchUrl}" style="color:#60a5fa; text-decoration:none; margin-right:14px; font-weight:500;">Web summary →</a>
                <a href="${ytSearchUrl}" style="color:#10b981; text-decoration:none; font-weight:500;">▶️ Video highlights →</a>
              </div>

            </div>
          </td>
        </tr>\n`;
    });
    html += `      </table>\n`;
  }
  html += `    </div>\n`;

  // SECTION 2: EVENTS FINISHED IN THE LAST WEEK
  html += `
    <!-- 2. Finished in Last Week -->
    <div style="margin-bottom:28px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
        <h2 style="margin:0; font-size:16px; font-weight:700; color:#3b82f6;">
          🏁 Events Finished in the Last Week
        </h2>
        <span style="font-size:12px; background:#334155; color:#94a3b8; padding:2px 8px; border-radius:10px; font-weight:600;">${finishedLastWeek.length}</span>
      </div>
`;

  if (finishedLastWeek.length === 0) {
    html += `      <p style="margin:0; font-size:13px; color:#94a3b8; font-style:italic;">No major events finished in the past 7 days.</p>\n`;
  } else {
    html += `      <ul style="margin:0; padding-left:18px; color:#cbd5e1; font-size:13px; line-height:1.7;">\n`;
    finishedLastWeek.forEach(({ row, endDate }) => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
      const sport = getVal(row, "Sport");
      const winner = getVal(row, "Winner");
      const score = getVal(row, "Final Score");
      const dateText = formatDateShort(endDate);
      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "finished");

      let details = "";
      if (winner) details += `🏆 Winner: ${winner}`;
      if (score) details += ` (${score})`;

      html += `        <li style="margin-bottom:8px;">
          <strong style="color:#ffffff;">${name}</strong>${sport ? ` <span style="color:#94a3b8; font-size:12px;">(${sport})</span>` : ''} 
          <span style="color:#94a3b8;">— Ended ${dateText}</span>
          ${details ? `<br/><span style="color:#cbd5e1;">${details}</span>` : ''}
          <div style="font-size:12px; margin-top:2px;">
            <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
            <a href="${youtubeUrl}" style="color:#3b82f6; text-decoration:none;">${ytBtnLabel}</a>
          </div>
        </li>\n`;
    });
    html += `      </ul>\n`;
  }
  html += `    </div>\n`;

  // SECTION 3: EVENTS CLIMAXING IN THE NEXT WEEK
  html += `
    <!-- 3. Climaxing in Next Week -->
    <div style="margin-bottom:28px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
        <h2 style="margin:0; font-size:16px; font-weight:700; color:#f43f5e;">
          🔥 Events Climaxing in the Next Week
        </h2>
        <span style="font-size:12px; background:#334155; color:#94a3b8; padding:2px 8px; border-radius:10px; font-weight:600;">${climaxingNextWeek.length}</span>
      </div>
`;

  if (climaxingNextWeek.length === 0) {
    html += `      <p style="margin:0; font-size:13px; color:#94a3b8; font-style:italic;">No season climaxes or finals scheduled in the next 7 days.</p>\n`;
  } else {
    html += `      <ul style="margin:0; padding-left:18px; color:#cbd5e1; font-size:13px; line-height:1.7;">\n`;
    climaxingNextWeek.forEach(({ row }) => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
      const climaxName = getVal(row, "Climax Name");
      const sport = getVal(row, "Sport");
      const climaxStartStr = getVal(row, "Climax Start Date") || getVal(row, "Start Date");
      const climaxEndStr = getVal(row, "Climax End Date") || getVal(row, "End Date");
      const startDate = parseDate(climaxStartStr);
      const endDate = parseDate(climaxEndStr);

      let dateText = "";
      if (startDate && endDate) {
        if (startDate.getTime() === endDate.getTime()) {
          dateText = formatDateShort(startDate);
        } else {
          dateText = `${formatDateShort(startDate)} – ${formatDateShort(endDate)}`;
        }
      } else if (startDate) {
        dateText = formatDateShort(startDate);
      }

      const defendingChamp = getVal(row, "Defending Champion");
      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "climax");

      html += `        <li style="margin-bottom:8px;">
          <strong style="color:#ffffff;">${name}</strong>${climaxName ? ` <em style="color:#f43f5e; font-style:normal;">[${climaxName}]</em>` : ''}${sport ? ` <span style="color:#94a3b8; font-size:12px;">(${sport})</span>` : ''}
          ${dateText ? `<span style="color:#94a3b8;"> — ${dateText}</span>` : ''}
          ${defendingChamp ? `<br/><span style="color:#94a3b8; font-size:12px;">Defending Champion: ${defendingChamp}</span>` : ''}
          <div style="font-size:12px; margin-top:2px;">
            <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
            <a href="${youtubeUrl}" style="color:#f43f5e; text-decoration:none;">${ytBtnLabel}</a>
          </div>
        </li>\n`;
    });
    html += `      </ul>\n`;
  }
  html += `    </div>\n`;

  // SECTION 4: EVENTS STARTING IN THE NEXT WEEK
  html += `
    <!-- 4. Starting in Next Week -->
    <div style="margin-bottom:28px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:6px;">
        <h2 style="margin:0; font-size:16px; font-weight:700; color:#f59e0b;">
          📅 Events Starting in the Next Week
        </h2>
        <span style="font-size:12px; background:#334155; color:#94a3b8; padding:2px 8px; border-radius:10px; font-weight:600;">${startingNextWeek.length}</span>
      </div>
`;

  if (startingNextWeek.length === 0) {
    html += `      <p style="margin:0; font-size:13px; color:#94a3b8; font-style:italic;">No new tournaments starting in the next 7 days.</p>\n`;
  } else {
    html += `      <ul style="margin:0; padding-left:18px; color:#cbd5e1; font-size:13px; line-height:1.7;">\n`;
    startingNextWeek.forEach(({ row, startDate }) => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
      const sport = getVal(row, "Sport");
      const dateText = formatDateShort(startDate);
      const defendingChamp = getVal(row, "Defending Champion");
      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "starting");

      html += `        <li style="margin-bottom:8px;">
          <strong style="color:#ffffff;">${name}</strong>${sport ? ` <span style="color:#94a3b8; font-size:12px;">(${sport})</span>` : ''}
          <span style="color:#94a3b8;"> — Starts ${dateText}</span>
          ${defendingChamp ? `<br/><span style="color:#94a3b8; font-size:12px;">Defending Champion: ${defendingChamp}</span>` : ''}
          <div style="font-size:12px; margin-top:2px;">
            <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
            <a href="${youtubeUrl}" style="color:#f59e0b; text-decoration:none;">${ytBtnLabel}</a>
          </div>
        </li>\n`;
    });
    html += `      </ul>\n`;
  }
  html += `    </div>\n`;

  // SECTION 5: FOOTER LINK TO FULL DIGEST
  html += `
    <!-- Footer Link to Full Digest -->
    <div style="border-top:1px solid #334155; padding-top:20px; margin-top:28px; text-align:center;">
      <p style="margin:0 0 10px 0; font-size:13px; color:#94a3b8;">
        Explore all ongoing, upcoming, and past tournament tracking in the full dashboard:
      </p>
      <a href="https://stopherjones.github.io/sports-digest" style="display:inline-block; background-color:#2563eb; color:#ffffff; font-weight:600; font-size:14px; text-decoration:none; padding:10px 20px; border-radius:8px; letter-spacing:0.01em;">
        Open Full Sports Digest →
      </a>
      <div style="margin-top:10px;">
        <a href="https://stopherjones.github.io/sports-digest" style="font-size:12px; color:#60a5fa; text-decoration:underline;">
          stopherjones.github.io/sports-digest
        </a>
      </div>
    </div>

  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Loads events dataset from local file, private repo, or remote URL
 */
async function loadEventsData() {
  const candidatePaths = [
    process.env.DATA_FILE_PATH,
    './data-repo/data.json',
    './data.json',
    '../data.json',
    './data/data.json'
  ].filter(Boolean);

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        console.log(`Loading events data from local file: ${p}`);
        const content = await fs.readFile(p, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        console.warn(`Failed reading local file ${p}:`, err.message);
      }
    }
  }

  // If DATA_JSON_URL is specified (e.g. raw URL or authenticated API endpoint)
  const token = process.env.DATA_REPO_TOKEN || process.env.PAT_TOKEN || process.env.GH_PAT || process.env.GITHUB_TOKEN;
  const dataUrl = process.env.DATA_JSON_URL;

  if (dataUrl) {
    try {
      console.log(`Fetching events data from DATA_JSON_URL: ${dataUrl}`);
      const headers = {};
      if (token) {
        headers['Authorization'] = `token ${token}`;
        headers['Accept'] = 'application/vnd.github.v3.raw, application/json';
      }
      const resp = await fetch(dataUrl, { headers });
      if (resp.ok) {
        return await resp.json();
      }
      console.warn(`HTTP error fetching DATA_JSON_URL: ${resp.status}`);
    } catch (err) {
      console.warn(`Failed fetching DATA_JSON_URL:`, err.message);
    }
  }

  // If DATA_REPO (e.g. "stopherjones/my-private-data") and token are specified
  const dataRepo = process.env.DATA_REPO;
  if (dataRepo && token) {
    try {
      const repoApiUrl = `https://api.github.com/repos/${dataRepo}/contents/data.json`;
      console.log(`Fetching events data from GitHub API: ${repoApiUrl}`);
      const resp = await fetch(repoApiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.raw+json',
          'User-Agent': 'Sports-Digest-Weekly-Email'
        }
      });
      if (resp.ok) {
        return await resp.json();
      }
      console.warn(`GitHub API returned status ${resp.status}`);
    } catch (err) {
      console.warn(`Failed fetching from GitHub API for repo ${dataRepo}:`, err.message);
    }
  }

  // Fallback to public Gist if available
  const fallbackUrl = "https://gist.githubusercontent.com/stopherjones/9c7621ceb2341ea9cd2fa03f945b6e00/raw/data.json";
  try {
    console.log(`Falling back to public Gist: ${fallbackUrl}`);
    const resp = await fetch(fallbackUrl);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (err) {
    console.warn(`Fallback fetch failed:`, err.message);
  }

  console.warn("⚠️ Warning: No tournament events data could be loaded. Using empty list.");
  return [];
}

/**
 * Loads teams dataset from local file or remote URL
 */
async function loadTeamsData() {
  const candidatePaths = [
    process.env.TEAMS_FILE_PATH,
    './data-repo/teams-data.json',
    './teams-data.json',
    '../teams-data.json'
  ].filter(Boolean);

  for (const p of candidatePaths) {
    if (existsSync(p)) {
      try {
        console.log(`Loading teams data from local file: ${p}`);
        const content = await fs.readFile(p, 'utf-8');
        return JSON.parse(content);
      } catch (err) {
        console.warn(`Failed reading local file ${p}:`, err.message);
      }
    }
  }

  const teamsUrl = process.env.TEAMS_DATA_URL || "https://gist.githubusercontent.com/stopherjones/df101fec6442b12489eeec1296a743b6/raw/teams-data.json";
  try {
    console.log(`Fetching teams data from URL: ${teamsUrl}`);
    const resp = await fetch(teamsUrl);
    if (resp.ok) {
      return await resp.json();
    }
  } catch (err) {
    console.warn(`Failed fetching teams data from URL:`, err.message);
  }

  console.warn("⚠️ Warning: No teams data could be loaded. Using empty list.");
  return { teams: [] };
}

/**
 * CLI execution handler
 */
async function run() {
  try {
    const eventsData = await loadEventsData();
    const teamsData = await loadTeamsData();

    const { subject, html } = generateDigestHtml(eventsData, teamsData, new Date());

    await fs.writeFile('./digest-subject.txt', subject, 'utf-8');
    await fs.writeFile('./digest-email.html', html, 'utf-8');

    if (process.env.GITHUB_OUTPUT) {
      await fs.appendFile(process.env.GITHUB_OUTPUT, `subject=${subject}\n`);
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, html);
    }

    console.log('✅ Weekly digest email successfully generated!');
    console.log(`Subject: ${subject}`);
    console.log(`Email body written to ./digest-email.html`);
  } catch (err) {
    console.error('❌ Error generating digest email:', err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('generate-digest-email.mjs')) {
  run();
}
