<script setup lang="ts">
import { generateRoomCode, normalizeRoomCode, Session, type RolePresets } from "@lupus/net";
import { onBeforeUnmount, shallowRef } from "vue";
import presetsJson from "@content/role-presets.json";
import HomeView from "./components/HomeView.vue";
import SessionScreen from "./components/SessionScreen.vue";

const presets = presetsJson as RolePresets;
const session = shallowRef<Session | null>(null);

function roomCodeFromUrl(): string {
  return normalizeRoomCode(location.hash.replace(/^#\/?/, ""));
}

function enter(name: string, code: string | null): void {
  const roomCode = code ?? generateRoomCode();
  location.hash = `/${roomCode}`;
  session.value = new Session({ code: roomCode, name, isHost: code === null, presets });
}

function leave(): void {
  session.value?.leave();
  session.value = null;
  location.hash = "";
}

onBeforeUnmount(() => session.value?.leave());
</script>

<template>
  <HomeView
    v-if="!session"
    :initial-code="roomCodeFromUrl()"
    @create="(name) => enter(name, null)"
    @join="enter"
  />
  <SessionScreen v-else :session="session" @leave="leave" />
</template>
