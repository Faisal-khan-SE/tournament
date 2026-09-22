'use client';

import Link from 'next/link';
import { CalendarDays, MapPin, PlayCircle, Trophy, Radio, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from './ui';
import { oversDisplay } from '@/lib/matchRules';

interface Innings {
  inningsNo: number;
  battingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  legalBalls: number;
}

export interface MatchLike {
  id: string;
  status: string;
  stage?: string | null;
  groupName?: string | null;
  matchType: string;
  venue: string;
  date: string | Date;
  overs: number;
  resultSummary?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { name: string; shortName: string };
  awayTeam: { name: string; shortName: string };
  tournament?: { name: string; slug: string } | null;
  potm?: { fullName: string } | null;
  innings?: Innings[];
}

function scoreFor(match: MatchLike, teamId: string) {
  const inn = match.innings?.find((i) => i.battingTeamId === teamId);
  if (!inn) return null;
  return `${inn.totalRuns}/${inn.totalWickets} (${oversDisplay(inn.legalBalls)})`;
}

export default function MatchCard({
  match,
  onDelete,
  onEdit,
}: {
  match: MatchLike;
  onDelete?: (match: MatchLike) => void;
  onEdit?: (match: MatchLike) => void;
}) {
  const isLive = match.status === 'LIVE' || match.status === 'INNINGS_BREAK';
  const homeScore = scoreFor(match, match.homeTeamId);
  const awayScore = scoreFor(match, match.awayTeamId);
  const date = new Date(match.date);

  return (
    <div
      className={`bg-pitch-card border rounded-2xl p-4 sm:p-5 transition hover:border-cricket-800 ${
        isLive ? 'border-red-900/70' : 'border-pitch-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <StatusBadge status={match.status} />
          {match.tournament ? (
            <Link
              href={`/tournaments/${match.tournament.slug}`}
              className="text-[11px] font-semibold text-cricket-400 hover:underline truncate"
            >
              {match.tournament.name}
            </Link>
          ) : (
            <span className="text-[11px] font-semibold text-gray-500">Single match</span>
          )}
          {match.stage && match.stage !== 'LEAGUE' && match.stage !== 'FRIENDLY' && (
            <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-[10px] font-bold text-amber-300">
              {match.stage}
            </span>
          )}
          {match.groupName && (
            <span className="px-2 py-0.5 rounded bg-cricket-950 border border-cricket-800 text-[10px] font-bold text-cricket-300">
              Group {match.groupName}
            </span>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(match)}
                aria-label={`Edit ${match.homeTeam.name} vs ${match.awayTeam.name}`}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-pitch-dark border border-transparent hover:border-pitch-border"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(match)}
                aria-label={`Delete ${match.homeTeam.name} vs ${match.awayTeam.name}`}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60 border border-transparent hover:border-red-900"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <Link href={`/match/${match.id}`} className="block group">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-white text-sm sm:text-base truncate group-hover:text-cricket-400 transition">
              {match.homeTeam.name}
            </span>
            <span className="text-sm font-mono font-bold text-cricket-300 shrink-0">
              {homeScore || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-white text-sm sm:text-base truncate group-hover:text-cricket-400 transition">
              {match.awayTeam.name}
            </span>
            <span className="text-sm font-mono font-bold text-cricket-300 shrink-0">
              {awayScore || '—'}
            </span>
          </div>
        </div>

        {match.resultSummary ? (
          <p className="mt-3 text-xs font-semibold text-cricket-300 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{match.resultSummary}</span>
          </p>
        ) : isLive ? (
          <p className="mt-3 text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 live-pulse" /> Match in progress
          </p>
        ) : null}
      </Link>

      <div className="mt-3 pt-3 border-t border-pitch-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{match.venue}</span>
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3" />
          {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} • {match.overs} ov
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/match/${match.id}`}
          className="flex-1 py-2 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-200 text-center hover:bg-pitch-border/40"
        >
          {match.status === 'COMPLETED' ? 'Scorecard' : 'Details'}
        </Link>
        {match.status !== 'COMPLETED' && match.status !== 'ABANDONED' && (
          <Link
            href={`/score/${match.id}`}
            className="flex-1 py-2 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white text-center flex items-center justify-center gap-1"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            {match.status === 'SCHEDULED' ? 'Start match' : 'Continue'}
          </Link>
        )}
      </div>
    </div>
  );
}
