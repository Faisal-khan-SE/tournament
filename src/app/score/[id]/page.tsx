'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Trophy,
  Star,
  UserCheck,
  ChevronDown,
  Users,
  Flag,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { CentralMatchEngine } from '@/lib/matchEngine';
import {
  oversDisplay,
  maxWicketsForSquad,
  nextBallIsFreeHit,
  isDismissalAllowedOnFreeHit,
} from '@/lib/matchRules';
import {
  ConfirmDialog,
  Spinner,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';

interface SquadEntry {
  id: string;
  playerId: string | null;
  playerName: string;
  teamId: string;
}

const WICKET_TYPES = [
  { value: 'BOWLED', label: 'Bowled' },
  { value: 'CAUGHT', label: 'Caught' },
  { value: 'RUN_OUT', label: 'Run out' },
  { value: 'LBW', label: 'LBW' },
  { value: 'STUMPED', label: 'Stumped' },
  { value: 'HIT_WICKET', label: 'Hit wicket' },
  { value: 'RETIRED_OUT', label: 'Retired out' },
  { value: 'RETIRED_HURT', label: 'Retired hurt (not a wicket)' },
  { value: 'OTHER', label: 'Other' },
];

export default function ScoringConsole() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const matchId = params.id as string;

  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [strikerId, setStrikerId] = useState('');
  const [nonStrikerId, setNonStrikerId] = useState('');
  const [bowlerId, setBowlerId] = useState('');

  const [showSquadSetup, setShowSquadSetup] = useState(false);
  const [showToss, setShowToss] = useState(false);
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [tossDecision, setTossDecision] = useState<'BAT' | 'BOWL'>('BAT');

  const [showCreaseSetup, setShowCreaseSetup] = useState(false);
  const [setupError, setSetupError] = useState('');

  const [showWicket, setShowWicket] = useState(false);
  const [wicketType, setWicketType] = useState('BOWLED');
  const [dismissedId, setDismissedId] = useState('');
  const [fielderId, setFielderId] = useState('');
  const [newBatsmanId, setNewBatsmanId] = useState('');

  const [showExtras, setShowExtras] = useState<null | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE'>(null);
  const [showBowlerChange, setShowBowlerChange] = useState(false);
  const [overSummary, setOverSummary] = useState('');
  const [show1stInnings, setShow1stInnings] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);

  /* ------------------------------------------------------------------ */
  /* Loading                                                             */
  /* ------------------------------------------------------------------ */

  const fetchMatch = useCallback(async () => {
    try {
      const data = await apiCall(`/api/matches/${matchId}`);
      setMatch(data.match);
      return data.match;
    } catch (e: any) {
      setLoadError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  /* ------------------------------------------------------------------ */
  /* Derived state                                                       */
  /* ------------------------------------------------------------------ */

  const activeInnings = useMemo(() => {
    if (!match?.innings?.length) return null;
    return match.innings.find((i: any) => !i.isCompleted) || match.innings[match.innings.length - 1];
  }, [match]);

  const battingTeam = match
    ? activeInnings?.battingTeamId === match.homeTeamId
      ? match.homeTeam
      : match.awayTeam
    : null;
  const bowlingTeam = match
    ? activeInnings?.bowlingTeamId === match.homeTeamId
      ? match.homeTeam
      : match.awayTeam
    : null;

  const battingSquad: SquadEntry[] = useMemo(
    () => (match?.squadPlayers || []).filter((p: any) => p.teamId === activeInnings?.battingTeamId),
    [match, activeInnings]
  );
  const bowlingSquad: SquadEntry[] = useMemo(
    () => (match?.squadPlayers || []).filter((p: any) => p.teamId === activeInnings?.bowlingTeamId),
    [match, activeInnings]
  );

  const squadsMissing = useMemo(() => {
    if (!match) return false;
    const home = match.squadPlayers.filter((p: any) => p.teamId === match.homeTeamId).length;
    const away = match.squadPlayers.filter((p: any) => p.teamId === match.awayTeamId).length;
    return home === 0 || away === 0;
  }, [match]);

  /** Player ids that can no longer bat in this innings. */
  const dismissedIds = useMemo(() => {
    if (!match || !activeInnings) return new Set<string>();
    const inningsPlayerIds = new Set(battingSquad.map((p) => p.playerId).filter(Boolean));
    return new Set(
      match.battingScores
        .filter((b: any) => b.isOut && inningsPlayerIds.has(b.playerId))
        .map((b: any) => b.playerId)
    );
  }, [match, activeInnings, battingSquad]);

  const availableBatters = battingSquad.filter(
    (p) => p.playerId && !dismissedIds.has(p.playerId)
  );

  // The ball about to be bowled is a free hit if the previous one was a no-ball
  // (or an illegal ball that carried an unused free hit forward).
  const isFreeHit = useMemo(
    () => nextBallIsFreeHit(activeInnings?.deliveries?.[0]),
    [activeInnings]
  );

  /**
   * Works out who should be at the crease from the ball log, so reloading the
   * page mid-over does not lose the striker.
   */
  const deriveCrease = useCallback(
    (m: any, innings: any) => {
      if (!innings?.deliveries?.length) return null;
      // The API returns deliveries newest-first.
      const last = innings.deliveries[0];
      // A batter left the crease on the last ball, so who replaced them is not
      // recoverable from the log — the scorer has to say.
      if (last.isWicket && last.dismissedId) return null;
      const evalRes = CentralMatchEngine.evaluateDelivery({
        strikerId: last.strikerId,
        nonStrikerId: last.nonStrikerId,
        bowlerId: last.bowlerId,
        runsBat: last.runsBat,
        extraType: last.extraType,
        runsExtra: last.runsExtra,
        isWicket: last.isWicket,
        wicketType: last.wicketType,
      });

      let striker = last.strikerId;
      let nonStriker = last.nonStrikerId;
      if (evalRes.ballRunRotation && striker !== nonStriker) {
        [striker, nonStriker] = [nonStriker, striker];
      }
      // End of over: the batters change ends.
      if (evalRes.isLegal && innings.legalBalls % 6 === 0 && striker !== nonStriker) {
        [striker, nonStriker] = [nonStriker, striker];
      }
      return { striker, nonStriker, bowler: last.bowlerId };
    },
    []
  );

  // Decide which modal, if any, the console should open next.
  useEffect(() => {
    if (!match) return;

    if (match.status === 'COMPLETED' || match.status === 'ABANDONED') {
      setShowToss(false);
      setShowCreaseSetup(false);
      setShowSquadSetup(false);
      return;
    }

    if (squadsMissing) {
      setShowSquadSetup(true);
      setShowToss(false);
      return;
    }
    setShowSquadSetup(false);

    if (match.innings.length === 0) {
      setShowToss(true);
      setTossWinnerId((prev) => prev || match.homeTeamId);
      return;
    }
    setShowToss(false);

    if (!activeInnings || activeInnings.isCompleted) return;

    const validBatter = (id: string) =>
      !!id && battingSquad.some((p) => p.playerId === id) && !dismissedIds.has(id);
    const validBowler = (id: string) => !!id && bowlingSquad.some((p) => p.playerId === id);

    if (validBatter(strikerId) && validBowler(bowlerId)) return;

    // Try to recover the crease from the ball log before asking the scorer.
    const derived = deriveCrease(match, activeInnings);
    if (
      derived &&
      validBatter(derived.striker) &&
      validBowler(derived.bowler) &&
      (derived.striker === derived.nonStriker || validBatter(derived.nonStriker))
    ) {
      setStrikerId(derived.striker);
      setNonStrikerId(derived.nonStriker);
      setBowlerId(derived.bowler);
      return;
    }

    setShowCreaseSetup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, squadsMissing, activeInnings, battingSquad, bowlingSquad, dismissedIds]);

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  async function submitToss() {
    try {
      setSubmitting(true);
      await apiCall(`/api/matches/${matchId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'toss', tossWinnerId, tossDecision }),
      });
      setStrikerId('');
      setNonStrikerId('');
      setBowlerId('');
      await fetchMatch();
      toast.success('Toss recorded — pick the openers');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmCrease() {
    setSetupError('');
    if (!strikerId) return setSetupError('Choose the striker.');
    if (!bowlerId) return setSetupError('Choose the bowler.');

    const lastManStanding = availableBatters.length <= 1;
    if (!lastManStanding) {
      if (!nonStrikerId) return setSetupError('Choose the non-striker.');
      if (nonStrikerId === strikerId) {
        return setSetupError('The striker and non-striker must be different players.');
      }
    }
    if (bowlerId === strikerId || (nonStrikerId && bowlerId === nonStrikerId)) {
      return setSetupError('The bowler cannot also be batting.');
    }
    // The same bowler cannot bowl two overs in a row.
    if (
      activeInnings?.lastBowlerId &&
      bowlerId === activeInnings.lastBowlerId &&
      activeInnings.legalBalls % 6 === 0 &&
      activeInnings.legalBalls > 0
    ) {
      return setSetupError('This bowler bowled the previous over — pick someone else.');
    }

    if (lastManStanding) setNonStrikerId(strikerId);
    setShowCreaseSetup(false);
  }

  async function recordBall(payload: {
    runsBat: number;
    extraType: 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
    runsExtra?: number;
    isWicket?: boolean;
    wicketType?: string;
    dismissedId?: string;
    fielderId?: string;
    newBatsmanId?: string;
  }) {
    if (!activeInnings || submitting) return;
    if (!strikerId || !bowlerId) {
      setShowCreaseSetup(true);
      return;
    }

    const { newBatsmanId: replacement, ...ballPayload } = payload;

    try {
      setSubmitting(true);
      const data = await apiCall(`/api/matches/${matchId}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'delivery',
          inningsId: activeInnings.id,
          strikerId,
          nonStrikerId: nonStrikerId || strikerId,
          bowlerId,
          ...ballPayload,
        }),
      });

      const evalRes = CentralMatchEngine.evaluateDelivery({
        strikerId,
        nonStrikerId: nonStrikerId || strikerId,
        bowlerId,
        ...ballPayload,
      } as any);

      let nextStriker = strikerId;
      let nextNonStriker = nonStrikerId || strikerId;

      if (payload.isWicket && payload.dismissedId) {
        // A retired-hurt batter leaves the crease too — they simply stay
        // eligible to come back later, which the server tracks separately.
        if (replacement) {
          // The incoming batter takes the dismissed player's end.
          if (payload.dismissedId === strikerId) nextStriker = replacement;
          else nextNonStriker = replacement;
        } else {
          // Last man standing: whoever survives keeps batting alone.
          const survivor = payload.dismissedId === strikerId ? nonStrikerId : strikerId;
          nextStriker = survivor || strikerId;
          nextNonStriker = survivor || strikerId;
        }
      } else if (evalRes.ballRunRotation && nextStriker !== nextNonStriker) {
        [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
      }

      if (data.updatedInnings.isOverEnd && nextStriker !== nextNonStriker) {
        [nextStriker, nextNonStriker] = [nextNonStriker, nextStriker];
      }

      setStrikerId(nextStriker);
      setNonStrikerId(nextNonStriker);

      const refreshed = await fetchMatch();

      if (data.updatedInnings.isCompleted) {
        const reason = data.updatedInnings.endReason;
        if (refreshed?.status === 'COMPLETED') {
          toast.success(refreshed.resultSummary || 'Match complete');
        } else {
          toast.info(
            reason === 'ALL_OUT'
              ? 'All out — innings over'
              : reason === 'TARGET'
              ? 'Target reached'
              : 'Innings over'
          );
        }
      } else if (data.updatedInnings.isOverEnd) {
        setOverSummary(`Over ${Math.floor(data.updatedInnings.legalBalls / 6)} complete`);
        setBowlerId('');
        setShowBowlerChange(true);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function undoLastBall() {
    try {
      setSubmitting(true);
      await apiCall(`/api/matches/${matchId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'undo' }),
      });
      // Let the crease be re-derived from the shortened ball log.
      setStrikerId('');
      setNonStrikerId('');
      setBowlerId('');
      await fetchMatch();
      toast.success('Last ball removed');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
      setConfirm(null);
    }
  }

  async function runAction(body: any, message: string) {
    try {
      setSubmitting(true);
      await apiCall(`/api/matches/${matchId}`, { method: 'POST', body: JSON.stringify(body) });
      setStrikerId('');
      setNonStrikerId('');
      setBowlerId('');
      await fetchMatch();
      toast.success(message);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
      setConfirm(null);
    }
  }

  function submitWicket() {
    if (!dismissedId) return toast.error('Choose which batter is out');
    // Someone has to take the departing batter's place whenever the bench
    // still has a player on it, retirements included.
    const needsReplacement = availableBatters.length > 2;
    if (needsReplacement && !newBatsmanId) {
      return toast.error('Choose the next batter');
    }

    const payload = {
      runsBat: 0,
      extraType: 'NONE' as const,
      isWicket: true,
      wicketType,
      dismissedId,
      fielderId: fielderId || undefined,
      newBatsmanId: newBatsmanId || undefined,
    };
    setShowWicket(false);
    setNewBatsmanId('');
    setFielderId('');
    recordBall(payload);
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  if (loading) return <Spinner label="Loading scoring console…" />;

  if (loadError || !match) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-red-950/40 border border-red-800 rounded-2xl text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-red-300">Could not open this match</h2>
        <p className="text-sm text-gray-300 mt-2">{loadError || 'Match not found'}</p>
        <Link
          href="/matches"
          className="inline-block mt-4 px-4 py-2 bg-cricket-600 rounded-lg text-sm text-white font-medium"
        >
          Back to matches
        </Link>
      </div>
    );
  }

  /* ---- Finished match ---- */
  if (match.status === 'COMPLETED' || match.status === 'ABANDONED') {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Trophy className="w-14 h-14 text-amber-400" />
        <h1 className="text-xl font-black text-white">
          {match.status === 'ABANDONED' ? 'Match abandoned' : 'Match complete'}
        </h1>
        <p className="text-sm text-cricket-300 font-semibold">{match.resultSummary}</p>

        <div className="w-full space-y-2 pt-2">
          {match.innings.map((inn: any) => {
            const team = inn.battingTeamId === match.homeTeamId ? match.homeTeam : match.awayTeam;
            return (
              <div
                key={inn.id}
                className="flex items-center justify-between p-3 rounded-xl bg-pitch-card border border-pitch-border text-sm"
              >
                <span className="font-semibold text-gray-200 truncate">{team.name}</span>
                <span className="font-mono font-bold text-cricket-400 shrink-0">
                  {inn.totalRuns}/{inn.totalWickets} ({oversDisplay(inn.legalBalls)})
                </span>
              </div>
            );
          })}
        </div>

        <div className="w-full flex flex-col gap-2 pt-2">
          <Link
            href={`/match/${matchId}`}
            className="w-full py-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-sm font-bold text-white"
          >
            View scorecard & award player of the match
          </Link>
          <Link
            href="/matches"
            className="w-full py-3 rounded-xl bg-pitch-card border border-pitch-border text-sm font-bold text-gray-200"
          >
            All matches
          </Link>
          <button
            onClick={() =>
              setConfirm({
                title: 'Delete this match?',
                message: `${match.homeTeam.name} v ${match.awayTeam.name} and its whole scorecard will be permanently removed.`,
                label: 'Delete match',
                run: async () => {
                  try {
                    setSubmitting(true);
                    await apiCall(`/api/matches/${matchId}`, { method: 'DELETE' });
                    toast.success('Match deleted');
                    router.push('/matches');
                  } catch (e: any) {
                    toast.error(e.message);
                    setSubmitting(false);
                    setConfirm(null);
                  }
                },
              })
            }
            className="w-full py-3 rounded-xl bg-red-950/50 border border-red-900 text-sm font-bold text-red-300 flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete this match
          </button>
        </div>

        <ConfirmDialog
          open={!!confirm}
          busy={submitting}
          title={confirm?.title || ''}
          message={confirm?.message || ''}
          confirmLabel={confirm?.label || 'Confirm'}
          onConfirm={() => confirm?.run()}
          onCancel={() => setConfirm(null)}
        />
      </div>
    );
  }

  const inn1 = match.innings.find((i: any) => i.inningsNo === 1);
  const strikerName =
    battingSquad.find((p) => p.playerId === strikerId)?.playerName || 'Select striker';
  const nonStrikerName =
    battingSquad.find((p) => p.playerId === nonStrikerId)?.playerName ||
    (availableBatters.length <= 1 ? 'Batting alone' : 'Select non-striker');
  const bowlerName =
    bowlingSquad.find((p) => p.playerId === bowlerId)?.playerName || 'Select bowler';

  const emptyCard = { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const strikerScore = match.battingScores.find((b: any) => b.playerId === strikerId) || emptyCard;
  const nonStrikerScore =
    match.battingScores.find((b: any) => b.playerId === nonStrikerId) || emptyCard;
  const bowlerFig =
    match.bowlingFigures.find((b: any) => b.playerId === bowlerId) || {
      legalBalls: 0,
      runs: 0,
      wickets: 0,
    };

  const crr = CentralMatchEngine.calculateCurrentRunRate(
    activeInnings?.totalRuns || 0,
    activeInnings?.legalBalls || 0
  );

  const target = activeInnings?.inningsNo === 2 && inn1 ? inn1.totalRuns + 1 : null;
  const targetInfo =
    target !== null
      ? CentralMatchEngine.calculateTargetInfo(
          target,
          activeInnings.totalRuns,
          match.overs,
          activeInnings.legalBalls
        )
      : null;

  const wicketsLeft = Math.max(
    0,
    maxWicketsForSquad(battingSquad.length) - (activeInnings?.totalWickets || 0)
  );
  const recent = (activeInnings?.deliveries || []).slice(0, 10);
  const atInningsBreak = match.status === 'INNINGS_BREAK';
  const inputsReady = !!strikerId && !!bowlerId;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-pitch-dark flex flex-col pb-6">
      {/* Header */}
      <div className="bg-pitch-card px-3 py-3 border-b border-pitch-border flex items-center justify-between gap-2 sticky top-0 z-30">
        <button
          onClick={() => router.push(`/match/${matchId}`)}
          aria-label="Back to match"
          className="p-1.5 rounded-lg text-gray-400 hover:text-white shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center min-w-0">
          <div className="text-[10px] font-semibold text-cricket-400 uppercase tracking-wide">
            {match.overs} overs • {match.matchType === 'TOURNAMENT' ? match.stage : 'Single match'}
          </div>
          <div className="text-xs font-bold text-gray-100 truncate">
            {match.homeTeam.shortName} v {match.awayTeam.shortName}
          </div>
        </div>
        <button
          onClick={() =>
            setConfirm({
              title: 'Undo the last ball?',
              message: 'The most recent delivery is removed and every total is recalculated.',
              label: 'Undo ball',
              run: undoLastBall,
            })
          }
          disabled={submitting}
          className="flex items-center gap-1 text-[11px] px-2.5 py-2 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-300 border border-amber-700/50 disabled:opacity-50 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Undo
        </button>
      </div>

      {/* Innings break banner */}
      {atInningsBreak && (
        <div className="m-3 p-4 rounded-xl bg-amber-950/60 border border-amber-700 text-center space-y-2">
          <h2 className="text-sm font-black text-amber-300 uppercase tracking-wide">Innings break</h2>
          <p className="text-xs text-gray-200">
            {battingTeam?.name} need <span className="font-bold text-white">{target}</span> to win from{' '}
            {match.overs} overs.
          </p>
          <button
            onClick={() => setShowCreaseSetup(true)}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
          >
            Set openers & start the chase
          </button>
        </div>
      )}

      {/* First innings summary */}
      {inn1 && activeInnings?.inningsNo === 2 && (
        <div className="px-3 pt-3">
          <button
            onClick={() => setShow1stInnings((v) => !v)}
            className="w-full py-2.5 px-3 bg-pitch-card hover:bg-pitch-border/30 border border-pitch-border rounded-xl flex items-center justify-between text-[11px] font-bold text-amber-400"
          >
            <span className="truncate">
              1st innings:{' '}
              {inn1.battingTeamId === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name} —{' '}
              {inn1.totalRuns}/{inn1.totalWickets} ({oversDisplay(inn1.legalBalls)})
            </span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 transition-transform ${show1stInnings ? 'rotate-180' : ''}`}
            />
          </button>

          {show1stInnings && (
            <div className="mt-2 p-3 bg-pitch-card rounded-xl border border-pitch-border">
              <Link
                href={`/match/${matchId}`}
                className="text-[11px] text-cricket-400 font-semibold hover:underline"
              >
                Open the full first-innings scorecard →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Score banner */}
      <div className="p-3 space-y-3">
        <div className="p-4 rounded-2xl bg-gradient-to-b from-pitch-card to-pitch-dark border border-pitch-border space-y-3">
          <div className="flex items-end justify-between">
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-gray-400 uppercase">
                Innings {activeInnings?.inningsNo || 1}
              </span>
              <h2 className="text-base font-bold text-white leading-tight truncate">
                {battingTeam?.name}
              </h2>
            </div>
            <div className="text-right shrink-0">
              <div className="text-4xl font-extrabold text-cricket-400 tracking-tight leading-none">
                {activeInnings?.totalRuns || 0}
                <span className="text-2xl text-gray-400">/{activeInnings?.totalWickets || 0}</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                {oversDisplay(activeInnings?.legalBalls || 0)} / {match.overs} ov
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-pitch-dark/80 border border-pitch-border text-center">
              CRR <span className="font-bold text-cricket-400">{crr.toFixed(2)}</span>
            </div>
            <div className="p-2 rounded-lg bg-pitch-dark/80 border border-pitch-border text-center">
              Wickets left <span className="font-bold text-amber-400">{wicketsLeft}</span>
            </div>
          </div>

          {targetInfo && (
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800 text-center text-[11px]">
              Need <span className="font-black text-white">{targetInfo.runsNeeded}</span> from{' '}
              <span className="font-black text-white">{targetInfo.ballsRemaining}</span> balls
              <span className="text-gray-400"> • RRR {targetInfo.requiredRunRate.toFixed(2)}</span>
            </div>
          )}

          {availableBatters.length === 1 && battingSquad.length <= 5 && (
            <div className="p-2 bg-amber-950/80 border border-amber-700 text-amber-300 text-[11px] font-bold rounded-lg text-center">
              Last man standing — this batter carries on alone
            </div>
          )}
        </div>

        {/* Crease */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-cricket-950/60 border border-cricket-700">
            <div className="flex items-center gap-1 text-[10px] text-cricket-400 font-bold uppercase">
              <Star className="w-3 h-3 fill-cricket-400" /> Striker
            </div>
            <div className="font-bold text-white text-sm mt-0.5 truncate">{strikerName}</div>
            <div className="text-[11px] text-gray-300 mt-0.5">
              <span className="font-extrabold text-cricket-300">{strikerScore.runs}</span> (
              {strikerScore.balls}) • {strikerScore.fours}×4 {strikerScore.sixes}×6
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-pitch-card border border-pitch-border">
            <div className="text-[10px] text-gray-400 uppercase font-semibold">Non-striker</div>
            <div className="font-bold text-white text-sm mt-0.5 truncate">{nonStrikerName}</div>
            <div className="text-[11px] text-gray-300 mt-0.5">
              <span className="font-extrabold">{nonStrikerScore.runs}</span> ({nonStrikerScore.balls})
              • {nonStrikerScore.fours}×4 {nonStrikerScore.sixes}×6
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-900 text-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] text-purple-400 font-bold uppercase">Bowler</div>
            <div className="font-bold text-white text-sm mt-0.5 truncate">{bowlerName}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-purple-300 text-sm">
              {bowlerFig.wickets}/{bowlerFig.runs}
            </div>
            <div className="text-[10px] text-gray-400">
              {oversDisplay(bowlerFig.legalBalls || 0)} ov • econ{' '}
              {CentralMatchEngine.calculateEconomy(bowlerFig.runs || 0, bowlerFig.legalBalls || 0).toFixed(2)}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setSetupError('');
            setShowCreaseSetup(true);
          }}
          className="w-full py-2 rounded-xl bg-pitch-card border border-pitch-border text-[11px] font-bold text-amber-400 flex items-center justify-center gap-1.5"
        >
          <UserCheck className="w-3.5 h-3.5" /> Change batters or bowler
        </button>

        {/* This over */}
        {recent.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-[10px] text-gray-400 uppercase font-medium shrink-0">Recent</span>
            {recent.map((d: any) => (
              <span
                key={d.id}
                title={d.isFreeHit ? 'Free hit' : undefined}
                className={`px-2 py-1 rounded text-[11px] font-bold shrink-0 ${
                  d.isFreeHit ? 'ring-1 ring-amber-400 ' : ''
                }${
                  d.isWicket
                    ? 'bg-red-600 text-white'
                    : d.runsBat === 6
                    ? 'bg-purple-600 text-white'
                    : d.runsBat === 4
                    ? 'bg-blue-600 text-white'
                    : d.extraType !== 'NONE'
                    ? 'bg-amber-700 text-white'
                    : 'bg-pitch-border text-gray-200'
                }`}
              >
                {d.isWicket
                  ? 'W'
                  : d.extraType === 'WIDE'
                  ? `wd${d.runsExtra ? `+${d.runsExtra}` : ''}`
                  : d.extraType === 'NO_BALL'
                  ? `nb${d.runsBat ? `+${d.runsBat}` : ''}`
                  : d.extraType === 'BYE'
                  ? `b${d.runsExtra}`
                  : d.extraType === 'LEG_BYE'
                  ? `lb${d.runsExtra}`
                  : d.runsBat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scoring pad */}
      <div className="px-3 pb-3 space-y-2 flex-grow flex flex-col justify-end">
        {isFreeHit && (
          <div className="p-2.5 rounded-xl bg-amber-500/20 border-2 border-amber-500 text-center">
            <div className="text-sm font-black text-amber-300 tracking-wide">FREE HIT</div>
            <div className="text-[11px] text-amber-200/90 mt-0.5">
              Run out only — the batter cannot be bowled, caught, lbw, stumped or hit wicket.
            </div>
          </div>
        )}

        {!inputsReady && !atInningsBreak && (
          <p className="text-[11px] text-amber-400 text-center pb-1">
            Choose the batters and bowler before scoring.
          </p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((runs) => (
            <button
              key={runs}
              onClick={() => recordBall({ runsBat: runs, extraType: 'NONE' })}
              disabled={submitting || !inputsReady}
              className="py-5 bg-pitch-card hover:bg-cricket-900/60 border border-pitch-border rounded-2xl text-2xl font-black text-white shadow-md touch-btn active:bg-cricket-700 disabled:opacity-40"
            >
              {runs}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => recordBall({ runsBat: 4, extraType: 'NONE' })}
            disabled={submitting || !inputsReady}
            className="py-5 bg-blue-950/80 hover:bg-blue-900 border border-blue-700 rounded-2xl text-2xl font-black text-blue-300 touch-btn disabled:opacity-40"
          >
            4
          </button>
          <button
            onClick={() => recordBall({ runsBat: 6, extraType: 'NONE' })}
            disabled={submitting || !inputsReady}
            className="py-5 bg-purple-950/80 hover:bg-purple-900 border border-purple-700 rounded-2xl text-2xl font-black text-purple-300 touch-btn disabled:opacity-40"
          >
            6
          </button>
          <button
            onClick={() => {
              setDismissedId(strikerId);
              // Bowled is impossible on a free hit, so start on the one that is.
              setWicketType(isFreeHit ? 'RUN_OUT' : 'BOWLED');
              setFielderId('');
              setNewBatsmanId('');
              setShowWicket(true);
            }}
            disabled={submitting || !inputsReady}
            className="col-span-2 py-5 bg-red-950/80 hover:bg-red-900 border border-red-700 rounded-2xl text-lg font-black text-red-300 touch-btn disabled:opacity-40"
          >
            WICKET
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] font-bold">
          {(['WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setShowExtras(type)}
              disabled={submitting || !inputsReady}
              className="py-3.5 bg-amber-950/50 border border-amber-800/70 rounded-2xl text-amber-400 touch-btn disabled:opacity-40"
            >
              {type === 'WIDE' ? 'WIDE' : type === 'NO_BALL' ? 'NO BALL' : type === 'BYE' ? 'BYE' : 'LEG BYE'}
            </button>
          ))}
        </div>

        <button
          onClick={() =>
            setConfirm({
              title: 'End this innings now?',
              message:
                'The innings closes at its current score even though overs remain. Use this for a declaration or an agreed early finish.',
              label: 'End innings',
              run: () =>
                runAction(
                  { action: 'endInnings', inningsId: activeInnings.id },
                  'Innings closed'
                ),
            })
          }
          disabled={submitting || !activeInnings || activeInnings.legalBalls === 0}
          className="w-full py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-[11px] font-bold text-gray-400 flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Flag className="w-3.5 h-3.5" /> End innings early
        </button>
      </div>

      {/* ---------------- Modals ---------------- */}

      {showSquadSetup && (
        <SquadSetupModal
          match={match}
          onDone={async () => {
            setShowSquadSetup(false);
            await fetchMatch();
            toast.success('Squads saved');
          }}
        />
      )}

      {showToss && !showSquadSetup && (
        <Modal title="Toss" icon={<Trophy className="w-9 h-9 text-cricket-400" />}>
          <p className="text-xs text-gray-400 text-center">
            Who won the toss, and what did they choose?
          </p>

          <div className="space-y-3 text-left">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-300 mb-1.5">Toss winner</span>
              <select
                value={tossWinnerId}
                onChange={(e) => setTossWinnerId(e.target.value)}
                className={inputClass}
              >
                <option value={match.homeTeamId}>{match.homeTeam.name}</option>
                <option value={match.awayTeamId}>{match.awayTeam.name}</option>
              </select>
            </label>

            <div>
              <span className="block text-xs font-semibold text-gray-300 mb-1.5">Elected to</span>
              <div className="grid grid-cols-2 gap-2">
                {(['BAT', 'BOWL'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setTossDecision(d)}
                    className={`py-3 rounded-xl text-xs font-bold border ${
                      tossDecision === d
                        ? 'bg-cricket-600 border-cricket-400 text-white'
                        : 'bg-pitch-dark border-pitch-border text-gray-400'
                    }`}
                  >
                    {d === 'BAT' ? 'Bat first' : 'Bowl first'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={submitToss}
            disabled={submitting}
            className="w-full py-3 bg-cricket-600 hover:bg-cricket-500 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'Starting…' : 'Start the match'}
          </button>
        </Modal>
      )}

      {showCreaseSetup && activeInnings && (
        <Modal
          title={
            activeInnings.inningsNo === 2 && activeInnings.legalBalls === 0
              ? 'Start the chase'
              : 'Who is on the field?'
          }
          icon={<UserCheck className="w-9 h-9 text-amber-400" />}
          onClose={strikerId && bowlerId ? () => setShowCreaseSetup(false) : undefined}
        >
          <p className="text-xs text-gray-400 text-center">
            Batting: {battingTeam?.name} • Bowling: {bowlingTeam?.name}
          </p>

          {setupError && (
            <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl">
              {setupError}
            </div>
          )}

          <div className="space-y-3 text-left">
            <label className="block">
              <span className="block text-xs font-bold text-cricket-400 mb-1.5">Striker</span>
              <select
                value={strikerId}
                onChange={(e) => setStrikerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose a batter…</option>
                {availableBatters.map((p) => (
                  <option key={p.id} value={p.playerId!}>
                    {p.playerName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-gray-300 mb-1.5">
                Non-striker{availableBatters.length <= 1 ? ' (batting alone)' : ''}
              </span>
              <select
                value={nonStrikerId}
                onChange={(e) => setNonStrikerId(e.target.value)}
                disabled={availableBatters.length <= 1}
                className={`${inputClass} disabled:opacity-50`}
              >
                <option value="">Choose a batter…</option>
                {availableBatters
                  .filter((p) => p.playerId !== strikerId)
                  .map((p) => (
                    <option key={p.id} value={p.playerId!}>
                      {p.playerName}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-bold text-purple-400 mb-1.5">Bowler</span>
              <select
                value={bowlerId}
                onChange={(e) => setBowlerId(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose a bowler…</option>
                {bowlingSquad.map((p) => {
                  const blocked =
                    p.playerId === activeInnings.lastBowlerId &&
                    activeInnings.legalBalls > 0 &&
                    activeInnings.legalBalls % 6 === 0;
                  return (
                    <option key={p.id} value={p.playerId!} disabled={blocked}>
                      {p.playerName}
                      {blocked ? ' (bowled the last over)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <button
            onClick={confirmCrease}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-bold text-white"
          >
            Confirm and score
          </button>
        </Modal>
      )}

      {showBowlerChange && activeInnings && (
        <Modal title={overSummary} icon={<Trophy className="w-9 h-9 text-purple-400" />}>
          <p className="text-xs text-gray-400 text-center">
            Choose the bowler for the next over. The same bowler cannot bowl twice in a row.
          </p>

          <label className="block text-left">
            <span className="block text-xs font-bold text-purple-300 mb-1.5">Next bowler</span>
            <select
              value={bowlerId}
              onChange={(e) => setBowlerId(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a bowler…</option>
              {bowlingSquad
                .filter((p) => p.playerId !== activeInnings.lastBowlerId)
                .map((p) => (
                  <option key={p.id} value={p.playerId!}>
                    {p.playerName}
                  </option>
                ))}
            </select>
          </label>

          {bowlingSquad.filter((p) => p.playerId !== activeInnings.lastBowlerId).length === 0 && (
            <p className="text-[11px] text-amber-400">
              This squad has only one bowler registered. Add another player to the squad to continue.
            </p>
          )}

          <button
            onClick={() => setShowBowlerChange(false)}
            disabled={!bowlerId}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          >
            Start next over
          </button>
        </Modal>
      )}

      {showExtras && (
        <ExtrasModal
          type={showExtras}
          onClose={() => setShowExtras(null)}
          onSubmit={(payload) => {
            setShowExtras(null);
            recordBall(payload);
          }}
        />
      )}

      {showWicket && (
        <Modal title="Record a wicket" onClose={() => setShowWicket(false)}>
          <div className="space-y-3 text-left">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-300 mb-1.5">
                Which batter is out?
              </span>
              <select
                value={dismissedId}
                onChange={(e) => setDismissedId(e.target.value)}
                className={inputClass}
              >
                <option value={strikerId}>Striker — {strikerName}</option>
                {nonStrikerId && nonStrikerId !== strikerId && (
                  <option value={nonStrikerId}>Non-striker — {nonStrikerName}</option>
                )}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-300 mb-1.5">How out?</span>
              <select
                value={wicketType}
                onChange={(e) => setWicketType(e.target.value)}
                className={inputClass}
              >
                {WICKET_TYPES.filter(
                  (w) => !isFreeHit || isDismissalAllowedOnFreeHit(w.value)
                ).map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            {['CAUGHT', 'RUN_OUT', 'STUMPED'].includes(wicketType) && (
              <label className="block">
                <span className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Fielder {wicketType === 'STUMPED' ? '(keeper)' : ''}
                </span>
                <select
                  value={fielderId}
                  onChange={(e) => setFielderId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Not recorded</option>
                  {bowlingSquad.map((p) => (
                    <option key={p.id} value={p.playerId!}>
                      {p.playerName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {availableBatters.length > 2 && (
              <label className="block">
                <span className="block text-xs font-semibold text-gray-300 mb-1.5">Next batter in</span>
                <select
                  value={newBatsmanId}
                  onChange={(e) => setNewBatsmanId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a batter…</option>
                  {availableBatters
                    .filter((p) => p.playerId !== strikerId && p.playerId !== nonStrikerId)
                    .map((p) => (
                      <option key={p.id} value={p.playerId!}>
                        {p.playerName}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {isFreeHit && (
              <p className="text-[11px] text-amber-400">
                This is a free hit — the batter can only be run out or given out for obstructing
                the field. Bowled, caught, lbw, stumped and hit wicket do not count.
              </p>
            )}

            {wicketType === 'RETIRED_HURT' && (
              <p className="text-[11px] text-amber-400">
                A retirement through injury does not count as a wicket. The batter leaves the crease
                now but can be sent back in later in the innings.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowWicket(false)}
              className="flex-1 py-2.5 bg-pitch-dark border border-pitch-border rounded-xl text-xs font-semibold text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={submitWicket}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-bold text-white"
            >
              Confirm wicket
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirm}
        busy={submitting}
        danger={false}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label || 'Confirm'}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Modal shell                                                           */
/* -------------------------------------------------------------------- */

function Modal({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-pitch-card border border-pitch-border rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-center my-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 text-center">
            {icon && <div className="flex justify-center mb-2">{icon}</div>}
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Extras                                                                */
/* -------------------------------------------------------------------- */

function ExtrasModal({
  type,
  onClose,
  onSubmit,
}: {
  type: 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
  onClose: () => void;
  onSubmit: (p: any) => void;
}) {
  const label =
    type === 'WIDE' ? 'Wide' : type === 'NO_BALL' ? 'No ball' : type === 'BYE' ? 'Byes' : 'Leg byes';

  // A no-ball can be hit for runs; the other extras are only ever run.
  const options =
    type === 'NO_BALL'
      ? [0, 1, 2, 3, 4, 6].map((r) => ({
          label: r === 0 ? 'No ball only (1)' : `No ball + ${r} off the bat (${r + 1})`,
          payload: { runsBat: r, extraType: 'NO_BALL', runsExtra: 0 },
          highlight: r === 4 || r === 6,
        }))
      : type === 'WIDE'
      ? [0, 1, 2, 3, 4].map((r) => ({
          label: r === 0 ? 'Wide only (1)' : `Wide + ${r} run${r === 1 ? '' : 's'} (${r + 1})`,
          payload: { runsBat: 0, extraType: 'WIDE', runsExtra: r },
          highlight: false,
        }))
      : [1, 2, 3, 4].map((r) => ({
          label: `${r} ${label.toLowerCase()}`,
          payload: { runsBat: 0, extraType: type, runsExtra: r },
          highlight: r === 4,
        }));

  return (
    <Modal title={label} onClose={onClose}>
      <p className="text-xs text-gray-400">
        {type === 'WIDE' && 'One run plus anything the batters ran. The ball is re-bowled.'}
        {type === 'NO_BALL' && 'One run plus anything scored off the bat. The ball is re-bowled.'}
        {type === 'BYE' && 'Runs taken with no contact. A legal ball; not charged to the bowler.'}
        {type === 'LEG_BYE' && 'Runs off the body. A legal ball; not charged to the bowler.'}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onSubmit(opt.payload)}
            className={`py-3 rounded-xl border ${
              opt.highlight
                ? 'bg-blue-950/80 border-blue-700 text-blue-300'
                : 'bg-amber-950/70 border-amber-800 text-amber-300'
            } hover:brightness-125`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        onClick={onClose}
        className="w-full py-2.5 bg-pitch-dark border border-pitch-border rounded-xl text-xs font-semibold text-gray-400"
      >
        Cancel
      </button>
    </Modal>
  );
}

/* -------------------------------------------------------------------- */
/* Squad setup — tournament fixtures are created without squads          */
/* -------------------------------------------------------------------- */

function SquadSetupModal({ match, onDone }: { match: any; onDone: () => void }) {
  const toast = useToast();
  const teams = [
    { id: match.homeTeamId, team: match.homeTeam },
    { id: match.awayTeamId, team: match.awayTeam },
  ];
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const current = teams[index];
  const existing = match.squadPlayers.filter((p: any) => p.teamId === current.id);
  const roster = (current.team.players || []).map((tp: any) => tp.player);

  const [names, setNames] = useState<string[]>(
    existing.length > 0
      ? existing.map((p: any) => p.playerName)
      : roster.slice(0, 8).map((p: any) => p.fullName)
  );
  const [newName, setNewName] = useState('');

  // Reload the list when moving to the second team.
  useEffect(() => {
    const ex = match.squadPlayers.filter((p: any) => p.teamId === teams[index].id);
    const rosterNames = (teams[index].team.players || []).map((tp: any) => tp.player.fullName);
    setNames(ex.length > 0 ? ex.map((p: any) => p.playerName) : rosterNames.slice(0, 8));
    setNewName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  async function save() {
    if (names.length < 2) {
      toast.error('A squad needs at least 2 players');
      return;
    }
    try {
      setSaving(true);
      await apiCall(`/api/matches/${match.id}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'setSquad',
          teamId: current.id,
          players: names.map((n) => ({ playerName: n })),
        }),
      });
      if (index === 0) setIndex(1);
      else onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function addName(n: string) {
    const clean = n.trim();
    if (!clean) return;
    if (names.some((x) => x.toLowerCase() === clean.toLowerCase())) {
      toast.error(`${clean} is already in this squad`);
      return;
    }
    setNames([...names, clean]);
    setNewName('');
  }

  const suggestions = roster
    .map((p: any) => p.fullName)
    .filter((n: string) => !names.some((x) => x.toLowerCase() === n.toLowerCase()));

  return (
    <Modal title={`Squad — ${current.team.name}`} icon={<Users className="w-9 h-9 text-blue-400" />}>
      <p className="text-xs text-gray-400">
        Team {index + 1} of 2. Pick who is playing today — this decides the all-out rule
        {names.length > 0 && names.length <= 5
          ? ` (with ${names.length}, every batter must be dismissed)`
          : names.length > 5
          ? ` (all out at ${maxWicketsForSquad(names.length)} wickets)`
          : ''}
        .
      </p>

      <div className="space-y-1.5 max-h-52 overflow-y-auto text-left">
        {names.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-3">No players added yet.</p>
        )}
        {names.map((n, i) => (
          <div
            key={`${n}-${i}`}
            className="flex items-center justify-between p-2.5 rounded-xl bg-pitch-dark border border-pitch-border"
          >
            <span className="text-sm text-gray-100 truncate">
              <span className="text-gray-500 mr-2">{i + 1}.</span>
              {n}
            </span>
            <button
              onClick={() => setNames(names.filter((_, x) => x !== i))}
              aria-label={`Remove ${n}`}
              className="p-1 rounded text-gray-400 hover:text-red-300 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addName(newName);
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a player…"
          className={inputClass}
        />
        <button
          type="submit"
          className="px-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-white shrink-0"
          aria-label="Add player"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="text-left">
          <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5">
            From the team roster
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 12).map((n: string) => (
              <button
                key={n}
                onClick={() => addName(n)}
                className="px-2.5 py-1.5 rounded-lg bg-pitch-dark border border-pitch-border text-[11px] text-gray-300 hover:border-cricket-700"
              >
                + {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {index === 1 && (
          <button
            onClick={() => setIndex(0)}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300"
          >
            Back
          </button>
        )}
        <button
          onClick={save}
          disabled={saving || names.length < 2}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : index === 0 ? 'Next team →' : 'Save squads'}
        </button>
      </div>
    </Modal>
  );
}
