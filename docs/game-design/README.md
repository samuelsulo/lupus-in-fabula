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
  The werewolves talk it over (voice) and their step ends only when the whole
  pack points at the same player; if the timer runs out first, the most voted
  player is killed (ties broken at random).
- **Voting**: by name in the list or by clicking the person in the room. By
  default votes are open (everyone sees who votes for whom, live); the result
  always lists them.
- **Day**: everyone alive discusses, then votes. Plurality eliminates; a tie
  means no elimination (configurable). Whether the role of the dead is
  revealed is configurable.
- **Victory**: villagers win when all werewolves are dead. Werewolves win when
  they are at least as many as the others.

## Roles

Available: Werewolf, Villager, Seer, Doctor, Hunter, Bodyguard. Planned later:
Medium (only meaningful once roles are no longer revealed on death), Possessed,
Mason, Hamster werewolf, Thief.

- **Hunter**: when killed (at night or by vote) takes a last shot at a living
  player, then the game goes on. The game cannot end before the shot is fired.
- **Bodyguard**: each night guards another player. If the werewolves strike
  them, the bodyguard dies instead. The Doctor's protection still wins over it. Roles are
  plugins and their night order is data driven. Presets per player count live in
  [`content/`](../../content).

## Narrator modes

1. **Human narrator**: one player narrates and hosts. They see everything and
   drive the phases.
2. **Automatic narrator**: the game drives the phases with prompts (text and
   subtitles first, voice later). The host is also a player.

The host picks the mode in the lobby. A human narrator can be any person in
the room (the host included) and takes no seat in the game, so 4 to 10 other
players are needed. With a human narrator there are no timers: steps, the
discussion and the vote last until the narrator presses "Next". The narrator
sees every role and every night choice.

## Role setup

By default the game deals the roles at random when it starts, from a preset for
the number of players ([`content/`](../../content)). With a human narrator, the
narrator can instead pick "I choose who plays what" in the lobby: the game deals
a valid starting set, and the narrator can change any player's role or deal
again. Only the narrator sees the assignment; everybody else just sees that the
narrator is choosing. The host cannot start until the setup is valid:

- every player has a role;
- at least one werewolf, and fewer than half of the players (4 players: 1, 5-6: 2,
  7-8: 3, 9-10: 4), so the game does not start already decided;
- Seer, Doctor, Hunter and Bodyguard at most once each. Villagers have no limit.

Without a human narrator the roles are always random, because anyone who could
see the assignment would be playing with it.

## Walking around

While the village is awake (not at night, not once the game is over) a
player can stand up, walk around the cabin and sit on any free seat. At night
everyone is seated again automatically. A human narrator walks too, at any
time (the others cannot see them at night) but never sits. Positions are cosmetic: they never
affect voice or the rules. The host keeps the single source of truth for who
sits where.

## Chat

Text chat follows the voice rules below: you can only write to the people who
could hear you, so the werewolves can whisper in writing at night and the dead
have their own channel. In the lobby everybody chats together.

## Sound and narration

The cabin has ambient sound (fire, crickets and a howl at night, synthesised
in the browser). In automatic mode each client reads the narrator lines with
the browser's speech synthesis; a role is woken only on the screen of the
player who owns it, so nothing leaks. Both can be switched off.

## Reading the game at a glance

Everybody should always know where the game is, what is expected of them and
what happened:

- A **title** with an icon and a colour per phase (night is indigo, the vote is
  red, and so on).
- Under it, a **single line** of what to do now, for this player: asleep,
  awake with a role, voting (and what they voted), dead, or waiting. The
  narrator gets the next step of the story instead.
- A **banner** on every change of scene with what just happened (who died,
  the result of the vote).
- A **role card** at the start with the team goal, when the role acts and how.
  The same text stays in the role panel.
- A **vote board** during the vote: a tally per person and a line per voter
  (who voted for whom, who has not voted). Votes are open by default.

## Phones

The game screen fills the screen and never scrolls. On a touch device held
upright it asks the player to turn the phone sideways (the game keeps running
meanwhile). On small screens the panels fold away so the 3D room is visible:
the role is a small tab, and the chat, microphone, sound and walking controls
are icons in the top bar. The prompt to vote or act stays at the bottom.

## Languages

English and Italian, picked on the home screen (browser language by default).

### If the narrator leaves

The game never stops for it:

- If somebody is dead, one of the dead (chosen at random) becomes the narrator.
  They stop being a ghost player, see every role and night choice, and walk the
  room like a narrator. A dead hunter who has yet to fire is never picked.
- If nobody is dead, the automatic narrator takes over (timers, spoken lines).
  As soon as somebody dies, that player becomes the narrator.

Everybody sees a line in the log saying what happened.

### If the host leaves

See [architecture](../architecture/README.md#when-the-host-leaves): the host can
resume the game after a reload, and a human narrator takes over otherwise.

## Setting

Everyone sits in a log-cabin living room around a fireplace, on sofas,
armchairs, chairs and a stool. Seats are assigned in lobby order and are the
same on every client. By day the room is lit through the windows, at night
only by the fire and the lamps, and everyone bows their head.

## Voice rules

| Phase | Who hears whom                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Night | Only the roles currently awake; werewolves hear only werewolves. With a human narrator, the awake roles and the narrator hear each other (a whisper channel) |
| Day   | Everyone alive hears everyone alive; the narrator hears and is heard by all                                                                                  |
| Dead  | Ghost channel: the dead talk to each other, day and night; the living cannot hear them (the narrator can)                                                    |
