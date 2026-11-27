# Security

## Reporting a vulnerability

Please do not open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/whosdrix/skilltrial/security/advisories/new) instead, and you will get a reply within a few days.

## What skilltrial runs on your machine

skilltrial runs a coding agent many times without anyone watching, so it gives the agent full permissions (`--dangerously-skip-permissions` for Claude Code). Each run happens in a fresh temporary folder, but that is not a sandbox: the agent can still read your home directory, use the network and run any command your user can.

- Only benchmark skills you have read. A skill is instructions to an agent with full permissions.
- For untrusted skills or tasks, run skilltrial inside a container or a throwaway VM.
- `run` checks and `setup` commands in the task file are plain shell commands. Treat a task file like a script.
- Claude Code is started with `--setting-sources project,local`, so your user settings, hooks and permission rules are not loaded during a trial.
