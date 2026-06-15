'use client';

import { EngineStatus, timeAgo } from '@/lib/api';

export function StatusBar({
  status,
  onScanNow,
  scanning,
}: {
  status: EngineStatus | null;
  onScanNow: () => void;
  scanning: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      {status === null ? (
        <span className="flex items-center gap-2 text-sm text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Engine unreachable — start it with <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">npm run dev</code> in <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">engine/</code>
        </span>
      ) : (
        <>
          {status.books.map((book) => (
            <span
              key={book.key}
              title={book.error ?? `${book.eventCount} events`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                book.ok
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${book.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {book.name}
              <span className="text-zinc-500">{book.ok ? book.eventCount : 'down'}</span>
            </span>
          ))}
          <span className="text-xs text-zinc-500">
            {status.matchedFixtures} matched fixtures
            {status.lastScanAt ? ` · scanned ${timeAgo(status.lastScanAt)} (${status.scanDurationMs}ms)` : ' · no scan yet'}
          </span>
        </>
      )}
      <button
        onClick={onScanNow}
        disabled={scanning || status === null}
        className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {scanning ? 'Scanning…' : 'Scan now'}
      </button>
    </div>
  );
}
