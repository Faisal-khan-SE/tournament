'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, ArrowLeft, Shield, PlusCircle, Plus } from 'lucide-react';
import { Field, Spinner, apiCall, inputClass, useToast } from '@/components/ui';
import { TeamEntry, TeamEntryCard, newTeamEntry } from '@/components/TeamBuilder';

export default function CreateTournamentPage() {
  const router = useRouter();
  const toast = useToast();

  // Teams already registered on the platform, offered through a dropdown
  // rather than pre-selected: a new tournament starts with an empty list.
  const [registeredTeams, setRegisteredTeams] = useState<any[]>([]);
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [pickExisting, setPickExisting] = useState('');
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [defaultOvers, setDefaultOvers] = useState(6);
  const [ballType, setBallType] = useState('TAPE_BALL');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiCall('/api/teams');
        setRegisteredTeams(data.teams);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addable = useMemo(
    () => registeredTeams.filter((t) => !entries.some((e) => e.teamId === t.id)),
    [registeredTeams, entries]
  );

  // Preview of the schedule the Generate button will build later: every team
  // against every other team in its group.
  const schedule = useMemo(() => {
    const grouped = entries.filter((e) => e.groupName);
    if (grouped.length > 0 && grouped.length !== entries.length) {
      return { ok: false, text: `${entries.length - grouped.length} team(s) have no group — assign every team a group, or none.` };
    }
    const pools = new Map<string, number>();
    for (const e of entries) pools.set(e.groupName || '', (pools.get(e.groupName || '') || 0) + 1);
    let matches = 0;
    const lonely: string[] = [];
    for (const [g, n] of Array.from(pools.entries())) {
      if (n < 2 && g) lonely.push(g);
      matches += (n * (n - 1)) / 2;
    }
    if (lonely.length) return { ok: false, text: `Group ${lonely.join(', ')} has only one team.` };
    if (entries.length < 2) return { ok: false, text: 'Add at least two teams.' };
    const groupText = grouped.length ? ` in ${pools.size} group${pools.size === 1 ? '' : 's'}` : '';
    return { ok: true, text: `${matches} league match${matches === 1 ? '' : 'es'}${groupText} — every team plays every other team in its group. Generate them from the tournament page when you're ready.` };
  }, [entries]);

  function updateEntry(key: string, next: TeamEntry) {
    setEntries((prev) => prev.map((e) => (e.key === key ? next : e)));
  }

  function addExisting(teamId: string) {
    const team = registeredTeams.find((t) => t.id === teamId);
    if (!team) return;
    setEntries((prev) => [
      ...prev,
      {
        ...newTeamEntry(),
        teamId: team.id,
        name: team.name,
        shortName: team.shortName,
        existingPlayerCount: team.players?.length || 0,
      },
    ]);
    setPickExisting('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Give the tournament a name.');
    if (!venue.trim()) return setError('Enter the venue.');
    if (entries.length < 2) return setError('Add at least 2 teams.');
    const unnamed = entries.find((e) => !e.teamId && !e.name.trim());
    if (unnamed) return setError('Every new team needs a name.');
    const names = entries.map((e) => e.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return setError('Two teams have the same name.');
    if (!schedule.ok) return setError(schedule.text);
    if (new Date(endDate) < new Date(startDate)) {
      return setError('The end date cannot be before the start date.');
    }

    try {
      setSubmitting(true);
      const data = await apiCall('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          name,
          venue,
          defaultOvers,
          ballType,
          description,
          rules,
          contactInfo,
          startDate,
          endDate,
          teams: entries.map((e) =>
            e.teamId
              ? { teamId: e.teamId, groupName: e.groupName || null }
              : { name: e.name.trim(), shortName: e.shortName.trim(), players: e.players, groupName: e.groupName || null }
          ),
        }),
      });
      toast.success('Tournament created — generate the fixtures when the teams are final');
      router.push(`/tournaments/${data.tournament.slug}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Loading teams…" />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <button
        onClick={() => router.push('/tournaments')}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> All tournaments
      </button>

      <form onSubmit={handleSubmit} className="bg-pitch-card border border-pitch-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex items-center gap-3 border-b border-pitch-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-cricket-900/80 border border-cricket-700 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-cricket-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">New tournament</h1>
            <p className="text-xs text-gray-400">
              Add teams and players, put them in groups, then generate the fixtures.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <Field label="Tournament name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shahodi Ramzan Cup 2026"
            className={inputClass}
            autoFocus
          />
        </Field>

        <Field label="Venue">
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Shahodi Cricket Ground"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Overs per innings">
            <input
              type="number"
              min={1}
              max={50}
              value={defaultOvers}
              onChange={(e) => setDefaultOvers(Number(e.target.value))}
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

        {/* Teams */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">
              Teams ({entries.length})
            </span>
            <button
              type="button"
              onClick={() => setEntries((prev) => [...prev, newTeamEntry()])}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cricket-600 hover:bg-cricket-500 text-[11px] font-bold text-white"
            >
              <Plus className="w-3.5 h-3.5" /> New team
            </button>
          </div>

          {entries.length === 0 ? (
            <div className="p-5 rounded-xl bg-pitch-dark border border-dashed border-pitch-border text-center">
              <Shield className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                No teams yet. Create a new team and type in its players, or add a team that is
                already registered.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <TeamEntryCard
                  key={entry.key}
                  entry={entry}
                  onChange={(next) => updateEntry(entry.key, next)}
                  onRemove={() => setEntries((prev) => prev.filter((e) => e.key !== entry.key))}
                />
              ))}
            </div>
          )}

          {addable.length > 0 && (
            <div className="flex gap-2">
              <select
                value={pickExisting}
                onChange={(e) => setPickExisting(e.target.value)}
                className={inputClass}
              >
                <option value="">Add an existing team…</option>
                {addable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.players?.length || 0} players)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => pickExisting && addExisting(pickExisting)}
                disabled={!pickExisting}
                className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-40 shrink-0 flex items-center gap-1"
              >
                <PlusCircle className="w-4 h-4" /> Add
              </button>
            </div>
          )}

          <p className={`text-[11px] ${schedule.ok ? 'text-gray-500' : 'text-amber-400'}`}>
            {entries.length === 0 ? 'Groups are optional — leave them empty for a single league.' : schedule.text}
          </p>
        </div>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>

        <Field label="Local rules (optional)">
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={3}
            placeholder="One-bounce catches, last man standing, boundary sizes…"
            className={inputClass}
          />
        </Field>

        <Field label="Organiser contact (optional)">
          <input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="Phone or email"
            className={inputClass}
          />
        </Field>

        <button
          type="submit"
          disabled={submitting || entries.length < 2}
          className="w-full py-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-sm font-bold text-white disabled:opacity-40 transition"
        >
          {submitting ? 'Creating…' : `Create tournament with ${entries.length} team${entries.length === 1 ? '' : 's'}`}
        </button>
      </form>
    </div>
  );
}
