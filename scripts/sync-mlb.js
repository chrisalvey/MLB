const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// MLB Stats API Base URL
const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// Team abbreviation mapping (MLB API uses different IDs)
const TEAM_ABBREV_MAP = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KCR', 119: 'LAD', 120: 'WSN', 121: 'NYM', 133: 'OAK',
  134: 'PIT', 135: 'SDP', 136: 'SEA', 137: 'SFG', 138: 'STL',
  139: 'TBR', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CHW', 146: 'MIA', 147: 'NYY', 158: 'MIL'
};

// Helper function to read JSON file
async function readJSON(filename) {
  const filepath = path.join(__dirname, '..', 'data', filename);
  const data = await fs.readFile(filepath, 'utf8');
  return JSON.parse(data);
}

// Helper function to write JSON file
async function writeJSON(filename, data) {
  const filepath = path.join(__dirname, '..', 'data', filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
}

// Fetch current standings from MLB API
async function fetchStandings() {
  try {
    const url = `${MLB_API_BASE}/standings?leagueId=103,104&season=2026`;
    console.log(`Fetching standings from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MLB API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching standings:', error.message);
    throw error;
  }
}

// Fetch schedule/results for a date range to calculate runs
async function fetchSchedule(startDate, endDate) {
  try {
    const url = `${MLB_API_BASE}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}`;
    console.log(`Fetching schedule from ${startDate} to ${endDate}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MLB API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching schedule:', error.message);
    throw error;
  }
}

// Calculate runs scored/allowed from schedule data
function calculateRunsFromSchedule(scheduleData) {
  const teamStats = {};

  if (!scheduleData.dates) {
    return teamStats;
  }

  scheduleData.dates.forEach(date => {
    if (!date.games) return;

    date.games.forEach(game => {
      // Only count completed games
      if (game.status.statusCode !== 'F') return;

      const awayTeam = game.teams.away.team.id;
      const homeTeam = game.teams.home.team.id;
      const awayScore = game.teams.away.score || 0;
      const homeScore = game.teams.home.score || 0;

      const awayAbbrev = TEAM_ABBREV_MAP[awayTeam];
      const homeAbbrev = TEAM_ABBREV_MAP[homeTeam];

      if (!awayAbbrev || !homeAbbrev) return;

      // Initialize team stats if needed
      if (!teamStats[awayAbbrev]) {
        teamStats[awayAbbrev] = { runsScored: 0, runsAllowed: 0, gamesPlayed: 0 };
      }
      if (!teamStats[homeAbbrev]) {
        teamStats[homeAbbrev] = { runsScored: 0, runsAllowed: 0, gamesPlayed: 0 };
      }

      // Update stats
      teamStats[awayAbbrev].runsScored += awayScore;
      teamStats[awayAbbrev].runsAllowed += homeScore;
      teamStats[awayAbbrev].gamesPlayed += 1;

      teamStats[homeAbbrev].runsScored += homeScore;
      teamStats[homeAbbrev].runsAllowed += awayScore;
      teamStats[homeAbbrev].gamesPlayed += 1;
    });
  });

  return teamStats;
}

// Parse standings data into our format
function parseStandings(standingsData, runsData) {
  const teams = {};

  standingsData.records.forEach(division => {
    division.teamRecords.forEach(teamRecord => {
      const teamId = teamRecord.team.id;
      const abbrev = TEAM_ABBREV_MAP[teamId];

      if (!abbrev) {
        console.warn(`Unknown team ID: ${teamId}`);
        return;
      }

      const runs = runsData[abbrev] || { runsScored: 0, runsAllowed: 0, gamesPlayed: 0 };
      const runsPerGame = runs.gamesPlayed > 0 ? runs.runsScored / runs.gamesPlayed : 0;

      teams[abbrev] = {
        name: teamRecord.team.name,
        abbreviation: abbrev,
        wins: teamRecord.leagueRecord.wins,
        losses: teamRecord.leagueRecord.losses,
        winPct: parseFloat(teamRecord.leagueRecord.pct),
        runsScored: runs.runsScored,
        runsAllowed: runs.runsAllowed,
        gamesPlayed: runs.gamesPlayed,
        runsPerGame: parseFloat(runsPerGame.toFixed(2))
      };
    });
  });

  return teams;
}

// Calculate quarterly stats for teams
function calculateQuarterlyStats(teams, quarters, currentDate) {
  const quarterlyStats = { Q1: {}, Q2: {}, Q3: {}, Q4: {} };

  // For now, we'll just copy current season stats
  // In production, you'd fetch schedule data for each quarter date range
  Object.keys(quarters.quarters).forEach(quarter => {
    const quarterInfo = quarters.quarters[quarter];
    const start = new Date(quarterInfo.startDate);
    const end = new Date(quarterInfo.endDate);
    const now = new Date(currentDate);

    // Only populate if quarter has started
    if (now >= start) {
      Object.keys(teams).forEach(abbrev => {
        quarterlyStats[quarter][abbrev] = {
          wins: teams[abbrev].wins,
          losses: teams[abbrev].losses,
          winPct: teams[abbrev].winPct,
          runsScored: teams[abbrev].runsScored,
          runsPerGame: teams[abbrev].runsPerGame
        };
      });
    }
  });

  return quarterlyStats;
}

// Calculate player scores based on their rosters
function calculatePlayerScores(players, teams, quarterlyStats) {
  const playerScores = { Q1: {}, Q2: {}, Q3: {}, Q4: {} };

  Object.keys(quarterlyStats).forEach(quarter => {
    players.players.forEach(player => {
      const quarterRoster = player.quarters[quarter];

      // Skip if player hasn't made picks for this quarter
      if (!quarterRoster) return;

      const rosterTeams = [
        quarterRoster.tier1,
        quarterRoster.tier2,
        quarterRoster.tier3,
        quarterRoster.tier4
      ].filter(Boolean);

      if (rosterTeams.length === 0) return;

      // Calculate combined stats
      let totalWins = 0;
      let totalLosses = 0;
      let totalRuns = 0;
      let totalGames = 0;

      rosterTeams.forEach(teamAbbrev => {
        const teamStats = quarterlyStats[quarter][teamAbbrev];
        if (teamStats) {
          totalWins += teamStats.wins;
          totalLosses += teamStats.losses;
          totalRuns += teamStats.runsScored;
          // Estimate games from wins + losses
          const games = teamStats.wins + teamStats.losses;
          totalGames += games;
        }
      });

      const combinedWinPct = (totalWins + totalLosses) > 0
        ? totalWins / (totalWins + totalLosses)
        : 0;

      const combinedRunsPerGame = totalGames > 0
        ? totalRuns / totalGames
        : 0;

      playerScores[quarter][player.id] = {
        name: player.name,
        teams: rosterTeams,
        combinedWinPct: parseFloat(combinedWinPct.toFixed(3)),
        combinedRunsPerGame: parseFloat(combinedRunsPerGame.toFixed(2)),
        rank: 0 // Will be calculated after sorting
      };
    });

    // Calculate rankings for this quarter
    const scores = Object.values(playerScores[quarter]);
    scores.sort((a, b) => {
      // Sort by win percentage, then by runs per game
      if (b.combinedWinPct !== a.combinedWinPct) {
        return b.combinedWinPct - a.combinedWinPct;
      }
      return b.combinedRunsPerGame - a.combinedRunsPerGame;
    });

    scores.forEach((score, index) => {
      score.rank = index + 1;
    });
  });

  return playerScores;
}

// Main sync function
async function sync() {
  try {
    console.log('Starting MLB data sync...');

    // Read current data files
    const players = await readJSON('players.json');
    const quarters = await readJSON('quarters.json');

    // Fetch latest standings
    const standingsData = await fetchStandings();

    // Fetch schedule for the current season to get runs data
    const today = new Date().toISOString().split('T')[0];
    const seasonStart = '2026-03-25';
    const scheduleData = await fetchSchedule(seasonStart, today);

    // Calculate runs from schedule
    const runsData = calculateRunsFromSchedule(scheduleData);

    // Parse standings
    const teams = parseStandings(standingsData, runsData);

    // Calculate quarterly stats
    const quarterlyStats = calculateQuarterlyStats(teams, quarters, today);

    // Calculate player scores
    const playerScores = calculatePlayerScores(players, teams, quarterlyStats);

    // Build final standings object
    const standings = {
      lastUpdated: new Date().toISOString(),
      season: 2026,
      teams,
      quarterlyStats,
      playerScores
    };

    // Write updated standings
    await writeJSON('standings.json', standings);

    console.log('✓ Sync completed successfully!');
    console.log(`✓ Updated ${Object.keys(teams).length} teams`);
    console.log(`✓ Last updated: ${standings.lastUpdated}`);

  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

// Run sync
sync();
