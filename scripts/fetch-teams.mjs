import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// TEAMS CONFIGURATION: Add, remove, or customize tracked teams here.
// bbcSlug: The BBC team slug (e.g., 'manchester-united', 'plymouth-argyle', 'truro-city')
// tableSlug: The BBC league table slug (e.g., 'premier-league', 'league-one', 'national-league-south')
// espnId & leagueSlug: Secondary fallback for ESPN API
// ---------------------------------------------------------------------------
const TEAMS_CONFIG = [
  {
    name: 'Leeds United',
    searchName: 'Leeds Utd',
    bbcSlug: 'leeds-united',
    tableSlug: 'premier-league',
    espnId: '357',
    leagueSlug: 'eng.1'
  },
  {
    name: 'York City',
    searchName: 'York City',
    bbcSlug: 'york-city',
    tableSlug: 'league-two',
    espnId: '383',
    leagueSlug: 'eng.4'
  }
];

// Helper to format numbers to ordinal (1st, 2nd, 3rd, 4th...)
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Primary Fetcher: Pulls fixture, results, standings & cup progress from BBC Sport
 */
async function fetchFromBBC(team) {
  const url = `https://www.bbc.com/sport/football/teams/${team.bbcSlug}`;
  console.log(`📡 Fetching BBC Sport Team Data: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/window\.__INITIAL_DATA__\s*=\s*\"(.*?)\";/s);
  if (!match) throw new Error('No __INITIAL_DATA__ found');

  const rawUnescaped = JSON.parse('"' + match[1] + '"');
  const parsed = JSON.parse(rawUnescaped);

  let events = [];
  for (const k of Object.keys(parsed.data || {})) {
    if (k.startsWith('fixtures-banner') || k.startsWith('sport-data-scores-fixtures')) {
      if (parsed.data[k]?.data?.events) {
        events = parsed.data[k].data.events;
        break;
      }
    }
  }

  const finishedEvents = [];
  const upcomingEvents = [];
  const cupCompetitions = new Set();

  events.forEach(evt => {
    const isCompleted = evt.status === 'PostEvent' || evt.runningScores || evt.eventProgress?.period === 'FULL_TIME';
    const homeName = evt.home?.fullName || evt.home?.shortName || '';
    const awayName = evt.away?.fullName || evt.away?.shortName || '';
    const searchStr = (team.searchName || team.name).toLowerCase();
    const isHome = homeName.toLowerCase().includes(searchStr) || team.name.toLowerCase().includes(homeName.toLowerCase());

    const rawCompName = evt.eventGroupingLabel || evt.tournament?.name || 'Match';
    const cleanComp = rawCompName
      .replace(/^England\s*-\s*/i, '')
      .replace(/^World\s*-\s*/i, '')
      .replace(/^Europe\s*-\s*/i, '');

    if (
      cleanComp.toLowerCase().includes('cup') ||
      cleanComp.toLowerCase().includes('trophy') ||
      cleanComp.toLowerCase().includes('champions league') ||
      cleanComp.toLowerCase().includes('europa')
    ) {
      cupCompetitions.add(cleanComp);
    }

    if (isCompleted) {
      finishedEvents.push({ evt, isHome, cleanComp });
    } else {
      upcomingEvents.push({ evt, isHome, cleanComp });
    }
  });

  // Latest Result
  let latestResult = null;
  if (finishedEvents.length > 0) {
    const last = finishedEvents[0];
    const evt = last.evt;
    const isHome = last.isHome;
    const homeScore = evt.home?.runningScores?.fulltime ?? evt.home?.scores?.fulltime ?? '0';
    const awayScore = evt.away?.runningScores?.fulltime ?? evt.away?.scores?.fulltime ?? '0';
    const opponent = isHome ? (evt.away?.fullName || evt.away?.shortName) : (evt.home?.fullName || evt.home?.shortName);

    const homeScoreNum = parseInt(homeScore, 10);
    const awayScoreNum = parseInt(awayScore, 10);
    let resultChar = 'D';
    if (!isNaN(homeScoreNum) && !isNaN(awayScoreNum) && homeScoreNum !== awayScoreNum) {
      if (isHome) resultChar = homeScoreNum > awayScoreNum ? 'W' : 'L';
      else resultChar = awayScoreNum > homeScoreNum ? 'W' : 'L';
    }

    const eventDate = new Date(evt.startDateTime || evt.date?.iso);
    const formattedDate = !isNaN(eventDate.getTime())
      ? eventDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : evt.date?.shortDate || 'N/A';

    latestResult = {
      opponent: opponent || 'Opponent',
      score: `${homeScore}–${awayScore}`,
      result: resultChar,
      date: formattedDate,
      competition: last.cleanComp
    };
  }

  // Next Fixture
  let nextFixture = null;
  if (upcomingEvents.length > 0) {
    const next = upcomingEvents[0];
    const evt = next.evt;
    const isHome = next.isHome;
    const opponent = isHome ? (evt.away?.fullName || evt.away?.shortName) : (evt.home?.fullName || evt.home?.shortName);

    const eventDate = new Date(evt.startDateTime || evt.date?.iso);
    const formattedDate = !isNaN(eventDate.getTime())
      ? eventDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : evt.date?.shortDate || 'TBD';

    const formattedTime = !isNaN(eventDate.getTime())
      ? eventDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : evt.date?.time || 'TBD';

    nextFixture = {
      opponent: opponent || 'TBD',
      date: formattedDate,
      time: formattedTime,
      competition: next.cleanComp
    };
  }

  // Fetch League Table Standings
  let leaguePosition = { league: team.tableSlug || 'League', rank: 'N/A', points: 0, played: 0 };
  if (team.tableSlug) {
    try {
      const tableUrl = `https://www.bbc.com/sport/football/${team.tableSlug}/table`;
      console.log(`📡 Fetching BBC League Table: ${tableUrl}`);
      const tableRes = await fetch(tableUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (tableRes.ok) {
        const tableHtml = await tableRes.text();
        const tMatch = tableHtml.match(/window\.__INITIAL_DATA__\s*=\s*\"(.*?)\";/s);
        if (tMatch) {
          const tRaw = JSON.parse('"' + tMatch[1] + '"');
          const tParsed = JSON.parse(tRaw);
          for (const k of Object.keys(tParsed.data || {})) {
            if (k.startsWith('football-table')) {
              const ft = tParsed.data[k].data;
              const tournName = ft.tournaments?.[0]?.name || team.tableSlug;
              const participants = ft.tournaments?.[0]?.stages?.[0]?.rounds?.[0]?.participants || [];
              const searchStr = (team.searchName || team.name).toLowerCase();
              const found = participants.find(
                p => p.name.toLowerCase().includes(searchStr) || p.shortName.toLowerCase().includes(searchStr)
              );
              if (found) {
                leaguePosition = {
                  league: tournName,
                  rank: found.rank,
                  points: found.points,
                  played: found.matchesPlayed
                };
              }
            }
          }
        }
      }
    } catch (tblErr) {
      console.warn(`⚠️ League table fetch warning for ${team.name}:`, tblErr.message);
    }
  }

  const cupArr = Array.from(cupCompetitions);
  const cupProgressStr = cupArr.length > 0 ? cupArr.join(' • ') : 'None active';

  return {
    id: team.bbcSlug || team.espnId || team.name.toLowerCase().replace(/\s+/g, '-'),
    name: team.name,
    searchName: team.searchName || team.name,
    latestResult,
    leaguePosition,
    nextFixture,
    cupProgress: cupProgressStr
  };
}

/**
 * Secondary Fallback Fetcher: Pulls schedule & standings from ESPN API
 */
async function fetchFromESPN(team) {
  console.log(`📡 Falling back to ESPN API for ${team.name}...`);
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${team.leagueSlug}/teams/${team.espnId}/schedule`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = await res.json();
  const events = data.events || [];

  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = new Date();
  const finished = events.filter(e => e.competitions?.[0]?.status?.type?.completed === true);
  const upcoming = events.filter(e => e.competitions?.[0]?.status?.type?.completed === false && new Date(e.date) >= now);

  const lastEvent = finished.length > 0 ? finished[finished.length - 1] : null;
  const nextEvent = upcoming.length > 0 ? upcoming[0] : null;

  let latestResult = null;
  if (lastEvent) {
    const comp = lastEvent.competitions[0];
    const competitors = comp.competitors || [];
    const targetTeam = competitors.find(c => c.team?.id === team.espnId);
    const opponent = competitors.find(c => c.team?.id !== team.espnId);
    const homeComp = competitors.find(c => c.homeAway === 'home');
    const awayComp = competitors.find(c => c.homeAway === 'away');

    let resultChar = 'D';
    if (targetTeam?.winner === true) resultChar = 'W';
    else if (opponent?.winner === true) resultChar = 'L';

    latestResult = {
      opponent: opponent?.team?.displayName || 'Opponent',
      score: `${homeComp?.score?.displayValue ?? '0'}–${awayComp?.score?.displayValue ?? '0'}`,
      result: resultChar,
      date: new Date(lastEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      competition: lastEvent.season?.slug || 'Match'
    };
  }

  let nextFixture = null;
  if (nextEvent) {
    const comp = nextEvent.competitions[0];
    const competitors = comp.competitors || [];
    const opponent = competitors.find(c => c.team?.id !== team.espnId);
    const matchDate = new Date(nextEvent.date);

    nextFixture = {
      opponent: opponent?.team?.displayName || 'TBD',
      date: matchDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      time: matchDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      competition: nextEvent.season?.slug || 'Match'
    };
  }

  let leaguePosition = { league: team.leagueSlug.toUpperCase(), rank: 'N/A', points: 0 };
  try {
    const stRes = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${team.leagueSlug}/standings`);
    if (stRes.ok) {
      const stData = await stRes.json();
      const entries = stData.children?.[0]?.standings?.entries || stData.standings?.entries || [];
      const teamEntry = entries.find(e => e.team?.id === team.espnId);
      if (teamEntry) {
        const stats = teamEntry.stats || [];
        const rankStat = stats.find(s => s.name === 'rank' || s.type === 'rank');
        const pointsStat = stats.find(s => s.name === 'points' || s.type === 'points');
        leaguePosition = {
          league: stData.name || 'League',
          rank: rankStat?.value ?? rankStat?.displayValue ?? 'N/A',
          points: pointsStat?.value ?? pointsStat?.displayValue ?? 0
        };
      }
    }
  } catch (stErr) {
    console.warn(`ESPN standings error for ${team.name}:`, stErr.message);
  }

  return {
    id: team.bbcSlug || team.espnId,
    name: team.name,
    searchName: team.searchName || team.name,
    latestResult,
    leaguePosition,
    nextFixture,
    cupProgress: 'N/A'
  };
}

async function updateAllTeams() {
  const results = [];

  for (const team of TEAMS_CONFIG) {
    console.log(`\n🔍 Updating ${team.name}...`);
    let teamData = null;

    if (team.bbcSlug) {
      try {
        teamData = await fetchFromBBC(team);
        console.log(`✅ Fetched ${team.name} via BBC Sport.`);
      } catch (bbcErr) {
        console.warn(`⚠️ BBC fetch failed for ${team.name}:`, bbcErr.message);
      }
    }

    if (!teamData && team.espnId && team.leagueSlug) {
      try {
        teamData = await fetchFromESPN(team);
        console.log(`✅ Fetched ${team.name} via ESPN API.`);
      } catch (espnErr) {
        console.error(`❌ ESPN fetch failed for ${team.name}:`, espnErr.message);
      }
    }

    if (teamData) {
      results.push(teamData);
    } else {
      console.error(`❌ Unable to fetch data for ${team.name} from any source.`);
    }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    teams: results
  };

  await fs.writeFile('./teams-data.json', JSON.stringify(payload, null, 2));
  console.log(`\n💾 Successfully updated teams-data.json with ${results.length} teams.`);
}

updateAllTeams();
