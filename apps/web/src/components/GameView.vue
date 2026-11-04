<script setup lang="ts">
import type { PlayerView } from "@lupus/core";
import type { Session, SessionSnapshot } from "@lupus/net";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { describeEvent, phaseTitle } from "../describe-event.ts";
import { ROLE_INFO } from "../roles-info.ts";
import { CircleScene } from "../scene/circle-scene.ts";
import VoicePanel from "./VoicePanel.vue";

const props = defineProps<{ session: Session; snapshot: SessionSnapshot; view: PlayerView }>();
defineEmits<{ leave: [] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let scene: CircleScene | null = null;

const names = computed(() => new Map(props.view.players.map((p) => [p.id, p.name])));
const nameOf = (id: string): string => names.value.get(id) ?? "Someone";

const role = computed(() => ROLE_INFO[props.view.me.role]);
const title = computed(() => phaseTitle(props.view.phase, props.view.day));
const log = computed(() =>
  props.view.events
    .map((e) => describeEvent(e, nameOf))
    .reverse()
    .slice(0, 8),
);

const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), 500);
const secondsLeft = computed(() =>
  props.snapshot.phaseEndsAt === null
    ? null
    : Math.max(0, Math.ceil((props.snapshot.phaseEndsAt - now.value) / 1000)),
);

const action = computed(() => props.view.action);
const selected = computed(() => (action.value?.current ?? null) as string | null);

const prompt = computed(() => {
  const current = action.value;
  if (!current) return null;
  if (current.kind === "vote") return "Who should the village eliminate?";
  switch (current.role) {
    case "werewolf":
      return "Choose tonight's victim with your pack.";
    case "doctor":
      return "Choose who to protect tonight.";
    default:
      return "Choose who to inspect tonight.";
  }
});

function choose(target: string | null): void {
  const current = action.value;
  if (!current) return;
  props.session.sendIntent(
    current.kind === "vote" ? { type: "vote", target } : { type: "night-action", target: target as string },
  );
}

function roleLabel(p: PlayerView["players"][number]): string | null {
  return p.role ? `${ROLE_INFO[p.role].icon} ${ROLE_INFO[p.role].label}` : null;
}

function refreshSeats(): void {
  scene?.setSeats(
    props.view.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, roleLabel: roleLabel(p) })),
    props.view.me.id,
  );
  refreshSelection();
}

function refreshSelection(): void {
  scene?.setSelectable(action.value?.targets ?? [], selected.value);
}

onMounted(() => {
  if (!canvas.value) return;
  scene = new CircleScene(canvas.value);
  scene.setOnPick((id) => choose(id));
  scene.setNight(props.view.phase === "NIGHT");
  refreshSeats();
});

watch(
  () => JSON.stringify(props.view.players),
  () => refreshSeats(),
);
watch(
  () => props.view.phase,
  (phase) => scene?.setNight(phase === "NIGHT"),
);
watch([action, selected], refreshSelection);

onBeforeUnmount(() => {
  clearInterval(ticker);
  scene?.dispose();
});

const werewolfPicks = computed(() =>
  action.value?.kind === "night-action"
    ? Object.entries(action.value.allyPicks).map(
        ([actor, target]) => `${nameOf(actor)} chose ${nameOf(target)}`,
      )
    : [],
);
</script>

