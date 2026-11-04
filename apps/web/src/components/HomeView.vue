<script setup lang="ts">
import { normalizeRoomCode, type ResumeInfo } from "@lupus/net";
import { computed, ref } from "vue";
import { LOCALES, locale, setLocale, t, type Locale } from "../i18n.ts";

const props = defineProps<{ initialCode: string; resume: ResumeInfo | null }>();
const emit = defineEmits<{
  create: [name: string];
  join: [name: string, code: string];
  resume: [];
  discard: [];
}>();

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
      <p class="muted">{{ t("home.tagline") }}</p>

      <div v-if="resume" class="resume" role="status">
        <p>
          <strong>{{ t("home.resume.title", { code: resume.code }) }}</strong
          ><br />
          <span class="muted">{{ t("home.resume.help", { day: resume.day }) }}</span>
        </p>
        <div class="row">
          <button class="primary" @click="emit('resume')">{{ t("home.resume.button") }}</button>
          <button @click="emit('discard')">{{ t("home.resume.discard") }}</button>
        </div>
      </div>

      <label for="name">{{ t("home.name") }}</label>
      <input
        id="name"
        v-model="name"
        maxlength="20"
        autocomplete="nickname"
        :placeholder="t('home.namePlaceholder')"
      />

      <div class="row">
        <button class="primary" :disabled="!canContinue" @click="create">{{ t("home.create") }}</button>
      </div>

      <div class="divider">
        <span>{{ t("home.or") }}</span>
      </div>

      <label for="code">{{ t("home.code") }}</label>
      <div class="row">
        <input
          id="code"
          v-model="code"
          maxlength="12"
          autocapitalize="characters"
          placeholder="ABCDE"
          @keyup.enter="canContinue && normalizedCode && join()"
        />
        <button :disabled="!canContinue || !normalizedCode" @click="join">{{ t("home.join") }}</button>
      </div>

      <p class="muted small">{{ t("common.headphones") }}</p>

      <label for="language">{{ t("home.language") }}</label>
      <select
        id="language"
        :value="locale"
        @change="setLocale(($event.target as HTMLSelectElement).value as Locale)"
      >
        <option v-for="option in LOCALES" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
    </section>
  </main>
</template>

<style scoped>
.home {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: var(--cabin-backdrop);
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
input,
select {
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
.resume {
  margin: 1rem 0 0;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--accent);
  border-radius: 12px;
  background: rgba(243, 167, 18, 0.1);
}
.resume p {
  margin: 0;
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
