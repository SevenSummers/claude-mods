# claude-mods

Claude Code mods that add an at-a-glance view above the prompt. They work in the terminal, the VS Code extension and the desktop app.

<img src="blob:https://web.whatsapp.com/dd218e6e-5b9b-48b0-abea-73c17de65d48"/><img width="716" height="198" alt="image" src="https://github.com/user-attachments/assets/b7a23067-16eb-490d-8836-8f02ff40eda3" />



| Mod | What it shows |
| --- | --- |
| `context-bar` | Retro segmented meters on one row for context (`CTX`), five-hour (`5H`) and weekly (`7D`) usage, with token counts and reset countdowns. Each meter is green, then amber at 60% and red at 80%. The usage meters appear on Pro/Max plans once Claude Code has a reading, and `CTX` after the first reply of a session. Context is measured against the model's full window, so auto-compaction may start before 100%. |
| `agent-board` | While sub-agents run, one row per agent: its type, its task, the first line of its latest progress summary, and how long it has been running. Finished agents stay for 15 seconds with ✓ or ✗. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install context-bar --marketplace SevenSummers/claude-mods
/plugin install agent-board --marketplace SevenSummers/claude-mods
```

Or from a shell:

```
claude plugin install context-bar --marketplace SevenSummers/claude-mods
claude plugin install agent-board --marketplace SevenSummers/claude-mods
```

Answer `y` to add the marketplace and choose the user scope, so the mods load in every session.

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, then Add marketplace with `SevenSummers/claude-mods`, then Add plugin.

This repository is private. To install from it, a machine needs a git credential for github.com, such as an SSH key, or `gh auth login` followed by `gh auth setup-git`.
