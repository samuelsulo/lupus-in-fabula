import { awakeRole, getPlayer, nightTargets, voteTargets } from "./game.ts";
import { ROLES } from "./roles.ts";
import type { GameEvent, GameState, Inspection, Narrator, Phase, RoleId, Team } from "./types.ts";

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  /**
   * Only set when the role is public: your own, everybody's at game over, and a werewolf the
   * village voted out. Roles stay hidden when somebody dies in the night.
   */
  role: RoleId | null;
  /** True for a player the village voted out who was not a werewolf (the only thing it learns). */
  notWerewolf: boolean;
}

export type PlayerAction =
  | {
      kind: "night-action";
      role: RoleId;
      targets: string[];
      current: string | null;
      /** Werewolves see the picks of their allies. */
      allyPicks: Record<string, string>;
    }
  | { kind: "vote"; targets: string[]; current: string | null | undefined };

/** What the narrator sees on top of the public game: who is awake and what they chose. */
export interface NarratorInfo {
  awake: RoleId | null;
  /** actor id -> target id, for the current night. */
  picks: Record<string, string>;
}

/** Everything one player is allowed to know. This is the only thing sent to a client. */
export interface PlayerView {
  /** The role is null for the narrator, who plays none. */
  me: { id: string; role: RoleId | null; alive: boolean };
  narrator: Narrator | null;
  /** Set only for the narrator. */
  narratorInfo: NarratorInfo | null;
  /** Players of the game, narrator excluded. */
  players: PublicPlayer[];
  phase: Phase;
  day: number;
  winner: Team | null;
  events: GameEvent[];
  /** False when votes stay secret until the vote is over (the narrator still sees them). */
  openVotes: boolean;
  /** Who votes for whom right now (empty when votes are secret until the end). */
  votes: Record<string, string | null>;
  /** Other werewolves, visible to werewolves only. */
  allies: string[];
  /** Seer inspection results, visible to the seer only. */
  inspections: Inspection[];
  /** True when the player must have their eyes closed (dark screen). */
  asleep: boolean;
  action: PlayerAction | null;
}

export function viewFor(state: GameState, playerId: string): PlayerView {
  if (state.narrator?.id === playerId) return narratorView(state, state.narrator);
  const me = getPlayer(state, playerId);
  if (!me) throw new Error(`Unknown player ${playerId}`);
  const gameOver = state.phase === "GAME_OVER";
  const votedOut = new Set(
    state.events.flatMap((e) => (e.type === "death" && e.cause === "vote" ? [e.playerId] : [])),
  );
  const isWolf = me.role === "werewolf";
  const awake = awakeRole(state);

  let action: PlayerAction | null = null;
  const targets = nightTargets(state, playerId);
  if (targets.length > 0) {
    action = {
      kind: "night-action",
      role: me.role,
      targets,
      current: state.nightActions[playerId] ?? null,
      allyPicks: isWolf
        ? Object.fromEntries(
            Object.entries(state.nightActions).filter(
              ([actor]) => actor !== playerId && getPlayer(state, actor)?.role === "werewolf",
            ),
          )
        : {},
    };
  } else {
    const voteOptions = voteTargets(state, playerId);
    if (voteOptions.length > 0) {
      action = { kind: "vote", targets: voteOptions, current: state.votes[playerId] };
    }
  }

  return {
    me: { id: me.id, role: me.role, alive: me.alive },
    narrator: state.narrator,
    narratorInfo: null,
    openVotes: state.config.openVotes,
    votes: state.phase === "DAY_VOTE" && state.config.openVotes ? state.votes : {},
    players: state.players
      .filter((p) => p.id !== state.narrator?.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        role: gameOver || p.id === playerId || (votedOut.has(p.id) && p.role === "werewolf") ? p.role : null,
        notWerewolf: votedOut.has(p.id) && p.role !== "werewolf",
      })),
    phase: state.phase,
    day: state.day,
    winner: state.winner,
    events: state.events,
    allies: isWolf
      ? state.players.filter((p) => p.id !== playerId && ROLES[p.role].team === "werewolves").map((p) => p.id)
      : [],
    inspections: me.role === "seer" ? state.inspections.filter((i) => i.seerId === playerId) : [],
    asleep: state.phase === "NIGHT" && me.alive && awake !== me.role,
    action,
  };
}

/** The narrator sees every role and every night choice. */
function narratorView(state: GameState, narrator: Narrator): PlayerView {
  return {
    me: { id: narrator.id, role: null, alive: true },
    narrator,
    narratorInfo: { awake: awakeRole(state), picks: state.nightActions },
    players: state.players
      .filter((p) => p.id !== narrator.id)
      .map((p) => ({ id: p.id, name: p.name, alive: p.alive, role: p.role, notWerewolf: false })),
    phase: state.phase,
    day: state.day,
    winner: state.winner,
    events: state.events,
    openVotes: true,
    votes: state.phase === "DAY_VOTE" ? state.votes : {},
    allies: [],
    inspections: state.inspections,
    asleep: false,
    action: null,
  };
}
