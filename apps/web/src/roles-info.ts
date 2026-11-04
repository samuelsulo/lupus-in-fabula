import type { RoleId } from "@lupus/core";

export const ROLE_INFO: Record<RoleId, { label: string; icon: string; description: string }> = {
  werewolf: {
    label: "Werewolf",
    icon: "🐺",
    description: "Each night, agree with the other werewolves on a victim. By day, blend in.",
  },
  villager: {
    label: "Villager",
    icon: "🧑‍🌾",
    description: "You have no power but your voice and your vote. Find the werewolves.",
  },
  seer: {
    label: "Seer",
    icon: "🔮",
    description: "Each night, learn whether one player is a werewolf.",
  },
  doctor: {
    label: "Doctor",
    icon: "⚕️",
    description: "Each night, protect one player (yourself included) from the werewolves.",
  },
};

/** Stable colours, indexed by seat so every client agrees. */
export const PLAYER_COLORS = [
  "#e4572e",
  "#29a3a3",
  "#f3a712",
  "#7b5ea7",
  "#4c9f38",
  "#d6447a",
  "#3f7cac",
  "#c4a484",
  "#8aa29e",
  "#b5651d",
];
