'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  Copy,
  Check,
  PlayCircle,
  Award,
  Download,
  Trash2,
  CloudRain,
  RotateCcw,
  Settings,
} from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  Spinner,
  StatusBadge,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';
import { oversDisplay } from '@/lib/matchRules';

export default function PublicMatchPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const matchId = params.id as string;

  const [match, setMatch] = useState<any>(null);
  const [teamByPlayerId, setTeamByPlayerId] = useState<Record<string, string>>({});
  const [potmSuggestions, setPotmSuggestions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'SCORECARD' | 'COMMENTARY' | 'INFO'>('SCORECARD');
  const [confirm, setConfirm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [potmOpen, setPotmOpen] = useState(false);
  const [tieBreakOpen, setTieBreakOpen] = useState(false);

  const fetchMatch = useCallback(
    async (showSpinner = false) => {
      try {
        if (showSpinner) setLoading(true);
        const data = await apiCall(`/api/matches/${matchId}`);
        setMatch(data.match);
        setTeamByPlayerId(data.teamByPlayerId || {});
        setPotmSuggestions(data.potmSuggestions || null);
      } catch (e: any) {
        if (e.message?.includes('not found')) setNotFound(true);
      } finally {
        setLoading(false);
      }
    },
    [matchId]
  );

  useEffect(() => {
    fetchMatch(true);
  }, [fetchMatch]);

  // Poll only while the match is actually in play — a finished scorecard does
  // not need a request every three seconds.
  useEffect(() => {
    if (!match) return;
    const live = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
    if (!live) return;
    const id = setInterval(() => fetchMatch(false), 5000);
    return () => clearInterval(id);
  }, [match, fetchMatch]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error('Could not copy the link')
    );
  }

  async function runAction(body: any, message: string) {
    try {
      setBusy(true);
      await apiCall(`/api/matches/${matchId}`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(message);
      setConfirm(null);
      await fetchMatch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading match…" />;

  if (notFound || !match) {
    return (
      <div className="max-w-xl mx-auto my-12 px-4">
        <EmptyState
          icon={<Trophy className="w-10 h-10" />}
          title="Match not found"
          message="This match may have been deleted."
          action={
            <Link href="/matches" className="px-4 py-2.5 rounded-xl bg-amber-600 text-xs font-bold text-white">
              Back to matches
            </Link>
          }
        />
      </div>
    );
  }

  const isFinished = match.status === 'COMPLETED' || match.status === 'ABANDONED';
  const allDeliveries = match.innings.flatMap((i: any) =>
    (i.deliveries || []).map((d: any) => ({ ...d, inningsNo: i.inningsNo }))
  );
  // The API returns each innings newest-first; interleave them into one feed.
  const commentary = allDeliveries.sort(
    (a: any, b: any) => b.inningsNo - a.inningsNo || b.seq - a.seq
  );

  const scoreFor = (teamId: string) => {
    const inn = match.innings.find((i: any) => i.battingTeamId === teamId);
    if (!inn) return null;
    return inn;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-pitch-card via-pitch-dark to-pitch-card border border-pitch-border rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge status={match.status} />
            {match.tournament ? (
              <Link
                href={`/tournaments/${match.tournament.slug}`}
                className="text-xs text-cricket-400 font-semibold hover:underline truncate"
              >
                {match.tournament.name}
              </Link>
            ) : (
              <span className="text-xs text-gray-500 font-semibold">Single match</span>
            )}
            {match.stage && !['LEAGUE', 'FRIENDLY'].includes(match.stage) && (
              <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-[10px] font-bold text-amber-300">
                {match.stage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="px-3 py-1.5 rounded-lg bg-pitch-dark border border-pitch-border text-xs text-gray-300 hover:text-white flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-cricket-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Share'}
            </button>
            {!isFinished && (
              <Link
                href={`/score/${matchId}`}
                className="px-3 py-1.5 rounded-lg bg-cricket-600 hover:bg-cricket-500 text-white text-xs font-bold flex items-center gap-1 shadow-md"
              >
                <PlayCircle className="w-4 h-4" />
                {match.status === 'SCHEDULED' ? 'Start' : 'Score'}
              </Link>
            )}
          </div>
        </div>

        {/* Scores */}
        <div className="mt-5 space-y-2">
          {[match.homeTeamId, match.awayTeamId].map((teamId) => {
            const team = teamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
            const inn = scoreFor(teamId);
            const isWinner = match.winnerId === teamId;
            return (
              <div
                key={teamId}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                  isWinner ? 'bg-cricket-950/40 border-cricket-800' : 'bg-pitch-dark/60 border-pitch-border/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-pitch-dark border border-pitch-border flex items-center justify-center text-[10px] font-black text-cricket-400 shrink-0">
                    {team.shortName}
                  </span>
                  <span className="font-bold text-white truncate">{team.name}</span>
                  {isWinner && <Trophy className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl sm:text-2xl font-black text-cricket-400">
                    {inn ? `${inn.totalRuns}/${inn.totalWickets}` : '—'}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {inn ? `${oversDisplay(inn.legalBalls)} / ${match.overs} ov` : 'Yet to bat'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {match.resultSummary && (
          <div className="mt-4 p-3 rounded-xl bg-cricket-950/80 border border-cricket-800 text-center font-bold text-cricket-300 text-sm">
            {match.resultSummary}
          </div>
        )}

        {match.tossWinnerId && (
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            {(match.tossWinnerId === match.homeTeamId ? match.homeTeam : match.awayTeam).name} won the
            toss and elected to {match.tossDecision === 'BAT' ? 'bat' : 'bowl'}.
          </p>
        )}

        {match.potm ? (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="text-gray-300">Player of the match:</span>
            <Link href={`/players/${match.potmId}`} className="font-bold text-amber-300 hover:underline">
              {match.potm.fullName}
            </Link>
          </div>
        ) : (
          potmSuggestions?.candidates?.length > 0 && (
            <button
              onClick={() => setPotmOpen(true)}
              className="mt-3 w-full p-3 rounded-xl bg-amber-950/40 border border-amber-800/70 text-left hover:bg-amber-950/70 transition"
            >
              <div className="flex items-center gap-2 text-xs">
                <Award className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-gray-300">Suggested player of the match:</span>
                <span className="font-bold text-amber-300">
                  {potmSuggestions.candidates[0].name}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1 ml-6 leading-relaxed">
                {potmSuggestions.candidates[0].summary}
              </p>
              <p className="text-[11px] text-cricket-400 font-semibold mt-1.5 ml-6">
                Review and confirm →
              </p>
            </button>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-pitch-border overflow-x-auto">
        {(['SCORECARD', 'COMMENTARY', 'INFO'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition ${
              tab === t
                ? 'border-cricket-500 text-cricket-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'SCORECARD' ? 'Scorecard' : t === 'COMMENTARY' ? 'Commentary' : 'Info & admin'}
          </button>
        ))}
      </div>

      {/* Scorecard */}
      {tab === 'SCORECARD' && (
        <div className="space-y-5">
          {match.innings.length === 0 ? (
            <EmptyState
              title="The match has not started"
              message="Once the toss is done and the first ball is bowled, the scorecard appears here."
              action={
                <Link
                  href={`/score/${matchId}`}
                  className="px-4 py-2.5 rounded-xl bg-cricket-600 text-xs font-bold text-white"
                >
                  Open scoring console
                </Link>
              }
            />
          ) : (
            match.innings.map((inn: any) => (
              <InningsCard
                key={inn.id}
                innings={inn}
                match={match}
                teamByPlayerId={teamByPlayerId}
              />
            ))
          )}
        </div>
      )}

      {/* Commentary */}
      {tab === 'COMMENTARY' && (
        <div className="bg-pitch-card border border-pitch-border rounded-xl p-5 space-y-2.5">
          <h4 className="text-sm font-bold text-white mb-3">Ball-by-ball</h4>
          {commentary.length === 0 ? (
            <p className="text-xs text-gray-400 py-6 text-center">No balls recorded yet.</p>
          ) : (
            commentary.map((d: any) => (
              <div
                key={d.id}
                className="p-3 rounded-lg bg-pitch-dark border border-pitch-border/60 text-xs flex items-start gap-3"
              >
                <span
                  className={`px-2 py-1 rounded text-[10px] font-bold shrink-0 ${
                    d.isWicket
                      ? 'bg-red-600 text-white'
                      : d.runsBat === 6
                      ? 'bg-purple-600 text-white'
                      : d.runsBat === 4
                      ? 'bg-blue-600 text-white'
                      : d.extraType !== 'NONE'
                      ? 'bg-amber-700 text-white'
                      : 'bg-cricket-900 text-cricket-300'
                  }`}
                >
                  {d.overNo}.{d.ballNo}
                </span>
                <div className="flex-grow min-w-0">
                  <p className="text-gray-100 font-medium">{d.commentary}</p>
                  <span className="text-[10px] text-gray-500 mt-0.5 block">
                    Innings {d.inningsNo} • {new Date(d.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
          {commentary.length >= 30 && (
            <p className="text-[11px] text-gray-500 text-center pt-2">
              Showing the most recent balls of each innings.
            </p>
          )}
        </div>
      )}

      {/* Info & admin */}
      {tab === 'INFO' && (
        <div className="space-y-5">
          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Match details</h3>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[
                ['Venue', match.venue],
                ['Date', new Date(match.date).toLocaleString()],
                ['Format', `${match.overs} overs a side`],
                ['Ball', match.ballType.replace('_', ' ').toLowerCase()],
                ['Type', match.matchType === 'TOURNAMENT' ? 'Tournament' : 'Single match'],
                ['Stage', match.stage || '—'],
              ].map(([label, value]) => (
                <div key={label as string} className="p-3 bg-pitch-dark rounded-xl border border-pitch-border">
                  <dt className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</dt>
                  <dd className="text-gray-100 font-semibold mt-0.5 capitalize">{value as string}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Squads */}
          {match.squadPlayers.length > 0 && (
            <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white">Squads</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[match.homeTeam, match.awayTeam].map((team: any, i: number) => {
                  const teamId = i === 0 ? match.homeTeamId : match.awayTeamId;
                  const squad = match.squadPlayers.filter((p: any) => p.teamId === teamId);
                  return (
                    <div key={teamId}>
                      <h4 className="text-xs font-bold text-cricket-400 mb-2">
                        {team.name} ({squad.length})
                      </h4>
                      <ul className="space-y-1">
                        {squad.map((p: any) => (
                          <li key={p.id} className="text-xs text-gray-200 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-gray-600" />
                            {p.playerId ? (
                              <Link href={`/players/${p.playerId}`} className="hover:text-cricket-400">
                                {p.playerName}
                              </Link>
                            ) : (
                              p.playerName
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Admin */}
          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" /> Match admin
            </h3>

            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/export?type=scorecard&matchId=${matchId}`}
                className="px-3.5 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download scorecard
              </a>

              {match.resultType === 'TIE' || match.resultType === 'SUPER_OVER' ? (
                <button
                  onClick={() => setTieBreakOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-purple-950/60 border border-purple-800 text-xs font-bold text-purple-300 flex items-center gap-1.5"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  {match.winnerId ? 'Change tie-breaker result' : 'Record super over / bowl-out'}
                </button>
              ) : null}

              {match.status === 'COMPLETED' && (
                <button
                  onClick={() => setPotmOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-950/60 border border-amber-800 text-xs font-bold text-amber-300 flex items-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  {match.potmId ? 'Change player of the match' : 'Set player of the match'}
                </button>
              )}

              {!isFinished && match.innings.length > 0 && (
                <button
                  onClick={() =>
                    setConfirm({
                      title: 'Abandon this match?',
                      message:
                        'The match is recorded as a no result. In a tournament each side gets 1 point and the match is left out of Net Run Rate.',
                      label: 'Abandon match',
                      run: () => runAction({ action: 'abandon' }, 'Match abandoned'),
                    })
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-300 flex items-center gap-1.5"
                >
                  <CloudRain className="w-3.5 h-3.5" /> Abandon (no result)
                </button>
              )}

              {match.innings.length > 0 && (
                <button
                  onClick={() =>
                    setConfirm({
                      title: 'Reset this match?',
                      message:
                        'Every ball, scorecard and the toss will be erased and the match returns to Scheduled. This cannot be undone.',
                      label: 'Reset match',
                      run: () => runAction({ action: 'reset' }, 'Match reset to scheduled'),
                    })
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-300 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset scoring
                </button>
              )}

              <button
                onClick={() =>
                  setConfirm({
                    title: 'Delete this match?',
                    message: `${match.homeTeam.name} vs ${match.awayTeam.name} and its entire scorecard will be permanently removed.`,
                    label: 'Delete match',
                    run: async () => {
                      try {
                        setBusy(true);
                        await apiCall(`/api/matches/${matchId}`, { method: 'DELETE' });
                        toast.success('Match deleted');
                        router.push('/matches');
                      } catch (e: any) {
                        toast.error(e.message);
                        setBusy(false);
                      }
                    },
                  })
                }
                className="px-3.5 py-2.5 rounded-xl bg-red-950/60 border border-red-900 text-xs font-bold text-red-300 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete match
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label || 'Confirm'}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />

      {tieBreakOpen && (
        <TieBreakDialog
          match={match}
          onClose={() => setTieBreakOpen(false)}
          onSaved={async () => {
            setTieBreakOpen(false);
            await fetchMatch();
            toast.success('Tie-breaker recorded');
          }}
        />
      )}

      {potmOpen && (
        <PotmDialog
          match={match}
          suggestions={potmSuggestions}
          onClose={() => setPotmOpen(false)}
          onSaved={async () => {
            setPotmOpen(false);
            await fetchMatch();
            toast.success('Player of the match saved');
          }}
        />
      )}
    </div>
  );
}

/** One innings: batting card with dismissals, extras, then the bowling card. */
function InningsCard({
  innings,
  match,
  teamByPlayerId,
}: {
  innings: any;
  match: any;
  teamByPlayerId: Record<string, string>;
}) {
  const battingTeam =
    innings.battingTeamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
  const bowlingTeam =
    innings.bowlingTeamId === match.homeTeamId ? match.homeTeam : match.awayTeam;

  const batters = match.battingScores
    .filter((b: any) => teamByPlayerId[b.playerId] === innings.battingTeamId)
    .sort((a: any, b: any) => a.battingPos - b.battingPos);

  const bowlers = match.bowlingFigures.filter(
    (b: any) => teamByPlayerId[b.playerId] === innings.bowlingTeamId
  );

  // Extras are whatever the team scored beyond the batters' own runs.
  const batRuns = batters.reduce((sum: number, b: any) => sum + b.runs, 0);
  const extras = Math.max(0, innings.totalRuns - batRuns);

  return (
    <div className="bg-pitch-card border border-pitch-border rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 bg-pitch-dark/60 border-b border-pitch-border flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">
          {battingTeam.name}
          <span className="text-gray-500 font-normal text-xs ml-2">Innings {innings.inningsNo}</span>
        </h3>
        <div className="text-right">
          <span className="text-lg font-black text-cricket-400">
            {innings.totalRuns}/{innings.totalWickets}
          </span>
          <span className="text-xs text-gray-400 ml-2">({oversDisplay(innings.legalBalls)} ov)</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {batters.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">Yet to bat.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left text-[11px] sm:text-xs min-w-[460px]">
              <thead>
                <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                  <th className="pb-2">Batter</th>
                  <th className="pb-2 text-right">R</th>
                  <th className="pb-2 text-right">B</th>
                  <th className="pb-2 text-right">4s</th>
                  <th className="pb-2 text-right">6s</th>
                  <th className="pb-2 text-right">SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border/40">
                {batters.map((b: any) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-2">
                      <Link href={`/players/${b.playerId}`} className="font-semibold text-gray-100 hover:text-cricket-400">
                        {b.player.fullName}
                      </Link>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {b.isOut ? b.wicketInfo || 'out' : b.isRetired ? 'retired hurt' : 'not out'}
                      </div>
                    </td>
                    <td className="py-2 text-right font-bold text-cricket-400">
                      {b.runs}
                      {!b.isOut && <span className="text-gray-500">*</span>}
                    </td>
                    <td className="py-2 text-right text-gray-300">{b.balls}</td>
                    <td className="py-2 text-right text-blue-300">{b.fours}</td>
                    <td className="py-2 text-right text-purple-300">{b.sixes}</td>
                    <td className="py-2 text-right text-gray-400">
                      {b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-pitch-border text-gray-300">
                  <td className="pt-2 font-semibold">Extras</td>
                  <td className="pt-2 text-right font-bold">{extras}</td>
                  <td colSpan={4} />
                </tr>
                <tr className="text-white">
                  <td className="pt-1 font-bold">Total</td>
                  <td className="pt-1 text-right font-black text-cricket-400">
                    {innings.totalRuns}/{innings.totalWickets}
                  </td>
                  <td colSpan={4} className="pt-1 text-right text-[10px] text-gray-400">
                    {oversDisplay(innings.legalBalls)} overs
                    {innings.endReason ? ` • ${innings.endReason.replace('_', ' ').toLowerCase()}` : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {bowlers.length > 0 && (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase mb-2">
              {bowlingTeam.name} bowling
            </h4>
            <table className="w-full text-left text-[11px] sm:text-xs min-w-[420px]">
              <thead>
                <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                  <th className="pb-2">Bowler</th>
                  <th className="pb-2 text-right">O</th>
                  <th className="pb-2 text-right">R</th>
                  <th className="pb-2 text-right">W</th>
                  <th className="pb-2 text-right">Econ</th>
                  <th className="pb-2 text-right">WD</th>
                  <th className="pb-2 text-right">NB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border/40">
                {bowlers.map((bw: any) => (
                  <tr key={bw.id}>
                    <td className="py-2">
                      <Link href={`/players/${bw.playerId}`} className="font-semibold text-gray-100 hover:text-cricket-400">
                        {bw.player.fullName}
                      </Link>
                    </td>
                    <td className="py-2 text-right text-gray-300">{oversDisplay(bw.legalBalls)}</td>
                    <td className="py-2 text-right text-gray-300">{bw.runs}</td>
                    <td className="py-2 text-right font-black text-red-400">{bw.wickets}</td>
                    <td className="py-2 text-right text-gray-400">
                      {bw.legalBalls > 0 ? (bw.runs / (bw.legalBalls / 6)).toFixed(2) : '—'}
                    </td>
                    <td className="py-2 text-right text-amber-400">{bw.wides}</td>
                    <td className="py-2 text-right text-amber-400">{bw.noBalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PotmDialog({ match, suggestions, onClose, onSaved }: any) {
  const toast = useToast();
  const ranked: any[] = suggestions?.candidates || [];
  const par = suggestions?.par;

  // Start on the computed pick, or whatever was already awarded.
  const [playerId, setPlayerId] = useState(match.potmId || ranked[0]?.playerId || '');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const squad = match.squadPlayers.filter((p: any) => p.playerId);
  const shortNameFor = (teamId: string) =>
    teamId === match.homeTeamId ? match.homeTeam.shortName : match.awayTeam.shortName;

  // Anyone in a squad who did not bat, bowl or field is still selectable.
  const rankedIds = new Set(ranked.map((c) => c.playerId));
  const others = squad.filter((p: any) => !rankedIds.has(p.playerId));

  const visible = showAll ? ranked : ranked.slice(0, 5);

  async function save() {
    try {
      setSaving(true);
      await apiCall(`/api/matches/${match.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'setPotm', playerId: playerId || null }),
      });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-pitch-card border border-pitch-border rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6"
      >
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" /> Player of the match
          </h3>
          {par && (
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              Ranked on impact measured against this match&apos;s own par of{' '}
              <span className="text-amber-300 font-semibold">{par.economy.toFixed(1)} an over</span>{' '}
              (strike rate {par.strikeRate.toFixed(0)}), so a wicket here is worth about{' '}
              <span className="text-amber-300 font-semibold">{par.wicketValue.toFixed(0)} runs</span>.
              Pick any player to override.
            </p>
          )}
        </div>

        {ranked.length === 0 ? (
          <p className="text-xs text-gray-400">
            No performances recorded, so there is nothing to rank. Choose a player below.
          </p>
        ) : (
          <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-0.5">
            {visible.map((c: any, i: number) => {
              const selected = playerId === c.playerId;
              return (
                <button
                  key={c.playerId}
                  onClick={() => setPlayerId(c.playerId)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selected
                      ? 'bg-amber-950/50 border-amber-600'
                      : 'bg-pitch-dark border-pitch-border hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">{c.name}</span>
                        <span className="text-[10px] text-gray-400">{c.teamName}</span>
                        {i === 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-900 border border-amber-700 text-[9px] font-bold text-amber-300">
                            TOP PICK
                          </span>
                        )}
                        {c.onWinningTeam && (
                          <span className="text-[9px] font-bold text-cricket-400">WON</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">{c.summary}</p>
                    </div>
                    <span
                      className={`text-sm font-black shrink-0 ${
                        selected ? 'text-amber-300' : 'text-gray-400'
                      }`}
                    >
                      {c.score.toFixed(0)}
                    </span>
                  </div>
                </button>
              );
            })}

            {ranked.length > 5 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="w-full py-2 text-[11px] font-semibold text-cricket-400 hover:underline"
              >
                {showAll ? 'Show fewer' : `Show all ${ranked.length} players`}
              </button>
            )}
          </div>
        )}

        {others.length > 0 && (
          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-400 mb-1.5">
              Or pick someone who did not bat or bowl
            </span>
            <select
              value={rankedIds.has(playerId) ? '' : playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {others.map((p: any) => (
                <option key={p.id} value={p.playerId}>
                  {p.playerName} ({shortNameFor(p.teamId)})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300"
          >
            Cancel
          </button>
          {match.potmId && (
            <button
              onClick={() => setPlayerId('')}
              className="px-3 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-400"
            >
              Clear
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save award'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Records who advanced after a tied match was settled on the ground. */
function TieBreakDialog({ match, onClose, onSaved }: any) {
  const toast = useToast();
  const [winnerId, setWinnerId] = useState(match.winnerId || '');
  const [method, setMethod] = useState('SUPER_OVER');
  const [saving, setSaving] = useState(false);

  async function save() {
    try {
      setSaving(true);
      await apiCall(`/api/matches/${match.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'setTieBreakWinner', winnerId: winnerId || null, method }),
      });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-pitch-card border border-pitch-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-purple-400" /> Tie-breaker
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            The scores finished level. Record who won the super over or bowl-out so the bracket and
            standings know who went through.
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-gray-300 mb-1.5">Winner</span>
          <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)} className={inputClass}>
            <option value="">Leave as a tie</option>
            <option value={match.homeTeamId}>{match.homeTeam.name}</option>
            <option value={match.awayTeamId}>{match.awayTeam.name}</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-gray-300 mb-1.5">Decided by</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            <option value="SUPER_OVER">Super over</option>
            <option value="BOWL_OUT">Bowl-out</option>
          </select>
        </label>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save result'}
          </button>
        </div>
      </div>
    </div>
  );
}
