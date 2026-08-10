import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// TEAMS CONFIGURATION: Tracked teams requested by user
// 1. Leeds United
// 2. York City
// 3. Cleveland Browns
// ---------------------------------------------------------------------------
const TEAMS_CONFIG = [
  {
    type: 'soccer',
    name: 'Leeds United',
    searchName: 'Leeds',
    bbcSlug: 'leeds-united',
    tableSlug: 'premier-league',
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/357.png',
    defaultCups: [
      { name: 'FA Cup', defaultRound: '3rd Round' },
      { name: 'EFL Cup', defaultRound: '2nd Round' }
    ]
  },
  {
    type: 'soccer',
    name: 'York City',
    searchName: 'York',
    bbcSlug: 'york-city',
    tableSlug: 'league-two',
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/320.png',
    defaultCups: [
      { name: 'FA Cup', defaultRound: '1st Round' }
    ]
  },
  {
    type: 'nfl',
    name: 'Cleveland Browns',
    searchName: 'Cleveland Browns',
    espnTeamAbbrev: 'cle',
    espnTeamId: '5',
    logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png'
  }
];

// NFL 32-Team Division Lookup
const NFL_DIVISIONS = {
  "Arizona Cardinals": "NFC West", "ARI": "NFC West",
  "Atlanta Falcons": "NFC South", "ATL": "NFC South",
  "Baltimore Ravens": "AFC North", "BAL": "AFC North",
  "Buffalo Bills": "AFC East", "BUF": "AFC East",
  "Carolina Panthers": "NFC South", "CAR": "NFC South",
  "Chicago Bears": "NFC North", "CHI": "NFC North",
  "Cincinnati Bengals": "AFC North", "CIN": "AFC North",
  "Cleveland Browns": "AFC North", "CLE": "AFC North",
  "Dallas Cowboys": "NFC East", "DAL": "NFC East",
  "Denver Broncos": "AFC West", "DEN": "AFC West",
  "Detroit Lions": "NFC North", "DET": "NFC North",
  "Green Bay Packers": "NFC North", "GB": "NFC North",
  "Houston Texans": "AFC South", "HOU": "AFC South",
  "Indianapolis Colts": "AFC South", "IND": "AFC South",
  "Jacksonville Jaguars": "AFC South", "JAX": "AFC South", "JAC": "AFC South",
  "Kansas City Chiefs": "AFC West", "KC": "AFC West",
  "Las Vegas Raiders": "AFC West", "LV": "AFC West", "LVR": "AFC West",
  "Los Angeles Chargers": "AFC West", "LAC": "AFC West",
  "Los Angeles Rams": "NFC West", "LAR": "NFC West", "RAM": "NFC West",
  "Miami Dolphins": "AFC East", "MIA": "AFC East",
  "Minnesota Vikings": "NFC North", "MIN": "NFC North",
  "New England Patriots": "AFC East", "NE": "AFC East",
  "New Orleans Saints": "NFC South", "NO": "NFC South",
  "New York Giants": "NFC East", "NYG": "NFC East",
  "New York Jets": "AFC East", "NYJ": "AFC East",
  "Philadelphia Eagles": "NFC East", "PHI": "NFC East",
  "Pittsburgh Steelers": "AFC North", "PIT": "AFC North",
  "San Francisco 49ers": "NFC West", "SF": "NFC West",
  "Seattle Seahawks": "NFC West", "SEA": "NFC West",
  "Tampa Bay Buccaneers": "NFC South", "TB": "NFC South",
  "Tennessee Titans": "AFC South", "TEN": "AFC South",
  "Washington Commanders": "NFC East", "WAS": "NFC East", "WSH": "NFC East"
};

function getNFLOpponentWithDivision(oppName) {
  if (!oppName || oppName === 'TBD') return 'TBD';
  for (const [key, div] of Object.entries(NFL_DIVISIONS)) {
    if (oppName.toLowerCase() === key.toLowerCase() || oppName.toLowerCase().includes(key.toLowerCase())) {
      return `${oppName} (${div})`;
    }
  }
  return oppName;
}

/**
 * Fetcher for Soccer Teams (BBC Sport)
 */
