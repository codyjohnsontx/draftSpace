"use client";

import type { BoardDocument, Viewport } from "@/core/board/types";
import { selectionBounds } from "@/core/geometry/bounds";
import { worldToScreen } from "@/core/geometry/coordinates";
import { useCollaborationStore } from "@/stores/collaboration-store";

export function RemotePresenceOverlay({ board, viewport }: { board: BoardDocument; viewport: Viewport }) {
  const participants = useCollaborationStore((state) => state.participants);
  const selfParticipantId = useCollaborationStore((state) => state.selfParticipantId);
  return <svg className="remote-presence-overlay" aria-hidden="true">
    {Object.values(participants).map((participant) => {
      if (participant.participantId === selfParticipantId) return null;
      const presence = participant.presence; if (!presence) return null;
      const selected = presence.selectedElementIds.map((id) => board.elements[id]).filter(Boolean);
      const bounds = selectionBounds(selected);
      const screenBounds = bounds ? { ...worldToScreen(bounds, viewport), width: bounds.width * viewport.zoom, height: bounds.height * viewport.zoom } : null;
      const cursor = presence.cursor ? worldToScreen(presence.cursor, viewport) : null;
      return <g key={participant.participantId} style={{ "--participant-color": participant.color } as React.CSSProperties}>
        {screenBounds && <rect className="remote-selection-frame" {...screenBounds} />}
        {cursor && <g className="remote-cursor" transform={`translate(${cursor.x} ${cursor.y})`}>
          <path d="M1 1 4.8 17.2 8.3 11.5 14.4 10.2Z" />
          <g transform="translate(12 13)"><rect width={Math.max(48, participant.displayName.length * 7 + 14)} height="22" rx="7" /><text className="remote-cursor-label" x="7" y="15">{participant.displayName}</text></g>
        </g>}
      </g>;
    })}
  </svg>;
}
