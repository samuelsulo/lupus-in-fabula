<script setup lang="ts">
import { MAX_PLAYERS, MIN_PLAYERS } from "@lupus/core";
import type { Session, SessionSnapshot } from "@lupus/net";
import { computed, ref } from "vue";
import { PLAYER_COLORS } from "../roles-info.ts";
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
    error.value = "Could not copy the link. Select and copy it manually.";
  }
}

function start(): void {
  error.value = props.session.start();
}

const REJECTIONS = {
  "game-in-progress": "This game has already started.",
  "room-full": `The room is full (${MAX_PLAYERS} players).`,
  "version-mismatch": "The host runs a different version of the game.",
} as const;
</script>

<template>
  <main class="lobby">
    <section class="panel card">
      <template v-if="snapshot.status === 'rejected'">
        <h2>Cannot join</h2>
        <p>{{ snapshot.rejected ? REJECTIONS[snapshot.rejected] : "The host refused the connection." }}</p>
        <button @click="$emit('leave')">Back</button>
      </template>

      <template v-else-if="snapshot.status === 'host-not-found'">
        <h2>Room not found</h2>
        <p class="muted">
          Nobody answered for room <strong>{{ snapshot.code }}</strong
          >. Check the code, or ask the host to keep the page open. Some corporate networks block peer-to-peer
          connections.
        </p>
        <button @click="$emit('leave')">Back</button>
      </template>

      <template v-else-if="snapshot.status === 'host-left'">
        <h2>The host left</h2>
        <p class="muted">The game cannot continue without the host.</p>
        <button @click="$emit('leave')">Back</button>
      </template>

      <template v-else>
        <div class="head">
          <div>
            <p class="muted small">Room code</p>
            <p class="code" aria-label="Room code">{{ snapshot.code }}</p>
          </div>
          <button @click="copyLink">{{ copied ? "Copied!" : "Copy invite link" }}</button>
        </div>

        <p v-if="snapshot.status === 'connecting'" class="muted" aria-live="polite">
          Looking for the room...
        </p>

        <h3>Players ({{ snapshot.players.length }}/{{ MAX_PLAYERS }})</h3>
        <ul class="players">
          <li v-for="(player, index) in snapshot.players" :key="player.id">
            <span class="dot" :style="{ background: PLAYER_COLORS[index % PLAYER_COLORS.length] }" />
            {{ player.name }}
            <span v-if="player.id === snapshot.hostId" class="badge">host</span>
            <span v-if="player.id === snapshot.selfId" class="badge you">you</span>
          </li>
        </ul>

        <VoicePanel :voice="session.voice" />
        <p class="muted small">🎧 Use headphones, otherwise the voice chat will echo.</p>

        <div class="actions">
          <button
            v-if="snapshot.isHost"
            class="primary"
            :disabled="snapshot.players.length < MIN_PLAYERS"
            @click="start"
          >
            Start the game
          </button>
          <p v-else class="muted">Waiting for the host to start...</p>
          <button @click="$emit('leave')">Leave</button>
        </div>
        <p v-if="snapshot.isHost && snapshot.players.length < MIN_PLAYERS" class="muted small">
          At least {{ MIN_PLAYERS }} players are needed.
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
  background: radial-gradient(circle at 50% 20%, #1c2540, #0a0d14 70%);
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
.error {
  color: var(--danger);
}
</style>
