import type { TurnServer } from "@lupus/net";

/**
 * Relay servers from the build environment (`VITE_TURN_URLS`, a comma separated
 * list, plus `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`). Without them the
 * game only uses direct connections.
 */
function readTurnServers(): TurnServer[] {
  const { VITE_TURN_URLS, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL } = import.meta.env;
  const urls = (VITE_TURN_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
  if (urls.length === 0 || !VITE_TURN_USERNAME || !VITE_TURN_CREDENTIAL) return [];
  return [{ urls, username: VITE_TURN_USERNAME, credential: VITE_TURN_CREDENTIAL }];
}

export const turnServers = readTurnServers();
