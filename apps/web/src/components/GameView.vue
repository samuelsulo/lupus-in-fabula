<script setup lang="ts">
import { ROLES, initialSeating, type Phase, type Place, type PlayerView } from "@lupus/core";
import type { Session, SessionSnapshot } from "@lupus/net";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Ambience } from "../ambience.ts";
import { describeEvent, narratorHint, phaseTitle } from "../describe-event.ts";
import { t } from "../i18n.ts";
import { Narration } from "../narration.ts";
import { PHASE_ICONS } from "../phase-info.ts";
import { roleInfo } from "../roles-info.ts";
import { CozyScene } from "../scene/cozy-scene.ts";
import ChatPanel from "./ChatPanel.vue";
import VoicePanel from "./VoicePanel.vue";
import VoteBoard from "./VoteBoard.vue";

const props = defineProps<{ session: Session; snapshot: SessionSnapshot; view: PlayerView }>();
defineEmits<{ leave: [] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const sceneFailed = ref(false);
let scene: CozyScene | null = null;

const names = computed(() => {
  const map = new Map(props.view.players.map((p) => [p.id, p.name]));
  if (props.view.narrator) map.set(props.view.narrator.id, props.view.narrator.name);
  return map;
});
const nameOf = (id: string): string => names.value.get(id) ?? t("game.someone");

const isNarrator = computed(() => props.view.me.role === null);
const role = computed(() => (props.view.me.role ? roleInfo(props.view.me.role) : null));
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
  return current.kind === "vote" ? t("prompt.vote") : t(`prompt.${current.role}` as "prompt.seer");
});

/** Werewolves keep talking until the whole pack points at the same victim. */
const packStatus = computed(() => {
  const current = action.value;
  if (current?.kind !== "night-action" || current.role !== "werewolf") return null;
  const livingAllies = props.view.allies.filter((id) => props.view.players.find((p) => p.id === id)?.alive);
  const picks = [current.current, ...Object.values(current.allyPicks)];
  const allChose = picks.length === livingAllies.length + 1 && picks.every((pick) => pick !== null);
  if (!allChose) return t("pack.waiting");
  return new Set(picks).size === 1 ? t("pack.agree") : t("pack.disagree");
});

/** Night whispers: who can hear you while you are awake. */
const whisper = computed(() => {
  if (props.view.phase !== "NIGHT" || props.view.asleep || isNarrator.value) return null;
  const narrated = props.view.narrator !== null;
  if (props.view.me.role === "werewolf") return narrated ? t("whisper.packNarrator") : t("whisper.pack");
  return narrated ? t("whisper.narrator") : null;
});

const canAdvance = computed(
  () => props.view.phase !== "GAME_OVER" && (props.view.narrator ? isNarrator.value : props.snapshot.isHost),
);

const narratorPicks = computed(() =>
  Object.entries(props.view.narratorInfo?.picks ?? {}).map(([actor, target]) =>
    t("game.picked", { actor: nameOf(actor), target: nameOf(target) }),
  ),
);

/** The living, who are the ones who vote. */
const voters = computed(() => props.view.players.filter((p) => p.alive));

/** The role in words: what it does, when, and how. */
const roleHelp = computed(() => {
  const id = props.view.me.role;
  if (!id) return null;
  return {
    when: t(`role.${id}.when` as "role.seer.when"),
    how: t(`role.${id}.how` as "role.seer.how"),
    team: t(`team.${ROLES[id].team}` as "team.villagers"),
  };
});

/** The one line everybody can follow: what is happening now and what to do about it. */
const coach = computed(() => {
  const v = props.view;
  if (isNarrator.value) return narratorHint(v);
  if (v.asleep) return t("todo.asleep");
  const current = action.value;
  if (current && prompt.value) {
    if (current.kind === "vote") {
      if (current.current === undefined) return prompt.value;
      return current.current === null
        ? t("todo.abstained")
        : t("todo.voted", { name: nameOf(current.current) });
    }
    if (current.current && current.role !== "werewolf" && current.role !== "hunter") return t("todo.done");
    return prompt.value;
  }
  switch (v.phase) {
    case "ROLE_REVEAL":
      return t("todo.reveal");
    case "NIGHT":
      return t("todo.asleep");
    case "DAWN":
      return t("todo.dawn");
    case "DAY_DISCUSSION":
      return v.me.alive ? t("todo.discussion") : t("todo.discussion.dead");
    case "DAY_VOTE":
      return t("todo.vote.dead");
    case "ELIMINATION":
      return t("todo.verdict");
    case "HUNTER_SHOT":
      return t("todo.hunter.other");
    default:
      return t("todo.over");
  }
});

