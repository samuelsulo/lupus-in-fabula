import type { GameEvent, Phase, PlayerView } from "@lupus/core";
import { t } from "./i18n.ts";
import { roleInfo } from "./roles-info.ts";

export function describeEvent(event: GameEvent, nameOf: (id: string) => string): string {
  switch (event.type) {
    case "night-start":
      return t("ev.nightStart", { day: event.day });
    case "death":
      return t(`ev.death.${event.cause}`, { name: nameOf(event.playerId) });
    case "no-death":
      return t("ev.noDeath");
    case "hunter-pass":
      return t("ev.hunterPass", { name: nameOf(event.playerId) });
    case "narrator-left":
      return event.waiting ? t("ev.narratorLeftWaiting") : t("ev.narratorLeft");
    case "narrator-new":
      return t("ev.narratorNew", { name: nameOf(event.playerId) });
    case "vote-result": {
      const voters = new Map<string, string[]>();
      for (const [voter, target] of Object.entries(event.votes)) {
        if (target) voters.set(target, [...(voters.get(target) ?? []), nameOf(voter)]);
      }
      const tally = Object.entries(event.tally)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) =>
          t("ev.tallyEntry", { target: nameOf(id), count, voters: (voters.get(id) ?? []).join(", ") }),
        )
        .join(", ");
      const outcome = event.eliminated
        ? t("ev.eliminated", { name: nameOf(event.eliminated) })
        : t("ev.noMajority");
      return tally ? t("ev.votes", { tally, outcome }) : t("ev.nobodyVoted", { outcome });
    }
    case "game-over":
      return event.winner === "villagers" ? t("ev.villagersWin") : t("ev.werewolvesWin");
  }
}

export function phaseTitle(phase: Phase, day: number): string {
  return t(`phase.${phase}`, { day });
}

/** What the human narrator should do now, phase by phase. */
export function narratorHint(view: PlayerView): string {
  if (view.phase !== "NIGHT") return t(`hint.${view.phase}`);
  const awake = view.narratorInfo?.awake;
  return awake ? t("hint.NIGHT", { role: roleInfo(awake).label }) : t("hint.nobody");
}
