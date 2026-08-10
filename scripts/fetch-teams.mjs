import fs from 'fs/promises';

// -------------------------------------------------------------
// CONFIGURATION
// -------------------------------------------------------------
const TEAMS_CONFIG = [
  {
    name: 'Leeds United',
    searchName: 'Leeds',
    bbcSlug: 'leeds-united',
    sportSlug: 'soccer',
    leagueSlug: 'eng.1', // Use 'eng.2' if in the Championship
    espnId: '357'
  },
  {
    name: 'York City',
    searchName: 'York City',
    bbcSlug: 'york-city',
    sportSlug: 'soccer',
    leagueSlug: 'eng.5',
    espnId: '383'
  },
  {
    name: 'Cleveland Browns',
    searchName: 'Cleveland Browns',
    bbcSlug: null, // Skips BBC check for NFL
    sportSlug: 'football',
    leagueSlug: 'nfl',
    espnId: '5'
  }
];

// Helper to delay between API calls
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch Schedule & Results from ESPN
 */
async function fetchEspnSchedule(team) {
  const sport = team.sportSlug || 'soccer';
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${team.leagueSlug}/teams/${team.espnId}/schedule`;
  
  console.log(`📡 Fetching ESPN Schedule: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return await res.json();
}

/**
 * Fetch Standings from ESPN
 */
async function fetchEspnStandings(team) {
  const sport = team.sportSlug || 'soccer';
  const url = `https://site.api.espn.com/apis/v2/sports/${sport}/${team.leagueSlug}/standings`;
  
  console.log(`📡 Fetching ESPN Standings: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  return await res.json();
}

/**
 * Recursively search nested ESPN standings structures (handles soccer tables and NFL conference/division trees)
 */
function findTeamInStandings(data, teamId) {
  if (!data) return null;
  
  if (Array.isArray(data.entries)) {
    const found = data.entries.find(e => e.team?.id === teamId);
    if (found) return found;
  }
  
  if (Array.isArray(data.children)) {
    for (const child of data.children) {
      const found = findTeamInStandings(child, teamId);
      if (found) return found;
    }
  }
  
  if (Array.isArray(data.standings)) {
    for (const st of data.standings) {
      const found = findTeamInStandings(st, teamId);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Main Execution Function
 */
async function updateAllTeams() {
  const results = [];

  for (const team of TEAMS_CONFIG) {
    try {
      console.log(`\n🔍 Updating ${team.name}...`);

      // 1. Fetch Schedule & Results from ESPN
      const schedData = await fetchEspnSchedule(team);
      const events = schedData.events || [];

      // Sort events chronologically
      events.sort((a, b) => new Date(a.date) - new Date(b.date));

      const now = new Date();
      const finishedEvents = events.filter(e => e.competitions?.[0]?.status?.type?.completed === true);
      const upcomingEvents = events.filter(e => e.competitions?.[0]?.status?.type?.completed === false && new Date(e.date) >= now);

      const lastEvent = finishedEvents.length > 0 ? finishedEvents[finishedEvents.length - 1] : null;
      const nextEvent = upcomingEvents.length > 0 ? upcomingEvents[0] : null;

      // Format Last Match Result
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
          date: new Date(lastEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }),
          competition: lastEvent.season?.slug || team.leagueSlug.toUpperCase()
        };
      }

      // Format Next Fixture
      let nextFixture = null;
      if (nextEvent) {
        const comp = nextEvent.competitions[0];
        const competitors = comp.competitors || [];
        const opponent = competitors.find(c => c.team?.id !== team.espnId);
        const matchDate = new Date(nextEvent.date);

        nextFixture = {
          opponent: opponent?.team?.displayName || 'TBD',
          date: matchDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }),
          time: matchDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
          competition: nextEvent.season?.slug || team.leagueSlug.toUpperCase()
        };
      }

      // 2. Fetch Standings
      let leagueInfo = { league: team.leagueSlug.toUpperCase(), rank: 'N/A', points: 0 };
      try {
        const standingsData = await fetchEspnStandings(team);
        const leagueName = standingsData.name || standingsData.abbreviation || team.leagueSlug.toUpperCase();
        const teamEntry = findTeamInStandings(standingsData, team.espnId);

        if (teamEntry) {
          const stats = teamEntry.stats || [];
          const rankStat = stats.find(s => s.name === 'rank' || s.type === 'rank');
          const pointsStat = stats.find(s => s.name === 'points' || s.type === 'points' || s.name === 'wins');

          leagueInfo = {
            league: leagueName,
            rank: rankStat?.value ?? rankStat?.displayValue ?? 'N/A',
            points: pointsStat?.value ?? pointsStat?.displayValue ?? 0
          };
        }
      } catch (standingsErr) {
        console.warn(`⚠️ Could not fetch standings for ${team.name}: ${standingsErr.message}`);
      }

      results.push({
        id: team.espnId,
        name: team.name,
        searchName: team.searchName,
        latestResult,
        leaguePosition: leagueInfo,
        nextFixture
      });

      console.log(`✅ ${team.name} updated successfully.`);
      await delay(500);

    } catch (err) {
      console.error(`❌ Error processing ${team.name}:`, err.message);
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