// A big banner on every change of scene, with what just happened.
interface Banner {
  icon: string;
  title: string;
  text: string;
}
const banner = ref<Banner | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
let bannerFrom = props.view.events.length;
const NEWS = new Set(["death", "no-death", "vote-result", "hunter-pass", "narrator-left", "narrator-new"]);
function showBanner(phase: Phase): void {
  const fresh = props.view.events.slice(bannerFrom);
  bannerFrom = props.view.events.length;
  if (phase === "ROLE_REVEAL" || phase === "GAME_OVER" || props.view.asleep) return;
  const news = fresh.filter((e) => NEWS.has(e.type)).map((e) => describeEvent(e, nameOf));
  clearTimeout(bannerTimer);
  banner.value = {
    icon: PHASE_ICONS[phase],
    title: phaseTitle(phase, props.view.day),
    text: news.length ? news.join(" ") : coach.value,
  };
  bannerTimer = setTimeout(() => (banner.value = null), 5500);
}

/** The role card at the start of the game, until the player dismisses it. */
const revealOpen = ref(props.view.phase === "ROLE_REVEAL" && props.view.me.role !== null);

function choose(target: string | null): void {
  const current = action.value;
  if (!current) return;
  props.session.sendIntent(
    current.kind === "vote" ? { type: "vote", target } : { type: "night-action", target: target as string },
  );
}

function subtitleOf(p: PlayerView["players"][number]): string | null {
  const parts: string[] = [];
  if (p.role) parts.push(`${roleInfo(p.role).icon} ${roleInfo(p.role).label}`);
  else if (p.notWerewolf) parts.push(t("game.notWolf"));
  const count = Object.values(props.view.votes).filter((target) => target === p.id).length;
  if (count > 0) parts.push(`🗳 ${count}`);
  return parts.length ? parts.join("  ") : null;
}

const seating = computed(() => props.snapshot.seating ?? initialSeating(props.view.players.map((p) => p.id)));

function refreshPeople(): void {
  scene?.setPeople(
    props.view.players.map((p) => ({ id: p.id, name: p.name, alive: p.alive, subtitle: subtitleOf(p) })),
    props.view.me.id,
    props.view.narrator
      ? { id: props.view.narrator.id, name: props.view.narrator.name, caption: t("lobby.badge.narrator") }
      : null,
  );
  refreshSelection();
}

function refreshSelection(): void {
  scene?.setSelectable(action.value?.targets ?? [], selected.value);
}

// Walking around.
const moving = ref(false);
/** Players walk only while the village is awake; the narrator may walk at any time. */
const canMove = computed(
  () =>
    props.view.phase !== "GAME_OVER" &&
    (isNarrator.value || (props.view.phase !== "NIGHT" && !props.view.asleep)),
);
function setMoving(on: boolean): void {
  moving.value = on && canMove.value;
  scene?.setMoveMode(moving.value, !isNarrator.value);
}
function onMove(place: Place): void {
  props.session.move(place);
}

// Preferences kept in this browser only.
function stored(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}
function remember(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // The choice simply is not remembered.
  }
}
const soundOn = ref(stored("lupus-sound", true));
const speechOn = ref(stored("lupus-speech", true));
const ambience = new Ambience();
const narration = new Narration();
ambience.setEnabled(soundOn.value);
narration.setEnabled(speechOn.value);
function toggleSound(): void {
  soundOn.value = !soundOn.value;
  remember("lupus-sound", soundOn.value);
  ambience.setEnabled(soundOn.value);
  ambience.start();
}
function toggleSpeech(): void {
  speechOn.value = !speechOn.value;
  remember("lupus-speech", speechOn.value);
  narration.setEnabled(speechOn.value);
}
/** Only the automatic narrator speaks: a human narrator does it with their own voice. */
const speaks = computed(() => props.view.narrator === null && Narration.supported);

