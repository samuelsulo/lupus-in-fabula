<script setup lang="ts">
import type { VoiceController } from "@lupus/net";
import { t } from "../i18n.ts";
import { useExternalStore } from "../use-store.ts";

const props = defineProps<{ voice: VoiceController; compact?: boolean }>();

/** In a tight toolbar only the icon fits. */
const short = (text: string): string => (props.compact ? (text.split(" ")[0] ?? text) : text);
const state = useExternalStore(
  props.voice.subscribe.bind(props.voice),
  props.voice.getState.bind(props.voice),
);
</script>

<template>
  <div class="voice">
    <button v-if="!state.micEnabled" class="primary" @click="voice.enableMic()">
      {{ short(t("voice.enable")) }}
    </button>
    <button v-else :class="{ selected: state.muted }" @click="voice.setMuted(!state.muted)">
      {{ short(state.muted ? t("voice.muted") : t("voice.on")) }}
    </button>
    <p v-if="state.error" class="error" role="alert">{{ t("voice.error") }}</p>
  </div>
</template>

<style scoped>
.error {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0.4rem 0 0;
}
</style>