async function fetchSoccerTeam(team) {
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
  let fetchedLogo = team.logo;

  for (const k of Object.keys(parsed.data || {})) {
    if (k.startsWith('topic-header') || k.includes('header')) {
      if (parsed.data[k]?.data?.badgeImage?.src) {
        fetchedLogo = parsed.data[k].data.badgeImage.src;
      }
    }
    if (k.startsWith('fixtures-banner') || k.startsWith('sport-data-scores-fixtures')) {
      if (parsed.data[k]?.data?.events) {
        events = parsed.data[k].data.events;
      }
    }
  }

  const finishedEvents = [];
  const upcomingEvents = [];
  const cupsMap = {};

  events.forEach(evt => {
    const rawCompName = evt.eventGroupingLabel || evt.tournament?.name || 'Match';
    const cleanComp = rawCompName
      .replace(/^England\s*-\s*/i, '')
      .replace(/^World\s*-\s*/i, '')
      .replace(/^Europe\s*-\s*/i, '');

    const isCup = cleanComp.toLowerCase().includes('cup') ||
                  cleanComp.toLowerCase().includes('trophy') ||
                  cleanComp.toLowerCase().includes('champions league') ||
                  cleanComp.toLowerCase().includes('europa');

    const homeName = evt.home?.fullName || evt.home?.shortName || '';
    const awayName = evt.away?.fullName || evt.away?.shortName || '';
    const searchStr = (team.searchName || team.name).toLowerCase();
    const isHome = homeName.toLowerCase().includes(searchStr) || team.name.toLowerCase().includes(homeName.toLowerCase());

    const isCompleted = evt.status === 'PostEvent' || evt.runningScores || evt.eventProgress?.period === 'FULL_TIME';

    if (isCup) {
      let baseCupName = cleanComp;
      let roundName = '';
      if (cleanComp.includes(' - ')) {
        const parts = cleanComp.split(' - ');
        baseCupName = parts[0].trim();
        roundName = parts.slice(1).join(' - ').trim();
      }

      if (!cupsMap[baseCupName]) {
        cupsMap[baseCupName] = {
          name: baseCupName,
          latestRound: roundName,
          hasUpcoming: false,
          lastResult: null
        };
      }

      if (isCompleted) {
        const homeScore = parseInt(evt.home?.runningScores?.fulltime ?? evt.home?.scores?.fulltime ?? '0', 10);
        const awayScore = parseInt(evt.away?.runningScores?.fulltime ?? evt.away?.scores?.fulltime ?? '0', 10);
        let lost = false;
        if (isHome) lost = homeScore < awayScore;
        else lost = awayScore < homeScore;

        cupsMap[baseCupName].lastResult = { lost, roundName, score: `${homeScore}–${awayScore}` };
      } else {
        cupsMap[baseCupName].hasUpcoming = true;
        if (roundName) cupsMap[baseCupName].latestRound = roundName;
      }
    }

    if (isCompleted) {
      finishedEvents.push({ evt, isHome, cleanComp });
    } else {
      upcomingEvents.push({ evt, isHome, cleanComp });
    }
  });

  // Ensure default tier cups are present if not in immediate events
  (team.defaultCups || []).forEach(defCup => {
    if (!cupsMap[defCup.name]) {
      cupsMap[defCup.name] = {
        name: defCup.name,
        latestRound: defCup.defaultRound,
        hasUpcoming: false,
        lastResult: null,
        isDefault: true
      };
    }
  });

  // Build Cup Progress list
  const cups = Object.values(cupsMap).map(c => {
    let status = 'Active';
    let isEliminated = false;

    if (c.lastResult?.lost && !c.hasUpcoming && !c.latestRound.toLowerCase().includes('group stage')) {
      status = `Eliminated (${c.lastResult.roundName || c.latestRound || 'Knockout Stage'})`;
      isEliminated = true;
    } else if (c.hasUpcoming) {
      status = `Active (${c.latestRound || 'In Progress'})`;
    } else if (c.isDefault) {
      status = `Active (${c.latestRound || 'Not started'})`;
    } else {
      status = `Active (${c.latestRound || 'In Progress'})`;
    }

    return {
      name: c.name,
      status,
      isEliminated
    };
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

  return {
    id: team.bbcSlug || team.name.toLowerCase().replace(/\s+/g, '-'),
    name: team.name,
    searchName: team.searchName || team.name,
    sport: 'Soccer',
    logo: fetchedLogo,
    latestResult,
    leaguePosition,
    nextFixture,
    cups
  };
}

/**
 * Fetcher for NFL Teams (ESPN API)
 */
async function fetchNFLTeam(team) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.espnTeamAbbrev}/schedule`;
  console.log(`📡 Fetching NFL Team Schedule from ESPN: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = await res.json();
  const events = data.events || [];

  const fetchedLogo = data.team?.logo || team.logo;

  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = new Date();
  const finished = events.filter(e => e.competitions?.[0]?.status?.type?.completed === true);
  const upcoming = events.filter(e => e.competitions?.[0]?.status?.type?.completed === false && new Date(e.date) >= now);

  const lastEvent = finished.length > 0 ? finished[finished.length - 1] : null;
  const nextEvent = upcoming.length > 0 ? upcoming[0] : (events.length > 0 ? events[0] : null);

  let latestResult = null;
  if (lastEvent) {
    const comp = lastEvent.competitions[0];
    const competitors = comp.competitors || [];
    const targetTeam = competitors.find(c => c.team?.id === team.espnTeamId || c.team?.abbreviation?.toLowerCase() === team.espnTeamAbbrev.toLowerCase());
    const opponentObj = competitors.find(c => c.team?.id !== targetTeam?.team?.id);
    const homeComp = competitors.find(c => c.homeAway === 'home');
    const awayComp = competitors.find(c => c.homeAway === 'away');

    let resultChar = 'D';
    if (targetTeam?.winner === true) resultChar = 'W';
    else if (opponentObj?.winner === true) resultChar = 'L';

    const oppRawName = opponentObj?.team?.displayName || 'Opponent';
    const oppWithDiv = getNFLOpponentWithDivision(oppRawName);

    latestResult = {
      opponent: oppWithDiv,
      score: `${homeComp?.score?.displayValue ?? '0'}–${awayComp?.score?.displayValue ?? '0'}`,
      result: resultChar,
      date: new Date(lastEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      competition: lastEvent.seasonType?.name || lastEvent.season?.displayName || 'NFL'
    };
  }

  let nextFixture = null;
  if (nextEvent) {
    const comp = nextEvent.competitions[0];
    const competitors = comp.competitors || [];
    const targetTeam = competitors.find(c => c.team?.id === team.espnTeamId || c.team?.abbreviation?.toLowerCase() === team.espnTeamAbbrev.toLowerCase());
    const opponentObj = competitors.find(c => c.team?.id !== targetTeam?.team?.id);
    const matchDate = new Date(nextEvent.date);

    const oppRawName = opponentObj?.team?.displayName || 'TBD';
    const oppWithDiv = getNFLOpponentWithDivision(oppRawName);

    nextFixture = {
      opponent: oppWithDiv,
      date: matchDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      time: matchDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      competition: nextEvent.week?.text || nextEvent.seasonType?.name || 'NFL'
    };
  }

  let leaguePosition = { league: 'AFC North', rank: 'N/A', points: '0W-0L', played: 0 };
  try {
    const stRes = await fetch('https://site.api.espn.com/apis/v2/sports/football/nfl/standings');
    if (stRes.ok) {
      const stData = await stRes.json();
      function findBrownsEntry(group) {
        if (group.standings?.entries) {
          const found = group.standings.entries.find(e => e.team?.id === team.espnTeamId || e.team?.abbreviation?.toLowerCase() === team.espnTeamAbbrev.toLowerCase());
          if (found) return { groupName: group.name, entry: found };
        }
        if (group.children) {
          for (const child of group.children) {
            const res = findBrownsEntry(child);
            if (res) return res;
          }
        }
        return null;
      }
      const foundObj = findBrownsEntry(stData);
      if (foundObj) {
        const stats = foundObj.entry.stats || [];
        const rankStat = stats.find(s => s.name === 'rank' || s.type === 'rank');
        const winsStat = stats.find(s => s.name === 'wins' || s.type === 'wins');
        const lossesStat = stats.find(s => s.name === 'losses' || s.type === 'losses');
        const winsVal = winsStat?.value ?? 0;
        const lossesVal = lossesStat?.value ?? 0;
        leaguePosition = {
          league: 'AFC North',
          rank: rankStat?.value ?? rankStat?.displayValue ?? 'N/A',
          points: `${winsVal}W-${lossesVal}L`,
          played: winsVal + lossesVal
        };
      }
    }
  } catch (e) {
    console.warn('NFL standings error:', e.message);
  }

  return {
    id: team.name.toLowerCase().replace(/\s+/g, '-'),
    name: team.name,
    searchName: team.searchName || team.name,
    sport: 'American Football',
    logo: fetchedLogo,
    latestResult,
    leaguePosition,
    nextFixture,
    cups: null // NFL teams do not have a cup section
  };
}

async function updateAllTeams() {
  const results = [];

  for (const team of TEAMS_CONFIG) {
    console.log(`\n🔍 Updating ${team.name}...`);
    let teamData = null;

    try {
      if (team.type === 'soccer') {
        teamData = await fetchSoccerTeam(team);
      } else if (team.type === 'nfl') {
        teamData = await fetchNFLTeam(team);
      }
    } catch (err) {
      console.error(`❌ Failed to fetch ${team.name}:`, err.message);
    }

    if (teamData) {
      results.push(teamData);
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
