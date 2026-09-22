'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dices, ArrowLeft, Plus, Trash2, Shield, Users, Zap } from 'lucide-react';
import { Field, Spinner, apiCall, inputClass, useToast } from '@/components/ui';
import { maxWicketsForSquad } from '@/lib/matchRules';

interface SquadInput {
  playerName: string;
  role: string;
}

/** One side of the match setup: team identity plus the squad playing today. */
function TeamPanel({
  title,
  accent,
  teams,
  allPlayerNames,
  teamName,
  setTeamName,
  shortName,
  setShortName,
  squad,
  setSquad,
}: any) {
  const [newName, setNewName] = useState('');

  function add(name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (squad.some((p: SquadInput) => p.playerName.toLowerCase() === clean.toLowerCase())) return;
    setSquad([...squad, { playerName: clean, role: 'ALL_ROUNDER' }]);
    setNewName('');
  }

  const suggestions = allPlayerNames.filter(
    (n: string) => !squad.some((p: SquadInput) => p.playerName.toLowerCase() === n.toLowerCase())
  );

  return (
    <div className="p-4 bg-pitch-dark rounded-xl border border-pitch-border space-y-3">
      <h3 className={`font-bold text-sm flex items-center gap-2 ${accent}`}>
        <Shield className="w-4 h-4" /> {title}
      </h3>

      <Field label="Team name">
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          list="existing-teams"
          placeholder="Team name"
          className={inputClass}
        />
      </Field>
      <datalist id="existing-teams">
        {teams.map((t: any) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      <Field label="Short code" hint="Shown on the scorecard.">
        <input
          value={shortName}
          onChange={(e) => setShortName(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="ABC"
          className={inputClass}
        />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-300">Squad ({squad.length})</span>
          {squad.length > 0 && (
            <span className="text-[10px] text-gray-500">
              all out at {maxWicketsForSquad(squad.length)} wkts
            </span>
          )}
        </div>

        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {squad.length === 0 && (
            <p className="text-[11px] text-gray-500 text-center py-3">
              Add at least 2 players.
            </p>
          )}
          {squad.map((p: SquadInput, i: number) => (
            <div
              key={`${p.playerName}-${i}`}
              className="flex items-center gap-2 p-2 rounded-lg bg-pitch-card border border-pitch-border"
            >
              <span className="text-[10px] text-gray-500 w-4 shrink-0">{i + 1}.</span>
              <span className="text-xs text-gray-100 flex-1 truncate">{p.playerName}</span>
              <select
                value={p.role}
                onChange={(e) => {
                  const next = [...squad];
                  next[i] = { ...next[i], role: e.target.value };
                  setSquad(next);
                }}
                aria-label={`Role for ${p.playerName}`}
                className="text-[10px] bg-pitch-dark border border-pitch-border rounded px-1.5 py-1 text-gray-300 shrink-0"
              >
                <option value="BATSMAN">Bat</option>
                <option value="BOWLER">Bowl</option>
                <option value="ALL_ROUNDER">All</option>
                <option value="WICKETKEEPER">WK</option>
              </select>
              <button
                type="button"
                onClick={() => setSquad(squad.filter((_: any, x: number) => x !== i))}
                aria-label={`Remove ${p.playerName}`}
                className="p-1 rounded text-gray-400 hover:text-red-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(newName);
              }
            }}
            placeholder="Add a player…"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => add(newName)}
            className="px-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-white shrink-0"
            aria-label="Add player to squad"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">
              Registered players
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 10).map((n: string) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => add(n)}
                  className="px-2 py-1 rounded-lg bg-pitch-card border border-pitch-border text-[11px] text-gray-300 hover:border-cricket-700"
                >
                  + {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreateMatchPage() {
  const router = useRouter();
  const toast = useToast();

  const [teams, setTeams] = useState<any[]>([]);
  const [allPlayerNames, setAllPlayerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [teamAName, setTeamAName] = useState('');
  const [teamAShort, setTeamAShort] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamBShort, setTeamBShort] = useState('');
  const [teamASquad, setTeamASquad] = useState<SquadInput[]>([]);
  const [teamBSquad, setTeamBSquad] = useState<SquadInput[]>([]);

  const [venue, setVenue] = useState('');
  const [overs, setOvers] = useState(6);
  const [ballType, setBallType] = useState('TAPE_BALL');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [t, p] = await Promise.all([apiCall('/api/teams'), apiCall('/api/players')]);
        setTeams(t.teams);
        setAllPlayerNames(p.players.map((x: any) => x.fullName));
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull in a known team's squad automatically when its name is typed or picked.
  function autofillSquad(name: string, setSquad: (s: SquadInput[]) => void, setShort: (s: string) => void) {
    const team = teams.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (!team) return;
    setShort(team.shortName);
    if (team.players?.length) {
      setSquad(
        team.players.slice(0, 11).map((tp: any) => ({
          playerName: tp.player.fullName,
          role: tp.player.role || 'ALL_ROUNDER',
        }))
      );
    }
  }

  /** Finds an existing team by name, or creates it. */
  async function resolveTeam(name: string, short: string) {
    const existing = teams.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    const created = await apiCall('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), shortName: short.trim() || name.slice(0, 3) }),
    });
    return created.team.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!teamAName.trim() || !teamBName.trim()) return setError('Both teams need a name.');
    if (teamAName.trim().toLowerCase() === teamBName.trim().toLowerCase()) {
      return setError('The two teams must have different names.');
    }
    if (!venue.trim()) return setError('Enter the venue.');
    if (teamASquad.length < 2 || teamBSquad.length < 2) {
      return setError('Each team needs at least 2 players.');
    }

    try {
      setSubmitting(true);
      const homeTeamId = await resolveTeam(teamAName, teamAShort);
      const awayTeamId = await resolveTeam(teamBName, teamBShort);

      const data = await apiCall('/api/matches', {
        method: 'POST',
        body: JSON.stringify({
          matchType: 'SINGLE',
          stage: 'FRIENDLY',
          homeTeamId,
          awayTeamId,
          venue,
          overs,
          ballType,
          date: new Date(date).toISOString(),
          teamASquad,
          teamBSquad,
        }),
      });

      toast.success('Match created — time for the toss');
      router.push(`/score/${data.match.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Loading teams and players…" />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <button
        onClick={() => router.push('/matches')}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> All matches
      </button>

      <form onSubmit={handleSubmit} className="bg-pitch-card border border-pitch-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3 border-b border-pitch-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-900/60 border border-amber-700 flex items-center justify-center shrink-0">
            <Dices className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">New single match</h1>
            <p className="text-xs text-gray-400">
              Type any team and player names — anything new is registered automatically.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div onBlur={() => autofillSquad(teamAName, setTeamASquad, setTeamAShort)}>
            <TeamPanel
              title="Team A (home)"
              accent="text-amber-400"
              teams={teams}
              allPlayerNames={allPlayerNames}
              teamName={teamAName}
              setTeamName={setTeamAName}
              shortName={teamAShort}
              setShortName={setTeamAShort}
              squad={teamASquad}
              setSquad={setTeamASquad}
            />
          </div>
          <div onBlur={() => autofillSquad(teamBName, setTeamBSquad, setTeamBShort)}>
            <TeamPanel
              title="Team B (away)"
              accent="text-blue-400"
              teams={teams}
              allPlayerNames={allPlayerNames}
              teamName={teamBName}
              setTeamName={setTeamBName}
              shortName={teamBShort}
              setShortName={setTeamBShort}
              squad={teamBSquad}
              setSquad={setTeamBSquad}
            />
          </div>
        </div>

        <div className="p-4 bg-pitch-dark rounded-xl border border-pitch-border space-y-3">
          <h3 className="font-bold text-cricket-400 text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" /> Match settings
          </h3>

          <Field label="Venue">
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Shahodi Cricket Ground"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Overs per innings">
              <input
                type="number"
                min={1}
                max={50}
                value={overs}
                onChange={(e) => setOvers(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Ball type">
              <select value={ballType} onChange={(e) => setBallType(e.target.value)} className={inputClass}>
                <option value="TAPE_BALL">Tape ball</option>
                <option value="TENNIS_BALL">Tennis ball</option>
                <option value="LEATHER_BALL">Leather ball</option>
              </select>
            </Field>
          </div>

          <Field label="Date & time">
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="p-3 rounded-xl bg-pitch-dark border border-pitch-border text-[11px] text-gray-400 flex gap-2">
          <Users className="w-4 h-4 text-cricket-400 shrink-0 mt-0.5" />
          <p>
            With 5 players or fewer per side, every batter must be dismissed (last man standing).
            With 6 or more, the innings ends one wicket short as in the full game.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-bold text-white disabled:opacity-40 transition"
        >
          {submitting ? 'Creating…' : 'Create match & go to the toss'}
        </button>
      </form>
    </div>
  );
}
