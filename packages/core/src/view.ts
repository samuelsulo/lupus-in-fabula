import { awakeRole, getPlayer, nightTargets, voteTargets } from "./game.ts";
import { ROLES } from "./roles.ts";
import type { GameEvent, GameState, Inspection, Phase, RoleId, Team } from "./types.ts";

export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  /** Only set when the role is public (revealed on death, or at game over). */
  role: RoleId | null;
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

/** Everything one player is allowed to know. This is the only thing sent to a client. */
export interface PlayerView {
  me: { id: string; role: RoleId; alive: boolean };
  players: PublicPlayer[];
  phase: Phase;
  day: number;
  winner: Team | null;
  events: GameEvent[];
  /** Other werewolves, visible to werewolves only. */
  allies: string[];
  /** Seer inspection results, visible to the seer only. */
  inspections: Inspection[];
  /** True when the player must have their eyes closed (dark screen). */
  asleep: boolean;
  action: PlayerAction | null;
}

export function viewFor(state: GameState, playerId: string): PlayerView {
  const me = getPlayer(state, playerId);
  if (!me) throw new Error(`Unknown player ${playerId}`);
  const gameOver = state.phase === "GAME_OVER";
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
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      role: gameOver || (!p.alive && state.config.revealRoleOnDeath) || p.id === playerId ? p.role : null,
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
