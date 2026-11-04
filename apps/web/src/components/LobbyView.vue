<script setup lang="ts">
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLE_IDS,
  UNIQUE_ROLES,
  type RoleId,
  type RoleSetupError,
} from "@lupus/core";
import type { Session, SessionSnapshot } from "@lupus/net";
import { computed, ref } from "vue";
import { t } from "../i18n.ts";
import { PLAYER_COLORS, roleInfo } from "../roles-info.ts";
import ChatPanel from "./ChatPanel.vue";
import VoicePanel from "./VoicePanel.vue";

const props = defineProps<{ session: Session; snapshot: SessionSnapshot }>();
defineEmits<{ leave: [] }>();

const error = ref<string | null>(null);
const copied = ref(false);

const link = computed(() => `${location.origin}${location.pathname}#/${props.snapshot.code}`);

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(link.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    error.value = t("lobby.copyFailed");
  }
}

/** The narrator watches from the side: they are not one of the players. */
const playerCount = computed(() => props.snapshot.players.length - (props.snapshot.narratorId ? 1 : 0));
const narratorName = computed(
  () => props.snapshot.players.find((p) => p.id === props.snapshot.narratorId)?.name ?? null,
);
const nameOf = (id: string): string => props.snapshot.players.find((p) => p.id === id)?.name ?? "?";

function chooseNarrator(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  props.session.setNarrator(value === "" ? null : value);
}

const isNarrator = computed(
  () => props.snapshot.narratorId !== null && props.snapshot.narratorId === props.snapshot.selfId,
);
const contestants = computed(() => props.snapshot.players.filter((p) => p.id !== props.snapshot.narratorId));
const setup = computed(() => props.snapshot.roleSetup);

function roleOf(playerId: string): RoleId | "" {
  return setup.value?.assignment[playerId] ?? "";
}

/** A role that may exist only once is not offered again once somebody else has it. */
function isTaken(role: RoleId, playerId: string): boolean {
  return (
    UNIQUE_ROLES.includes(role) &&
    Object.entries(setup.value?.assignment ?? {}).some(([id, r]) => r === role && id !== playerId)
  );
}

function assign(playerId: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  props.session.assignRole(playerId, value === "" ? null : (value as RoleId));
}

function describeError(error: RoleSetupError): string {
  switch (error.code) {
    case "unassigned":
      return t("roles.err.unassigned", { count: error.count });
    case "no-werewolf":
      return t("roles.err.no-werewolf");
    case "too-many-werewolves":
      return t("roles.err.too-many-werewolves", { max: error.max });
    case "duplicate":
      return t("roles.err.duplicate", { role: roleInfo(error.role).label });
  }
}

function start(): void {
  const failure = props.session.start();
  error.value = failure ? t(`start.${failure}`, { min: MIN_PLAYERS, max: MAX_PLAYERS }) : null;
}
</script>

