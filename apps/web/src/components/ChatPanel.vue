<script setup lang="ts">
import type { ChatMessage } from "@lupus/net";
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n.ts";

const props = defineProps<{
  messages: ChatMessage[];
  nameOf: (id: string) => string;
  /** Who will read what you write, e.g. "Everyone". */
  audience: string;
  disabled?: boolean;
  disabledReason?: string;
}>();
const emit = defineEmits<{ send: [text: string] }>();

const text = ref("");
const list = ref<HTMLElement | null>(null);

function send(): void {
  const value = text.value.trim();
  if (!value || props.disabled) return;
  emit("send", value);
  text.value = "";
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (list.value) list.value.scrollTop = list.value.scrollHeight;
  },
);
</script>

<template>
  <section class="chat" :aria-label="t('chat.title')">
    <p class="audience muted">💬 {{ audience }}</p>
    <ul ref="list" class="messages" aria-live="polite">
      <li v-for="message in messages.slice(-30)" :key="message.id">
        <strong>{{ nameOf(message.from) }}</strong
        >: {{ message.text }}
      </li>
    </ul>
    <form class="compose" @submit.prevent="send">
      <input
        v-model="text"
        maxlength="200"
        :disabled="disabled"
        :placeholder="disabled ? (disabledReason ?? '') : t('chat.placeholder')"
        :aria-label="t('chat.placeholder')"
      />
      <button type="submit" :disabled="disabled || !text.trim()">{{ t("chat.send") }}</button>
    </form>
  </section>
</template>

<style scoped>
.chat {
  display: grid;
  gap: 0.4rem;
}
.audience {
  margin: 0;
  font-size: 0.8rem;
}
.messages {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 7rem;
  overflow-y: auto;
  font-size: 0.9rem;
}
.messages li {
  padding: 0.1rem 0;
  overflow-wrap: anywhere;
}
.compose {
  display: flex;
  gap: 0.4rem;
}
.compose input {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.6rem;
}
</style>