onMounted(() => {
  // The game screen never scrolls: the page is locked while it is open.
  document.documentElement.classList.add("in-game");
  ambience.start();
  ambience.setNight(props.view.phase === "NIGHT");
  if (speaks.value) narration.say(t("narr.start"));
  if (!canvas.value) return;
  try {
    scene = new CozyScene(canvas.value);
  } catch {
    // No WebGL (or a broken driver): the game stays playable with the buttons.
    sceneFailed.value = true;
    return;
  }
  scene.setOnPick((id) => choose(id));
  scene.setOnMove(onMove);
  scene.setNight(props.view.phase === "NIGHT");
  scene.setSeating(seating.value);
  refreshPeople();
});

watch(
  () => JSON.stringify([props.view.players, props.view.narrator, props.view.votes]),
  () => refreshPeople(),
);
watch(seating, (next) => scene?.setSeating(next));
watch(
  () => props.view.phase,
  (phase) => {
    scene?.setNight(phase === "NIGHT");
    ambience.setNight(phase === "NIGHT");
    if (phase !== "ROLE_REVEAL") revealOpen.value = false;
    showBanner(phase);
    if (!canMove.value) setMoving(false);
    if (!speaks.value) return;
    const cues: Partial<Record<typeof phase, Parameters<typeof t>[0]>> = {
      NIGHT: "narr.night",
      DAWN: "narr.dawn",
      DAY_DISCUSSION: "narr.discussion",
      DAY_VOTE: "narr.vote",
      HUNTER_SHOT: "narr.hunter",
    };
    const cue = cues[phase];
    if (cue) narration.say(t(cue));
  },
);
watch([action, selected], refreshSelection);

// The automatic narrator wakes you when it is your turn, and puts you back to sleep.
watch(
  () => (action.value?.kind === "night-action" && props.view.phase === "NIGHT" ? action.value.role : null),
  (awake, before) => {
    if (!speaks.value) return;
    if (awake && awake !== "hunter") narration.say(t(`narr.wake.${awake}` as "narr.wake.seer"));
    else if (!awake && before && props.view.phase === "NIGHT") narration.say(t("narr.sleep"));
  },
);

// Announcements: whatever just happened, read aloud once.
let spokenEvents = props.view.events.length;
watch(
  () => props.view.events.length,
  (count) => {
    const fresh = props.view.events.slice(spokenEvents, count);
    spokenEvents = count;
    if (!speaks.value) return;
    for (const event of fresh) {
      if (event.type !== "night-start") narration.say(describeEvent(event, nameOf));
    }
  },
);

onBeforeUnmount(() => {
  document.documentElement.classList.remove("in-game");
  compactQuery.removeEventListener("change", updateScreen);
  portraitQuery.removeEventListener("change", updateScreen);
  clearInterval(ticker);
  clearTimeout(bannerTimer);
  scene?.dispose();
  ambience.dispose();
  narration.stop();
});

const werewolfPicks = computed(() =>
  action.value?.kind === "night-action"
    ? Object.entries(action.value.allyPicks).map(([actor, target]) =>
        t("game.picked", { actor: nameOf(actor), target: nameOf(target) }),
      )
    : [],
);

// Chat follows the voice rules, so the label says who will read it.
const chatAudience = computed(() => {
  if (!props.view.me.alive && !isNarrator.value) return t("chat.ghost");
  return props.view.phase === "NIGHT" ? t("chat.night") : t("chat.day");
});
const chatDisabled = computed(() => props.view.asleep);

/** Phones: a small screen. Panels fold away so the room fills the whole screen. */
const compactQuery = window.matchMedia("(max-height: 560px)");
const portraitQuery = window.matchMedia("(orientation: portrait) and (pointer: coarse)");
const compact = ref(compactQuery.matches);
/** On a touch device held upright the 3D room is too small to play: ask to turn the phone. */
const needsRotation = ref(portraitQuery.matches);
const showRole = ref(false);
const showExtras = ref(false);
const updateScreen = (): void => {
  compact.value = compactQuery.matches;
  needsRotation.value = portraitQuery.matches;
};
compactQuery.addEventListener("change", updateScreen);
portraitQuery.addEventListener("change", updateScreen);
/** Without extras on a compact screen, the bottom panel only shows when there is something to act on. */
const showBottom = computed(
  () =>
    !compact.value ||
    showExtras.value ||
    (action.value !== null && prompt.value !== null) ||
    whisper.value !== null,
);
/** On small screens the chat starts folded so it does not cover the room. */
const wideScreen = window.matchMedia("(min-width: 900px)").matches;
</script>

