<script setup lang="ts">
import type { Session } from "@lupus/net";
import { defineAsyncComponent } from "vue";
import { useExternalStore } from "../use-store.ts";
import LobbyView from "./LobbyView.vue";

const props = defineProps<{ session: Session }>();
defineEmits<{ leave: [] }>();

// three.js is only needed once a game starts: keep it out of the first load.
const GameView = defineAsyncComponent(() => import("./GameView.vue"));

const snapshot = useExternalStore(props.session.subscribe, props.session.getSnapshot);
</script>

<template>
  <GameView
    v-if="snapshot.status === 'playing' && snapshot.view"
    :session="session"
    :snapshot="snapshot"
    :view="snapshot.view"
    @leave="$emit('leave')"
  />
  <LobbyView v-else :session="session" :snapshot="snapshot" @leave="$emit('leave')" />
</template>
