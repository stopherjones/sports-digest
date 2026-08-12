import fs from 'fs/promises';
import path from 'path';

/**
 * Case-insensitive property getter
 */
function getVal(row, key) {
  if (!row) return "";
  if (row[key] !== undefined) return row[key];
  const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.trim().toLowerCase());
  return foundKey ? row[foundKey] : "";
}

/**
 * Robust date parser
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
  const year = dateObj.toLocaleDateString('en-GB', { year: '2-digit' });
  return `${weekday} ${day} ${month} ${year}`;
}

function formatSubjectDate(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = dateObj.toLocaleDateString('en-GB', { day: '2-digit' });
  const month = dateObj.toLocaleDateString('en-GB', { month: 'short' });
  const year = dateObj.toLocaleDateString('en-GB', { year: '2-digit' });
  return `${weekday}-${day}-${month}-${year}`;
}

function categorizeEvent(row, referenceDate = new Date()) {
  const today = referenceDate;
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

function getEventLinks(row, category) {
  const displayName = getVal(row, "Common Name") || getVal(row, "Event Name") || "Event";
  
  const searchQuery = `${displayName} format status schedule results highlights defending champion`;
  const aiOverviewUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

  let youtubeQuery = "";
  let ytBtnLabel = "▶️ Preview";

  if (category === "finished" || category === "past") {
    youtubeQuery = `${displayName} final highlights recap`;
    ytBtnLabel = "▶️ Highlights";
  } else if (category === "ongoing") {
    youtubeQuery = `${displayName} latest highlights`;
    ytBtnLabel = "▶️ Highlights";
  } else if (category === "climax") {
    youtubeQuery = `${displayName} final preview predictions`;
    ytBtnLabel = "▶️ Preview";
  } else {
    youtubeQuery = `${displayName} season preview schedule contenders`;
    ytBtnLabel = "▶️ Preview";
  }

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeQuery)}`;

  return {
    aiOverviewUrl,
    youtubeUrl,
    ytBtnLabel
  };
}

export function generateDigestHtml(eventsData, teamsData, today = new Date()) {
  const finishedEvents = [];
  const climaxEvents = [];
  const ongoingEvents = [];
  const upcomingEvents = [];

  eventsData.forEach(row => {
    const cat = categorizeEvent(row, today);
    if (cat === "finished") finishedEvents.push(row);
    else if (cat === "climax") climaxEvents.push(row);
    else if (cat === "ongoing") ongoingEvents.push(row);
    else if (cat === "future") {
      const startDate = parseDate(getVal(row, "Start Date")) || parseDate(getVal(row, "Next Start Date"));
      if (startDate) {
        const daysDiff = getDaysDiff(startDate, today);
        if (daysDiff >= 0 && daysDiff <= 45) {
          upcomingEvents.push({ row, startDate, daysDiff });
        }
      } else {
        upcomingEvents.push({ row, startDate: null, daysDiff: 999 });
      }
    }
  });

  upcomingEvents.sort((a, b) => a.daysDiff - b.daysDiff);

  const subjectDateStr = formatSubjectDate(today);
  const subject = `🏆 Weekly Sports Summary — ${subjectDateStr}`;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:20px; background-color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f8fafc; line-height:1.5;">
  <div style="max-width:640px; margin:0 auto; background-color:#1e293b; border:1px solid #334155; border-radius:12px; padding:28px; box-shadow:0 10px 25px rgba(0,0,0,0.3);">
    
    <!-- Title -->
    <div style="border-bottom:1px solid #334155; padding-bottom:16px; margin-bottom:24px;">
      <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; display:flex; align-items:center; gap:8px;">
        🏆 Weekly Sports Digest
      </h1>
      <div style="font-size:13px; color:#94a3b8; margin-top:4px;">${subjectDateStr}</div>
    </div>
`;

  // 1. Season Climaxes
  if (climaxEvents.length > 0) {
    html += `
    <!-- Season Climaxes -->
    <div style="margin-bottom:28px;">
      <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:600; color:#f43f5e;">
        🔥 Season Climaxes
      </h2>
      <ul style="margin:0; padding-left:20px; color:#cbd5e1; font-size:14px; line-height:1.8;">
`;
    climaxEvents.forEach(row => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
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

      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "climax");

      html += `        <li style="margin-bottom:10px;">
          <strong style="color:#ffffff;">${name}</strong>${dateText ? ` (${dateText})` : ''} — 
          <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
          <a href="${youtubeUrl}" style="color:#f43f5e; text-decoration:none;">${ytBtnLabel}</a>
        </li>\n`;
    });
    html += `      </ul>
    </div>\n`;
  }

  // 2. Recently Finished
  if (finishedEvents.length > 0) {
    html += `
    <!-- Recently Finished -->
    <div style="margin-bottom:28px;">
      <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:600; color:#3b82f6;">
        🏁 Recently Finished (Last 14 Days)
      </h2>
      <ul style="margin:0; padding-left:20px; color:#cbd5e1; font-size:14px; line-height:1.8;">
`;
    finishedEvents.forEach(row => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
      const winner = getVal(row, "Winner");
      const score = getVal(row, "Final Score");
      const endDate = parseDate(getVal(row, "End Date"));
      const dateText = endDate ? formatDateShort(endDate) : "";

      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "finished");

      let detailsStr = "";
      if (winner) detailsStr += ` Winner: ${winner}`;
      if (score) detailsStr += ` (${score})`;

      html += `        <li style="margin-bottom:10px;">
          <strong style="color:#ffffff;">${name}</strong>${dateText ? ` (Ended ${dateText})` : ''}${detailsStr ? ` — <em style="color:#94a3b8;">${detailsStr}</em>` : ''} — 
          <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
          <a href="${youtubeUrl}" style="color:#f43f5e; text-decoration:none;">${ytBtnLabel}</a>
        </li>\n`;
    });
    html += `      </ul>
    </div>\n`;
  }

  // 3. Upcoming Events
  if (upcomingEvents.length > 0) {
    html += `
    <!-- Upcoming Events -->
    <div style="margin-bottom:28px;">
      <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:600; color:#f59e0b;">
        📅 Upcoming Events
      </h2>
      <ul style="margin:0; padding-left:20px; color:#cbd5e1; font-size:14px; line-height:1.8;">
`;
    upcomingEvents.forEach(({ row, startDate }) => {
      const name = getVal(row, "Common Name") || getVal(row, "Event Name");
      const dateText = startDate ? formatDateShort(startDate) : (getVal(row, "Start Date") || getVal(row, "Next Start Date"));

      const { aiOverviewUrl, youtubeUrl, ytBtnLabel } = getEventLinks(row, "future");

      html += `        <li style="margin-bottom:10px;">
          <strong style="color:#ffffff;">${name}</strong>${dateText ? ` (Starts ${dateText})` : ''} — 
          <a href="${aiOverviewUrl}" style="color:#60a5fa; text-decoration:none;">Web summary</a> | 
          <a href="${youtubeUrl}" style="color:#f43f5e; text-decoration:none;">${ytBtnLabel}</a>
        </li>\n`;
    });
    html += `      </ul>
    </div>\n`;
  }

  // 4. Tracked Teams Standings & Status
  if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
    html += `
    <!-- Tracked Teams Standings & Status -->
    <div style="margin-bottom:28px;">
      <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:600; color:#10b981;">
        📊 Tracked Teams Standings & Status
      </h2>
      <div style="display:flex; flex-direction:column; gap:12px;">
`;
    teamsData.teams.forEach(team => {
      const logoHtml = team.logo ? `<img src="${team.logo}" alt="${team.name}" style="width:24px; height:24px; object-fit:contain; vertical-align:middle; margin-right:8px;" />` : '';
      
      let positionText = 'N/A';
      if (team.leaguePosition) {
        positionText = `${team.leaguePosition.league}: Rank ${team.leaguePosition.rank}`;
        if (team.leaguePosition.points !== undefined) {
          positionText += ` (${team.leaguePosition.points} pts/record)`;
        }
      }

      let lastResultText = 'None';
      if (team.latestResult) {
        lastResultText = `vs ${team.latestResult.opponent}: ${team.latestResult.score} (${team.latestResult.result}) on ${team.latestResult.date}`;
      }

      let nextFixtureText = 'None';
      if (team.nextFixture) {
        nextFixtureText = `vs ${team.nextFixture.opponent} (${team.nextFixture.date} ${team.nextFixture.time || ''})`;
      }

      let cupStr = '';
      if (team.cups && team.cups.length > 0) {
        cupStr = team.cups.map(c => `${c.name}: ${c.status}`).join(' | ');
      }

      html += `        <div style="background-color:#0f172a; border:1px solid #334155; border-radius:8px; padding:14px;">
          <div style="font-size:15px; font-weight:600; color:#ffffff; margin-bottom:6px; display:flex; align-items:center;">
            ${logoHtml}<span>${team.name} <span style="font-size:12px; color:#94a3b8; font-weight:normal;">(${team.sport})</span></span>
          </div>
          <div style="font-size:13px; color:#cbd5e1; line-height:1.6;">
            <div><strong>Standings:</strong> ${positionText}</div>
            <div><strong>Latest Result:</strong> ${lastResultText}</div>
            <div><strong>Next Fixture:</strong> ${nextFixtureText}</div>
            ${cupStr ? `<div><strong>Cups:</strong> ${cupStr}</div>` : ''}
          </div>
        </div>\n`;
    });
    html += `      </div>
    </div>\n`;
  }

  // Footer
  html += `
    <!-- Footer -->
    <div style="border-top:1px solid #334155; padding-top:16px; margin-top:24px; text-align:center;">
      <p style="margin:0 0 6px 0; font-size:13px; color:#94a3b8;">
        View full interactive dashboard:
      </p>
      <a href="https://stopherjones.github.io/sports-digest" style="font-size:14px; font-weight:600; color:#60a5fa; text-decoration:underline;">
        stopherjones.github.io/sports-digest
      </a>
    </div>

  </div>
</body>
</html>`;

  return { subject, html };
}

async function run() {
  try {
    const dataPath = path.resolve('./data.json');
    const teamsPath = path.resolve('./teams-data.json');

    const rawData = await fs.readFile(dataPath, 'utf-8');
    const eventsData = JSON.parse(rawData);

    const rawTeams = await fs.readFile(teamsPath, 'utf-8');
    const teamsData = JSON.parse(rawTeams);

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
