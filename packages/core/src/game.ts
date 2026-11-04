import { nextRandom, shuffle } from "./rng.ts";
import { NIGHT_ROLES, ROLES } from "./roles.ts";
import type { GameConfig, GameEvent, GameState, Intent, Player, Result, RoleId, Team } from "./types.ts";

export interface NewGameOptions {
  players: { id: string; name: string }[];
  /** One role per player. They are shuffled and assigned using the seed. */
  roles: RoleId[];
  seed: number;
  config?: Partial<GameConfig>;
}

export const DEFAULT_CONFIG: GameConfig = { revealRoleOnDeath: true };

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

/** Creates a game in the ROLE_REVEAL phase. Throws on invalid setup (programmer error). */
export function createGame(options: NewGameOptions): GameState {
  const { players, roles, seed } = options;
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`A game needs between ${MIN_PLAYERS} and ${MAX_PLAYERS} players`);
  }
  if (roles.length !== players.length) {
    throw new Error("There must be exactly one role per player");
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error("Player ids must be unique");
  }
  if (!roles.includes("werewolf")) {
    throw new Error("A game needs at least one werewolf");
  }

  const shuffled = shuffle(roles, seed);
  return {
    config: { ...DEFAULT_CONFIG, ...options.config },
    players: players.map((p, index): Player => ({
      id: p.id,
      name: p.name,
      role: shuffled.items[index] as RoleId,
      alive: true,
    })),
    phase: "ROLE_REVEAL",
    day: 1,
    nightSteps: [],
    nightStep: 0,
    nightActions: {},
    votes: {},
    inspections: [],
    events: [],
    winner: null,
    rngState: shuffled.state,
  };
}

export function getPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function livingPlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

/** The role currently awake during the night, if any. */
export function awakeRole(state: GameState): RoleId | null {
  return state.phase === "NIGHT" ? (state.nightSteps[state.nightStep] ?? null) : null;
}

function actorsOf(state: GameState, role: RoleId): Player[] {
  return state.players.filter((p) => p.alive && p.role === role);
}

/** Valid targets for a living actor in the current step, or [] if they cannot act now. */
export function nightTargets(state: GameState, actorId: string): string[] {
  const actor = getPlayer(state, actorId);
  if (!actor?.alive || awakeRole(state) !== actor.role) return [];
  return livingPlayers(state)
    .filter((p) => {
      if (actor.role === "werewolf") return p.role !== "werewolf";
      if (actor.role === "seer") return p.id !== actor.id;
      return true;
    })
    .map((p) => p.id);
}

