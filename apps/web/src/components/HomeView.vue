<script setup lang="ts">
import { normalizeRoomCode } from "@lupus/net";
import { computed, ref } from "vue";

const props = defineProps<{ initialCode: string }>();
const emit = defineEmits<{ create: [name: string]; join: [name: string, code: string] }>();

function storedName(): string {
  try {
    return localStorage.getItem("lupus-name") ?? "";
  } catch {
    return "";
  }
}

const name = ref(storedName());
const code = ref(props.initialCode);
const normalizedCode = computed(() => normalizeRoomCode(code.value));
const canContinue = computed(() => name.value.trim().length > 0);

function remember(): void {
  try {
    localStorage.setItem("lupus-name", name.value.trim());
  } catch {
    // Storage can be unavailable (private windows): the name is simply not remembered.
  }
}

function create(): void {
  remember();
  emit("create", name.value.trim());
}

function join(): void {
  remember();
  emit("join", name.value.trim(), normalizedCode.value);
}
</script>

<template>
  <main class="home">
    <section class="panel card">
      <h1>🐺 Lupus in Fabula</h1>
      <p class="muted">
        Werewolf in 3D for 4 to 10 players. Peer-to-peer, no accounts, no server: share a room code and talk.
      </p>

      <label for="name">Your name</label>
      <input id="name" v-model="name" maxlength="20" autocomplete="nickname" placeholder="e.g. Sam" />

      <div class="row">
        <button class="primary" :disabled="!canContinue" @click="create">Create a room</button>
      </div>

      <div class="divider"><span>or join your friends</span></div>

      <label for="code">Room code</label>
      <div class="row">
        <input
          id="code"
          v-model="code"
          maxlength="12"
          autocapitalize="characters"
          placeholder="ABCDE"
          @keyup.enter="canContinue && normalizedCode && join()"
        />
        <button :disabled="!canContinue || !normalizedCode" @click="join">Join</button>
      </div>

      <p class="muted small">🎧 Use headphones, otherwise the voice chat will echo.</p>
    </section>
  </main>
</template>

<style scoped>
.home {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: radial-gradient(circle at 50% 20%, #1c2540, #0a0d14 70%);
}
.card {
  width: min(440px, 100%);
}
label {
  display: block;
  margin: 1rem 0 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
}
input {
  width: 100%;
}
.row {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.8rem;
}
.row .primary {
  width: 100%;
}
.divider {
  text-align: center;
  margin: 1.4rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.small {
  font-size: 0.85rem;
  margin-bottom: 0;
}
</style>
