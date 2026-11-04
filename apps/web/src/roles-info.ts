import type { RoleId } from "@lupus/core";
import { t } from "./i18n.ts";

const ICONS: Record<RoleId, string> = {
  werewolf: "🐺",
  villager: "🧑‍🌾",
  seer: "🔮",
  doctor: "⚕️",
  hunter: "🏹",
  bodyguard: "🛡️",
};

/** Name, icon and description of a role, in the current language. */
export function roleInfo(role: RoleId): { label: string; icon: string; description: string } {
  return { icon: ICONS[role], label: t(`role.${role}.label`), description: t(`role.${role}.description`) };
}

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
