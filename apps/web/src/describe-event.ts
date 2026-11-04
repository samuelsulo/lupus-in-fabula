import type { GameEvent, Phase } from "@lupus/core";

export function describeEvent(event: GameEvent, nameOf: (id: string) => string): string {
  switch (event.type) {
    case "night-start":
      return `Night ${event.day} falls on the village.`;
    case "death":
      return event.cause === "werewolves"
        ? `${nameOf(event.playerId)} was killed by the werewolves during the night.`
        : `${nameOf(event.playerId)} was eliminated by the village.`;
    case "no-death":
      return "Nobody died during the night.";
    case "vote-result": {
      const tally = Object.entries(event.tally)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => `${nameOf(id)} ${count}`)
        .join(", ");
      const outcome = event.eliminated
        ? `${nameOf(event.eliminated)} is eliminated.`
        : "No majority: nobody is eliminated.";
      return tally ? `Votes: ${tally}. ${outcome}` : `Nobody voted. ${outcome}`;
    }
    case "game-over":
      return event.winner === "villagers" ? "The villagers win!" : "The werewolves win!";
  }
}

export function phaseTitle(phase: Phase, day: number): string {
  switch (phase) {
    case "ROLE_REVEAL":
      return "Your role";
    case "NIGHT":
      return `Night ${day}`;
    case "DAWN":
      return `Dawn of day ${day}`;
    case "DAY_DISCUSSION":
      return `Day ${day}: discussion`;
    case "DAY_VOTE":
      return `Day ${day}: vote`;
    case "ELIMINATION":
      return `Day ${day}: verdict`;
    case "GAME_OVER":
      return "Game over";
  }
}
