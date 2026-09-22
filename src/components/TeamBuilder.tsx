'use client';

import { useState } from 'react';
import { Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { inputClass } from '@/components/ui';
import { GROUP_NAMES } from '@/lib/groups';

/** One team in a tournament form: either an existing team or one typed in now. */
export interface TeamEntry {
  key: string;
  teamId?: string;
  name: string;
  shortName: string;
  players: string[];
  /** Player count for an existing team, shown instead of an editable list. */
  existingPlayerCount?: number;
  groupName: string;
}

export function newTeamEntry(): TeamEntry {
  return {
    key: Math.random().toString(36).slice(2),
    name: '',
    shortName: '',
    players: [],
    groupName: '',
  };
}

export function GroupSelect({
  value,
  onChange,
  disabled,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Group"
      className={`${inputClass} !w-auto !py-1.5 !px-2 text-xs ${className}`}
    >
      <option value="">No group</option>
      {GROUP_NAMES.map((g) => (
        <option key={g} value={g}>
          Group {g}
        </option>
      ))}
    </select>
  );
}

/**
 * Names typed one per row, with a remove button on each. Kept generic so the
 * tournament form and the manage tab share the exact same behaviour.
 */
export function PlayerListEditor({
  players,
  onChange,
  placeholder = 'Player name',
}: {
  players: string[];
  onChange: (players: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const clean = draft.trim();
    if (!clean) return;
    if (players.some((p) => p.toLowerCase() === clean.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...players, clean]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      {players.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {players.map((p, i) => (
            <li
              key={`${p}-${i}`}
              className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-pitch-dark border border-pitch-border text-xs text-gray-100"
            >
              <span>{p}</span>
              <button
                type="button"
                onClick={() => onChange(players.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${p}`}
                className="p-0.5 rounded-full text-gray-400 hover:text-red-300 hover:bg-red-950/60"
              >
                <UserMinus className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={`${inputClass} !py-2 text-xs`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-3 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold disabled:opacity-40 shrink-0 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

/** Editable card for one team in the tournament form. */
export function TeamEntryCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: TeamEntry;
  onChange: (entry: TeamEntry) => void;
  onRemove: () => void;
}) {
  const isExisting = Boolean(entry.teamId);
  return (
    <div className="p-3 rounded-xl bg-pitch-dark/60 border border-pitch-border space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          {isExisting ? (
            <div>
              <div className="text-sm font-bold text-white truncate">{entry.name}</div>
              <div className="text-[10px] text-gray-400 flex items-center gap-1">
                <Users className="w-3 h-3" /> {entry.existingPlayerCount ?? 0} players — existing team
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <input
                value={entry.name}
                onChange={(e) => onChange({ ...entry, name: e.target.value })}
                placeholder="Team name"
                className={`${inputClass} !py-2 text-sm font-semibold`}
              />
              <input
                value={entry.shortName}
                onChange={(e) => onChange({ ...entry, shortName: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="Short"
                maxLength={5}
                className={`${inputClass} !py-2 text-xs uppercase`}
              />
            </div>
          )}
        </div>
        <GroupSelect value={entry.groupName} onChange={(g) => onChange({ ...entry, groupName: g })} />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${entry.name || 'team'}`}
          className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {!isExisting && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 mb-1.5">
            Players ({entry.players.length})
          </div>
          <PlayerListEditor
            players={entry.players}
            onChange={(players) => onChange({ ...entry, players })}
          />
        </div>
      )}
    </div>
  );
}
