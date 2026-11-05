<script setup lang="ts">
import {
  clearResume,
  generateRoomCode,
  loadResume,
  normalizeRoomCode,
  Session,
  type ResumeInfo,
  type RolePresets,
} from "@lupus/net";
import { onBeforeUnmount, ref, shallowRef } from "vue";
import presetsJson from "@content/role-presets.json";
import HomeView from "./components/HomeView.vue";
import SessionScreen from "./components/SessionScreen.vue";
import { turnServers } from "./turn.ts";

const presets = presetsJson as RolePresets;
const session = shallowRef<Session | null>(null);
/** A game this browser was hosting when the page closed or reloaded. */
const saved = ref<ResumeInfo | null>(loadResume());

function roomCodeFromUrl(): string {
  return normalizeRoomCode(location.hash.replace(/^#\/?/, ""));
}

function enter(name: string, code: string | null): void {
  const roomCode = code ?? generateRoomCode();
  location.hash = `/${roomCode}`;
  session.value = new Session({ code: roomCode, name, isHost: code === null, presets, turnServers });
}

function resumeGame(): void {
  const info = saved.value;
  if (!info) return;
  location.hash = `/${info.code}`;
  session.value = new Session({
    code: info.code,
    name: info.name,
    isHost: true,
    presets,
    resume: info.snapshot,
    turnServers,
  });
}

function discardSaved(): void {
  clearResume();
  saved.value = null;
}

function leave(): void {
  session.value?.leave();
  session.value = null;
  saved.value = loadResume();
  location.hash = "";
}

onBeforeUnmount(() => session.value?.leave());
</script>

<template>
  <HomeView
    v-if="!session"
    :initial-code="roomCodeFromUrl()"
    :resume="saved"
    @create="(name) => enter(name, null)"
    @join="enter"
    @resume="resumeGame"
    @discard="discardSaved"
  />
  <SessionScreen v-else :session="session" @leave="leave" />
</template>
