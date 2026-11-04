# Game Design

## Phases

```
LOBBY -> ROLE_REVEAL -> NIGHT (ordered steps) -> DAWN -> DAY_DISCUSSION
      -> DAY_VOTE -> ELIMINATION -> victory check -> NIGHT ... -> GAME_OVER
```

## Rules

- **Night**: everyone "goes to sleep" (the screen goes dark). The narrator
  wakes each role in order. Werewolves choose a victim together, the Seer
  inspects one player, the Doctor protects one. Actions resolve at dawn.
- **Day**: everyone alive discusses, then votes. Plurality eliminates; a tie
  means no elimination (configurable). Whether the role of the dead is
  revealed is configurable.
- **Victory**: villagers win when all werewolves are dead. Werewolves win when
  they are at least as many as the others.

## Roles

First release: Werewolf, Villager, Seer, Doctor. Planned later: Hunter,
Medium, Bodyguard, Possessed, Mason, Hamster werewolf, Thief. Roles are
plugins and their night order is data driven. Presets per player count live in
[`content/`](../../content).

## Narrator modes

1. **Human narrator**: one player narrates and hosts. They see everything and
   drive the phases.
2. **Automatic narrator**: the game drives the phases with prompts (text and
   subtitles first, voice later). The host is also a player.

## Voice rules

| Phase | Who hears whom |
|---|---|
| Night | Only the roles currently awake; werewolves hear only werewolves |
| Day | Everyone alive hears everyone alive |
| Dead | Ghost channel the living cannot hear (or muted, configurable) |
