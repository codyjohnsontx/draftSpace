interface Env {
  ROOMS: DurableObjectNamespace<import("./src/room").Room>;
  ALLOWED_ORIGINS: string;
  ROOM_GRACE_PERIOD_MS: string;
  ROOM_UNCLAIMED_TTL_MS: string;
  ROOM_MAX_PARTICIPANTS: string;
  ROOM_MAX_MESSAGE_BYTES: string;
}