export function voteTargets(state: GameState, voterId: string): string[] {
  const voter = getPlayer(state, voterId);
  if (!voter?.alive || state.phase !== "DAY_VOTE") return [];
  return livingPlayers(state)
    .filter((p) => p.id !== voterId)
    .map((p) => p.id);
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

/** Applies a player's intent. Invalid intents are rejected without changing the state. */
export function applyIntent(state: GameState, playerId: string, intent: Intent): Result<GameState> {
  if (intent.type === "night-action") {
    if (!nightTargets(state, playerId).includes(intent.target)) {
      return { ok: false, error: "Invalid night action" };
    }
    const next = clone(state);
    next.nightActions[playerId] = intent.target;
    return { ok: true, state: maybeFinishNightStep(next) };
  }

  const targets = voteTargets(state, playerId);
  if (targets.length === 0 || (intent.target !== null && !targets.includes(intent.target))) {
    return { ok: false, error: "Invalid vote" };
  }
  const next = clone(state);
  next.votes[playerId] = intent.target;
  if (livingPlayers(next).every((p) => p.id in next.votes)) {
    tallyVotes(next);
  }
  return { ok: true, state: next };
}

/** Moves the game forward by one step (timer expiry or narrator action). */
export function advance(state: GameState): GameState {
  const next = clone(state);
  switch (next.phase) {
    case "ROLE_REVEAL":
      startNight(next);
      break;
    case "NIGHT":
      finishNightStep(next);
      break;
    case "DAWN":
      next.phase = "DAY_DISCUSSION";
      break;
    case "DAY_DISCUSSION":
      next.phase = "DAY_VOTE";
      next.votes = {};
      break;
    case "DAY_VOTE":
      tallyVotes(next);
      break;
    case "ELIMINATION":
      next.day += 1;
      startNight(next);
      break;
    case "GAME_OVER":
      break;
  }
  return next;
}

function startNight(state: GameState): void {
  state.phase = "NIGHT";
  state.nightActions = {};
  state.nightStep = 0;
  state.nightSteps = NIGHT_ROLES.filter((role) => actorsOf(state, role).length > 0);
  state.events.push({ type: "night-start", day: state.day });
  if (state.nightSteps.length === 0) resolveNight(state);
}

function maybeFinishNightStep(state: GameState): GameState {
  const role = awakeRole(state);
  if (role && actorsOf(state, role).every((p) => p.id in state.nightActions)) {
    finishNightStep(state);
  }
  return state;
}

function finishNightStep(state: GameState): void {
  state.nightStep += 1;
  if (state.nightStep >= state.nightSteps.length) resolveNight(state);
}

function pickWolfVictim(state: GameState): string | null {
  const tally: Record<string, number> = {};
  for (const wolf of actorsOf(state, "werewolf")) {
    const target = state.nightActions[wolf.id];
    if (target) tally[target] = (tally[target] ?? 0) + 1;
  }
  const top = Math.max(0, ...Object.values(tally));
  if (top === 0) return null;
  const leaders = Object.keys(tally).filter((id) => tally[id] === top);
  const roll = nextRandom(state.rngState);
  state.rngState = roll.state;
  return leaders[Math.floor(roll.value * leaders.length)] ?? null;
}

function resolveNight(state: GameState): void {
  for (const seer of actorsOf(state, "seer")) {
    const targetId = state.nightActions[seer.id];
    const target = targetId ? getPlayer(state, targetId) : undefined;
    if (target) {
      state.inspections.push({
        seerId: seer.id,
        day: state.day,
        targetId: target.id,
        isWerewolf: target.role === "werewolf",
      });
    }
  }

  const victim = pickWolfVictim(state);
  const protectedIds = actorsOf(state, "doctor")
    .map((doctor) => state.nightActions[doctor.id])
    .filter((id): id is string => id !== undefined);

  if (victim && !protectedIds.includes(victim)) {
    kill(state, victim, "werewolves");
  } else {
    state.events.push({ type: "no-death", day: state.day });
  }

  state.nightActions = {};
  state.phase = "DAWN";
  checkVictory(state);
}

function kill(state: GameState, playerId: string, cause: "werewolves" | "vote"): void {
  const player = getPlayer(state, playerId);
  if (!player) return;
  player.alive = false;
  state.events.push({ type: "death", day: state.day, playerId, cause });
}

function tallyVotes(state: GameState): void {
  const tally: Record<string, number> = {};
  for (const target of Object.values(state.votes)) {
    if (target) tally[target] = (tally[target] ?? 0) + 1;
  }
  const top = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter((id) => tally[id] === top);
  const eliminated = top > 0 && leaders.length === 1 ? (leaders[0] ?? null) : null;

  state.events.push({ type: "vote-result", day: state.day, tally, eliminated });
  if (eliminated) kill(state, eliminated, "vote");
  state.votes = {};
  state.phase = "ELIMINATION";
  checkVictory(state);
}

export function winnerOf(state: GameState): Team | null {
  const living = livingPlayers(state);
  const wolves = living.filter((p) => ROLES[p.role].team === "werewolves").length;
  if (wolves === 0) return "villagers";
  if (wolves >= living.length - wolves) return "werewolves";
  return null;
}

function checkVictory(state: GameState): void {
  const winner = winnerOf(state);
  if (!winner) return;
  state.winner = winner;
  state.phase = "GAME_OVER";
  const event: GameEvent = { type: "game-over", winner };
  state.events.push(event);
}
