import { newId } from "@/lib/ids/new-id";
import { participantProfileSchema, type ParticipantProfile } from "@draftspace/collaboration-protocol";

export const PARTICIPANT_PROFILE_KEY = "draftspace:participant-profile";
const colors = ["#b85f3f", "#4f6fa8", "#3f7f78", "#7b5f86", "#d4a72c", "#6f8f72"];

export function loadParticipantProfile(): ParticipantProfile | null {
  try {
    const value = localStorage.getItem(PARTICIPANT_PROFILE_KEY);
    if (!value) return null;
    const result = participantProfileSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch { return null; }
}

export function saveParticipantProfile(displayName: string, existing = loadParticipantProfile()): ParticipantProfile | null {
  const result = participantProfileSchema.safeParse({
    id: existing?.id ?? newId(),
    displayName: displayName.trim(),
    color: existing?.color ?? colors[Math.floor(Math.random() * colors.length)],
  });
  if (!result.success) return null;
  const profile = result.data;
  try { localStorage.setItem(PARTICIPANT_PROFILE_KEY, JSON.stringify(profile)); } catch { /* The profile remains available for this session. */ }
  return profile;
}