<template>
  <main class="lobby">
    <section class="panel card">
      <template v-if="snapshot.status === 'rejected'">
        <h2>{{ t("lobby.cannotJoin") }}</h2>
        <p>
          {{
            snapshot.rejected
              ? t(`lobby.reject.${snapshot.rejected}`, { max: MAX_PLAYERS })
              : t("lobby.refused")
          }}
        </p>
        <button @click="$emit('leave')">{{ t("common.back") }}</button>
      </template>

      <template v-else-if="snapshot.status === 'host-not-found'">
        <h2>{{ t("lobby.notFound") }}</h2>
        <p class="muted">{{ t("lobby.notFoundText", { code: snapshot.code }) }}</p>
        <button @click="$emit('leave')">{{ t("common.back") }}</button>
      </template>

      <template v-else-if="snapshot.status === 'host-left'">
        <h2>{{ t("lobby.hostLeft") }}</h2>
        <p class="muted">{{ t("lobby.hostLeftText") }}</p>
        <button @click="$emit('leave')">{{ t("common.back") }}</button>
      </template>

      <template v-else>
        <div class="head">
          <div>
            <p class="muted small">{{ t("lobby.roomCode") }}</p>
            <p class="code" :aria-label="t('lobby.roomCode')">{{ snapshot.code }}</p>
          </div>
          <button @click="copyLink">{{ copied ? t("lobby.copied") : t("lobby.copyLink") }}</button>
        </div>

        <p v-if="snapshot.status === 'connecting'" class="muted" aria-live="polite">
          {{ t("lobby.looking") }}
        </p>

        <h3>{{ t("lobby.players", { count: playerCount, max: MAX_PLAYERS }) }}</h3>
        <ul class="players">
          <li v-for="(player, index) in snapshot.players" :key="player.id">
            <span class="dot" :style="{ background: PLAYER_COLORS[index % PLAYER_COLORS.length] }" />
            {{ player.name }}
            <span v-if="player.id === snapshot.narratorId" class="badge narrator">{{
              t("lobby.badge.narrator")
            }}</span>
            <span v-if="player.id === snapshot.hostId" class="badge">{{ t("lobby.badge.host") }}</span>
            <span v-if="player.id === snapshot.selfId" class="badge you">{{ t("lobby.badge.you") }}</span>
          </li>
        </ul>

        <div class="narrator-choice">
          <label for="narrator">{{ t("lobby.narrator") }}</label>
          <select
            v-if="snapshot.isHost"
            id="narrator"
            :value="snapshot.narratorId ?? ''"
            @change="chooseNarrator"
          >
            <option value="">{{ t("lobby.narrator.auto") }}</option>
            <option v-for="player in snapshot.players" :key="player.id" :value="player.id">
              {{ t("lobby.narrator.player", { name: player.name }) }}
            </option>
          </select>
          <p v-else class="muted">
            {{
              narratorName
                ? t("lobby.narrator.player", { name: narratorName })
                : t("lobby.narrator.autoShort")
            }}
          </p>
          <p class="muted small">{{ t("lobby.narrator.help") }}</p>
        </div>

        <div v-if="snapshot.narratorId" class="roles-setup">
          <h3>{{ t("roles.title") }}</h3>
          <template v-if="isNarrator">
            <label class="choice">
              <input
                type="radio"
                name="roles-mode"
                :checked="snapshot.rolesMode === 'random'"
                @change="session.setRolesMode('random')"
              />
              {{ t("roles.random") }}
            </label>
            <label class="choice">
              <input
                type="radio"
                name="roles-mode"
                :checked="snapshot.rolesMode === 'custom'"
                @change="session.setRolesMode('custom')"
              />
              {{ t("roles.custom") }}
            </label>
            <template v-if="snapshot.rolesMode === 'custom' && setup">
              <p class="muted small">{{ t("roles.secret") }}</p>
              <ul class="assignment">
                <li v-for="player in contestants" :key="player.id">
                  <span>{{ player.name }}</span>
                  <select
                    :value="roleOf(player.id)"
                    :aria-label="t('roles.player', { name: player.name })"
                    @change="assign(player.id, $event)"
                  >
                    <option value="">{{ t("roles.none") }}</option>
                    <option
                      v-for="role in ROLE_IDS"
                      :key="role"
                      :value="role"
                      :disabled="isTaken(role, player.id)"
                    >
                      {{ roleInfo(role).icon }} {{ roleInfo(role).label }}
                    </option>
                  </select>
                </li>
              </ul>
              <button @click="session.generateRoles()">{{ t("roles.generate") }}</button>
              <ul v-if="setup.errors.length" class="problems" role="alert">
                <li
                  v-for="problem in setup.errors"
                  :key="problem.code + (problem.code === 'duplicate' ? problem.role : '')"
                >
                  ⚠️ {{ describeError(problem) }}
                </li>
              </ul>
              <p v-else class="muted small">{{ t("roles.ready") }}</p>
            </template>
          </template>
          <p v-else class="muted small">
            {{ snapshot.rolesMode === "custom" ? t("roles.customInfo") : t("roles.randomInfo") }}
          </p>
        </div>

        <ChatPanel
          :messages="snapshot.chat"
          :name-of="nameOf"
          :audience="t('chat.lobby')"
          @send="(text) => session.chat(text)"
        />

        <VoicePanel :voice="session.voice" />
        <p class="muted small">{{ t("common.headphones") }}</p>

        <div class="actions">
          <button
            v-if="snapshot.isHost"
            class="primary"
            :disabled="playerCount < MIN_PLAYERS || !snapshot.rolesReady"
            @click="start"
          >
            {{ t("lobby.start") }}
          </button>
          <p v-else class="muted">{{ t("lobby.waitingHost") }}</p>
          <button @click="$emit('leave')">{{ t("common.leave") }}</button>
        </div>
        <p v-if="snapshot.isHost && playerCount < MIN_PLAYERS" class="muted small">
          {{
            snapshot.narratorId
              ? t("lobby.needPlayersNarrator", { min: MIN_PLAYERS })
              : t("lobby.needPlayers", { min: MIN_PLAYERS })
          }}
        </p>
        <p v-if="snapshot.isHost && !snapshot.rolesReady" class="muted small">
          {{ t("lobby.rolesNotReady") }}
        </p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.lobby {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: var(--cabin-backdrop);
}
.card {
  width: min(480px, 100%);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.code {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  margin: 0;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.players {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: grid;
  gap: 0.4rem;
}
.players li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.dot {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
}
.badge {
  margin-left: auto;
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.12);
}
.badge.you {
  margin-left: 0;
  background: var(--accent);
  color: #1a1203;
}
.actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-top: 1rem;
  flex-wrap: wrap;
}
.roles-setup {
  margin: 0 0 1rem;
}
.choice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.2rem 0;
}
.choice input {
  width: auto;
}
.assignment {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  display: grid;
  gap: 0.35rem;
}
.assignment li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
}
.problems {
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0;
  color: var(--danger);
  font-size: 0.9rem;
}
.narrator-choice {
  margin: 0 0 1rem;
}
.narrator-choice label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: 600;
}
.narrator-choice select {
  width: 100%;
}
.narrator-choice p {
  margin: 0.4rem 0 0;
}
.error {
  color: var(--danger);
}
</style>
