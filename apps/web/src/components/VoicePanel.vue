<script setup lang="ts">
import type { VoiceController } from "@lupus/net";
import { useExternalStore } from "../use-store.ts";

const props = defineProps<{ voice: VoiceController }>();
const state = useExternalStore(
  props.voice.subscribe.bind(props.voice),
  props.voice.getState.bind(props.voice),
);
</script>

<template>
  <div class="voice">
    <button v-if="!state.micEnabled" class="primary" @click="voice.enableMic()">🎙️ Enable microphone</button>
    <button v-else :class="{ selected: state.muted }" @click="voice.setMuted(!state.muted)">
      {{ state.muted ? "🔇 Muted" : "🎙️ Mic on" }}
    </button>
    <p v-if="state.error" class="error" role="alert">{{ state.error }}</p>
  </div>
</template>

<style scoped>
.error {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0.4rem 0 0;
}
</style>
