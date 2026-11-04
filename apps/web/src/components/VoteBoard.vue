<script setup lang="ts">
import { computed } from "vue";
import { t } from "../i18n.ts";

const props = defineProps<{
  /** The people who can vote (the living). */
  voters: { id: string; name: string }[];
  /** voter id -> target id (null abstains). Empty when votes are secret. */
  votes: Record<string, string | null>;
  nameOf: (id: string) => string;
  secret: boolean;
  /** Small screens: only the per-person list, which is what the narrator needs. */
  compact?: boolean;
}>();

const rows = computed(() =>
  props.voters.map((voter) => {
    const voted = voter.id in props.votes;
    const target = props.votes[voter.id] ?? null;
    return { id: voter.id, name: voter.name, voted, target: target ? props.nameOf(target) : null };
  }),
);

/** Votes per person, most voted first: the one at the top is who the village is about to eliminate. */
const tally = computed(() => {
  const counts = new Map<string, number>();
  for (const target of Object.values(props.votes)) {
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, name: props.nameOf(id), count }));
});
const top = computed(() => tally.value[0]?.count ?? 0);
</script>

<template>
  <section class="board panel" aria-live="polite">
    <h3>🗳️ {{ t("votes.title") }}</h3>
    <p v-if="secret" class="muted small">{{ t("votes.secret") }}</p>
    <template v-else>
      <ul v-if="tally.length && !compact" class="tally">
        <li v-for="entry in tally" :key="entry.id" :class="{ lead: entry.count === top }">
          <span class="who">{{ entry.name }}</span>
          <span class="bar" :style="{ width: `${(entry.count / Math.max(top, 1)) * 100}%` }" />
          <strong>{{ entry.count }}</strong>
        </li>
      </ul>
      <ul class="rows">
        <li v-for="row in rows" :key="row.id" :class="{ waiting: !row.voted }">
          <span class="who">{{ row.name }}</span>
          <span v-if="!row.voted" class="muted">… {{ t("votes.waiting") }}</span>
          <span v-else-if="row.target"
            >→ <strong>{{ row.target }}</strong></span
          >
          <span v-else class="muted">{{ t("votes.abstains") }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.board {
  padding: 0.6rem 0.8rem;
  width: 100%;
  max-height: 100%;
  overflow: auto;
}
h3 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.tally {
  margin-bottom: 0.5rem;
  display: grid;
  gap: 0.25rem;
}
.tally li {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.15rem 0.4rem;
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.9rem;
}
.tally .bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(240, 180, 110, 0.22);
  z-index: 0;
}
.tally .lead .bar {
  background: rgba(238, 106, 66, 0.45);
}
.tally .who,
.tally strong {
  position: relative;
  z-index: 1;
}
.rows li {
  display: flex;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding: 0.1rem 0;
}
.rows .who {
  min-width: 5.5em;
  font-weight: 600;
}
.rows .waiting .who {
  opacity: 0.7;
}
</style>