<template>
  <div class="game">
    <canvas ref="canvas" class="scene" aria-label="3D view of the village circle" />

    <header class="top panel">
      <strong>{{ title }}</strong>
      <span v-if="secondsLeft !== null" class="timer" aria-label="Time left">{{ secondsLeft }}s</span>
      <span class="spacer" />
      <span class="muted">Room {{ snapshot.code }}</span>
      <button
        v-if="snapshot.isHost && view.phase !== 'GAME_OVER'"
        title="Skip the current timer"
        @click="session.skip()"
      >
        Skip ⏭
      </button>
      <button @click="$emit('leave')">Leave</button>
    </header>

    <aside class="role panel">
      <h3>{{ role.icon }} {{ role.label }}</h3>
      <p class="muted">{{ role.description }}</p>
      <p v-if="view.allies.length" class="small">Pack: {{ view.allies.map(nameOf).join(", ") }}</p>
      <ul v-if="view.inspections.length" class="small plain">
        <li v-for="i in view.inspections" :key="`${i.day}-${i.targetId}`">
          Night {{ i.day }}: {{ nameOf(i.targetId) }} is
          {{ i.isWerewolf ? "a werewolf 🐺" : "not a werewolf" }}.
        </li>
      </ul>
      <p v-if="!view.me.alive" class="small">
        💀 You are dead. You can still watch, but the living cannot hear you.
      </p>
    </aside>

    <section class="bottom panel">
      <div v-if="action && prompt" class="action">
        <p class="prompt">{{ prompt }}</p>
        <p v-for="pick in werewolfPicks" :key="pick" class="muted small">{{ pick }}</p>
        <div class="targets">
          <button
            v-for="id in action.targets"
            :key="id"
            :class="{ selected: selected === id }"
            :aria-pressed="selected === id"
            @click="choose(id)"
          >
            {{ nameOf(id) }}
          </button>
          <button
            v-if="action.kind === 'vote'"
            :class="{ selected: action.current === null }"
            @click="choose(null)"
          >
            Abstain
          </button>
        </div>
        <p class="muted small">You can also click a player in the circle.</p>
      </div>

      <ul class="log plain" aria-live="polite">
        <li v-for="(line, index) in log" :key="index">{{ line }}</li>
      </ul>
      <VoicePanel :voice="session.voice" />
    </section>

    <div v-if="view.asleep" class="asleep" role="status">
      <p class="big">🌙</p>
      <p>Night falls. Close your eyes and stay quiet.</p>
      <p class="muted">The narrator will wake you if needed.</p>
    </div>

    <div v-if="view.phase === 'GAME_OVER'" class="over">
      <div class="panel card">
        <h2>{{ view.winner === "villagers" ? "🏡 The villagers win!" : "🐺 The werewolves win!" }}</h2>
        <ul class="plain roles">
          <li v-for="p in view.players" :key="p.id">
            {{ p.name }}: {{ p.role ? `${ROLE_INFO[p.role].icon} ${ROLE_INFO[p.role].label}` : "?" }}
            <span v-if="!p.alive" class="muted">(dead)</span>
          </li>
        </ul>
        <button class="primary" @click="$emit('leave')">Back to the start</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.top {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.5rem 0.8rem;
  flex-wrap: wrap;
  /* Above the night overlay: the host must always be able to skip or leave. */
  z-index: 7;
}
.spacer {
  flex: 1;
}
.timer {
  font-variant-numeric: tabular-nums;
  padding: 0.1rem 0.5rem;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.12);
}
.role {
  position: absolute;
  top: 4.5rem;
  left: 0.75rem;
  width: min(300px, calc(100% - 1.5rem));
}
.bottom {
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: 0.75rem;
  max-height: 45%;
  overflow: auto;
  display: grid;
  gap: 0.7rem;
}
@media (min-width: 900px) {
  .bottom {
    left: auto;
    width: 400px;
  }
}
.prompt {
  font-weight: 600;
  margin: 0 0 0.4rem;
}
.targets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.small {
  font-size: 0.85rem;
  margin: 0.3rem 0 0;
}
.plain {
  list-style: none;
  padding: 0;
  margin: 0;
}
.log li {
  font-size: 0.9rem;
  padding: 0.15rem 0;
}
.log li:first-child {
  font-weight: 600;
}
.asleep {
  position: absolute;
  inset: 0;
  background: #02030a;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 0.3rem;
  z-index: 5;
}
.asleep p {
  margin: 0;
}
.big {
  font-size: 4rem;
}
.over {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 6;
  padding: 1rem;
}
.card {
  width: min(440px, 100%);
}
.roles {
  margin: 1rem 0;
  display: grid;
  gap: 0.3rem;
}
</style>