<template>
  <div class="game" :class="{ compact }">
    <canvas ref="canvas" class="scene" :aria-label="t('game.room', { code: snapshot.code })" />
    <div v-if="sceneFailed" class="no-scene muted" role="status">{{ t("game.noScene") }}</div>

    <header class="top panel" :data-phase="view.phase">
      <div class="bar">
        <span class="phase-icon" aria-hidden="true">{{ PHASE_ICONS[view.phase] }}</span>
        <strong class="title">{{ title }}</strong>
        <span v-if="secondsLeft !== null" class="timer" aria-label="Time left">{{ secondsLeft }}s</span>
        <span class="spacer" />
        <span class="muted room-code">{{ t("game.room", { code: snapshot.code }) }}</span>
        <button v-if="compact && canMove" :class="{ selected: moving }" @click="setMoving(!moving)">
          🚶
        </button>
        <button
          v-if="compact"
          :class="{ selected: showExtras }"
          :aria-pressed="showExtras"
          @click="showExtras = !showExtras"
        >
          💬
        </button>
        <VoicePanel v-if="compact" :voice="session.voice" compact />
        <button class="icon" :aria-pressed="soundOn" @click="toggleSound">
          {{ soundOn ? "🔊" : "🔈" }}<span class="long"> {{ soundOn ? t("sound.on") : t("sound.off") }}</span>
        </button>
        <button v-if="speaks" class="icon" :aria-pressed="speechOn" @click="toggleSpeech">
          {{ speechOn ? "🗣️" : "🤐"
          }}<span class="long"> {{ speechOn ? t("speech.on") : t("speech.off") }}</span>
        </button>
        <button
          v-if="canAdvance"
          class="primary"
          :title="view.narrator ? t('game.nextTitle') : t('game.skipTitle')"
          @click="session.advance()"
        >
          {{ view.narrator ? t("game.next") : t("game.skip") }}
        </button>
        <button @click="$emit('leave')">{{ t("common.leave") }}</button>
      </div>
      <p class="coach" role="status">{{ coach }}</p>
    </header>

    <div v-if="banner" class="banner panel" :data-phase="view.phase" role="status" @click="banner = null">
      <span class="banner-icon" aria-hidden="true">{{ banner.icon }}</span>
      <strong class="banner-title">{{ banner.title }}</strong>
      <span class="banner-text">{{ banner.text }}</span>
    </div>

    <div v-if="revealOpen && role && roleHelp" class="reveal">
      <div class="panel card">
        <p class="reveal-icon" aria-hidden="true">{{ role.icon }}</p>
        <h2>{{ role.label }}</h2>
        <p class="team">{{ roleHelp.team }}</p>
        <p>{{ role.description }}</p>
        <p class="small">
          <strong>{{ t("reveal.when") }}:</strong> {{ roleHelp.when }}
        </p>
        <p class="small">
          <strong>{{ t("reveal.how") }}:</strong> {{ roleHelp.how }}
        </p>
        <button class="primary" @click="revealOpen = false">{{ t("reveal.ok") }}</button>
      </div>
    </div>

    <div v-if="view.phase === 'DAY_VOTE'" class="voteboard">
      <VoteBoard
        :voters="voters"
        :votes="view.votes"
        :name-of="nameOf"
        :secret="!view.openVotes"
        :compact="compact"
      />
    </div>

    <aside v-if="role" class="role panel">
      <button class="fold" :aria-expanded="showRole" @click="showRole = !showRole">
        {{ role.icon }} {{ role.label }} {{ showRole ? "▴" : "▾" }}
      </button>
      <h3 class="heading">{{ role.icon }} {{ role.label }}</h3>
      <div v-show="!compact || showRole">
        <p class="muted">{{ role.description }}</p>
        <p v-if="view.allies.length" class="small">
          {{ t("game.pack", { names: view.allies.map(nameOf).join(", ") }) }}
        </p>
        <ul v-if="view.inspections.length" class="small plain">
          <li v-for="i in view.inspections" :key="`${i.day}-${i.targetId}`">
            {{
              t("game.inspection", {
                day: i.day,
                name: nameOf(i.targetId),
                result: i.isWerewolf ? t("game.isWolf") : t("game.isNotWolf"),
              })
            }}
          </li>
        </ul>
        <p v-if="!view.me.alive" class="small">{{ t("game.dead") }}</p>
        <button
          v-if="canMove && !compact"
          class="walk"
          :class="{ selected: moving }"
          @click="setMoving(!moving)"
        >
          {{ moving ? t("game.walkDone") : t("game.walk") }}
        </button>
      </div>
    </aside>

    <aside v-else class="role panel">
      <button class="fold" :aria-expanded="showRole" @click="showRole = !showRole">
        {{ t("game.narratorYou") }} {{ showRole ? "▴" : "▾" }}
      </button>
      <h3 class="heading">{{ t("game.narratorYou") }}</h3>
      <div v-show="!compact || showRole">
        <p class="small">{{ narratorHint(view) }}</p>
        <ul class="small plain cast">
          <li v-for="p in view.players" :key="p.id" :class="{ dead: !p.alive }">
            {{ p.role ? roleInfo(p.role).icon : "" }} {{ p.name }}
            <span class="muted"
              >{{ p.role ? roleInfo(p.role).label : "" }}{{ p.alive ? "" : `, ${t("game.deadList")}` }}</span
            >
          </li>
        </ul>
        <p v-for="pick in narratorPicks" :key="pick" class="small muted">{{ pick }}</p>
        <button
          v-if="canMove && !compact"
          class="walk"
          :class="{ selected: moving }"
          @click="setMoving(!moving)"
        >
          {{ moving ? t("game.walkDone") : t("game.walk") }}
        </button>
      </div>
    </aside>

    <p v-if="moving" class="walk-hint panel" role="status">
      {{ isNarrator ? t("game.walkHintNarrator") : t("game.walkHint") }}
    </p>

    <section v-show="showBottom" class="bottom panel">
      <div v-if="action && prompt" class="action">
        <p v-for="pick in werewolfPicks" :key="pick" class="muted small">{{ pick }}</p>
        <p v-if="packStatus" class="small status" role="status">{{ packStatus }}</p>
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
            {{ t("game.abstain") }}
          </button>
        </div>
      </div>

      <p v-if="whisper" class="small whisper">🤫 {{ whisper }}</p>

      <div v-show="!compact || showExtras" class="extras">
        <ul class="log plain" aria-live="polite">
          <li v-for="(line, index) in log" :key="index">{{ line }}</li>
        </ul>
        <details class="chat-box" :open="wideScreen">
          <summary>💬 {{ t("chat.title") }} ({{ snapshot.chat.length }})</summary>
          <ChatPanel
            :messages="snapshot.chat"
            :name-of="nameOf"
            :audience="chatAudience"
            :disabled="chatDisabled"
            :disabled-reason="t('chat.asleep')"
            @send="(text) => session.chat(text)"
          />
        </details>
        <VoicePanel v-if="!compact" :voice="session.voice" />
      </div>
    </section>

    <div v-if="snapshot.status === 'reconnecting' || snapshot.pause" class="interrupt" role="alert">
      <div class="panel card">
        <template v-if="snapshot.status === 'reconnecting'">
          <p class="big" aria-hidden="true">🔌</p>
          <h2>{{ t("reconnect.title") }}</h2>
          <p class="muted">{{ t("reconnect.body") }}</p>
        </template>
        <template v-else-if="snapshot.pause">
          <p class="big" aria-hidden="true">⏸️</p>
          <h2>{{ t("pause.title") }}</h2>
          <p class="muted">{{ t("pause.waiting", { names: snapshot.pause.waitingFor.join(", ") }) }}</p>
          <button v-if="snapshot.isHost" class="primary" @click="session.continueGame()">
            {{ t("pause.continue") }}
          </button>
        </template>
        <button @click="$emit('leave')">{{ t("common.leave") }}</button>
      </div>
    </div>

    <div v-if="needsRotation" class="rotate" role="alert">
      <p class="phone" aria-hidden="true">📱</p>
      <h2>{{ t("rotate.title") }}</h2>
      <p class="muted">{{ t("rotate.body") }}</p>
      <button @click="$emit('leave')">{{ t("common.leave") }}</button>
    </div>

    <div v-if="view.asleep" class="asleep" role="status">
      <p class="big">🌙</p>
      <p>{{ t("game.asleepTitle") }}</p>
      <p class="muted">{{ view.narrator ? t("game.asleepNarrated") : t("game.asleepAuto") }}</p>
    </div>

    <div v-if="view.phase === 'GAME_OVER'" class="over">
      <div class="panel card">
        <h2>{{ view.winner === "villagers" ? t("game.villagersWin") : t("game.werewolvesWin") }}</h2>
        <ul class="plain roles">
          <li v-for="p in view.players" :key="p.id">
            {{ p.name }}: {{ p.role ? `${roleInfo(p.role).icon} ${roleInfo(p.role).label}` : "?" }}
            <span v-if="!p.alive" class="muted">{{ t("game.dead.suffix") }}</span>
          </li>
        </ul>
        <button class="primary" @click="$emit('leave')">{{ t("game.backToStart") }}</button>
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
.game {
  /* Where the panels under the header start. */
  --below-top: calc(6.8rem + env(safe-area-inset-top));
}
.top {
  position: absolute;
  top: calc(0.75rem + env(safe-area-inset-top));
  left: calc(0.75rem + env(safe-area-inset-left));
  right: calc(0.75rem + env(safe-area-inset-right));
  padding: 0.5rem 0.8rem 0.6rem;
  border-left: 6px solid var(--phase-color, var(--accent));
  /* Above the night overlay: the host must always be able to skip or leave. */
  z-index: 7;
}
.bar {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  flex-wrap: wrap;
}
.phase-icon {
  font-size: 1.7rem;
  line-height: 1;
}
.title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--phase-color, var(--text));
}
.coach {
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
  font-weight: 600;
}
.top[data-phase="NIGHT"],
.banner[data-phase="NIGHT"] {
  --phase-color: #9aa8ff;
}
.top[data-phase="DAWN"],
.banner[data-phase="DAWN"] {
  --phase-color: #ffb86b;
}
.top[data-phase="DAY_DISCUSSION"],
.banner[data-phase="DAY_DISCUSSION"] {
  --phase-color: #ffd86b;
}
.top[data-phase="DAY_VOTE"],
.banner[data-phase="DAY_VOTE"],
.top[data-phase="HUNTER_SHOT"],
.banner[data-phase="HUNTER_SHOT"] {
  --phase-color: #ff7a5c;
}
.top[data-phase="ELIMINATION"],
.banner[data-phase="ELIMINATION"] {
  --phase-color: #e6c9a8;
}
.top[data-phase="ROLE_REVEAL"] {
  --phase-color: #c7a6ff;
}
.top[data-phase="GAME_OVER"] {
  --phase-color: #8fe3a0;
}
.banner {
  position: absolute;
  top: var(--below-top);
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  text-align: center;
  padding: 0.8rem 1.6rem;
  width: max-content;
  max-width: min(560px, calc(100% - 1.5rem));
  border: 2px solid var(--phase-color, var(--accent));
  animation: pop 0.35s ease-out;
  cursor: pointer;
}
.banner-icon {
  font-size: 2.6rem;
  line-height: 1;
}
.banner-title {
  font-family: var(--font-display);
  font-size: 1.7rem;
  color: var(--phase-color);
}
.banner-text {
  font-size: 1.05rem;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.92);
  }
}
.reveal {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(10, 5, 2, 0.72);
}
.reveal .card {
  text-align: center;
  max-height: 100%;
  overflow: auto;
}
.reveal .primary {
  margin-top: 0.6rem;
}
.reveal-icon {
  font-size: 4rem;
  margin: 0;
  line-height: 1.1;
}
.team {
  font-weight: 600;
  color: var(--accent);
}
.voteboard {
  position: absolute;
  top: var(--below-top);
  right: calc(0.75rem + env(safe-area-inset-right));
  width: min(250px, 40%);
  max-height: 38%;
  z-index: 3;
  display: flex;
}
.awake {
  font-weight: 600;
  color: var(--accent);
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
  top: var(--below-top);
  left: calc(0.75rem + env(safe-area-inset-left));
  width: min(300px, calc(100% - 1.5rem));
}
.fold {
  display: none;
}
.bottom {
  position: absolute;
  left: calc(0.75rem + env(safe-area-inset-left));
  right: calc(0.75rem + env(safe-area-inset-right));
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
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
  background: radial-gradient(circle at 50% 110%, #2a1208, #070302 65%);
  display: grid;
  place-content: center;
  text-align: center;
  gap: 0.3rem;
  z-index: 5;
}
.asleep p {
  margin: 0;
}
.chat-box summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.no-scene {
  position: absolute;
  inset: 40% 1rem auto;
  text-align: center;
}
.votes .label {
  font-weight: 600;
  margin: 0;
}
.walk {
  margin-top: 0.6rem;
  width: 100%;
}
.status {
  color: var(--accent);
}
.whisper {
  font-style: italic;
}
.cast li {
  padding: 0.1rem 0;
}
.cast li.dead {
  opacity: 0.55;
  text-decoration: line-through;
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
.long {
  white-space: pre;
}
.walk-hint {
  position: absolute;
  top: var(--below-top);
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  text-align: center;
  width: max-content;
  max-width: calc(100% - 1.5rem);
  z-index: 4;
}
.interrupt {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(10, 5, 2, 0.8);
}
.interrupt .card {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  text-align: center;
}
.interrupt h2,
.interrupt p {
  margin: 0;
}
.rotate {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  text-align: center;
  background: radial-gradient(circle at 50% 110%, #3a1b0b, #0a0503 70%);
}
.rotate h2,
.rotate p {
  margin: 0;
}
.phone {
  font-size: 4rem;
  animation: turn 2.4s ease-in-out infinite;
}
@keyframes turn {
  0%,
  25% {
    transform: rotate(0deg);
  }
  60%,
  100% {
    transform: rotate(-90deg);
  }
}

/* Small screens (a phone held sideways): panels fold away and the room fills the screen. */
.compact {
  --below-top: calc(5.4rem + env(safe-area-inset-top));
}
.compact .top {
  top: calc(0.4rem + env(safe-area-inset-top));
  left: calc(0.5rem + env(safe-area-inset-left));
  right: calc(0.5rem + env(safe-area-inset-right));
  padding: 0.25rem 0.5rem 0.3rem;
}
.compact .bar {
  gap: 0.35rem;
  flex-wrap: nowrap;
}
.compact .phase-icon {
  font-size: 1.3rem;
}
.compact .title {
  font-size: 1.05rem;
  white-space: nowrap;
}
.compact .coach {
  margin-top: 0.15rem;
  font-size: 0.85rem;
  line-height: 1.25;
}
.compact .banner {
  padding: 0.4rem 1rem;
}
.compact .banner-icon {
  font-size: 1.6rem;
}
.compact .banner-title {
  font-size: 1.15rem;
}
.compact .banner-text {
  font-size: 0.85rem;
}
.compact .voteboard {
  width: min(210px, 36%);
  max-height: 45%;
}
.compact .reveal .card {
  padding: 0.6rem 1rem;
}
.compact .reveal-icon {
  font-size: 2.2rem;
}
.compact .top button {
  padding: 0.3rem 0.55rem;
}
.compact .room-code,
.compact .long {
  display: none;
}
.compact .role {
  top: var(--below-top);
  left: calc(0.5rem + env(safe-area-inset-left));
  width: min(280px, 36%);
  padding: 0.35rem 0.6rem;
  max-height: calc(100% - 7rem);
  overflow: auto;
}
.compact .role .heading {
  display: none;
}
.compact .fold {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  padding: 0.2rem 0;
  font-weight: 600;
}
.compact .bottom {
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  width: min(560px, calc(100% - 1rem));
  bottom: calc(0.4rem + env(safe-area-inset-bottom));
  max-height: 62%;
  padding: 0.5rem 0.7rem;
  gap: 0.4rem;
}
.compact .targets button {
  padding: 0.35rem 0.65rem;
}
</style>
