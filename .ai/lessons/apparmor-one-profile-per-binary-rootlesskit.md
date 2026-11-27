---
title: "Write an AppArmor profile for a shared binary only when no other profile attaches to it"
modules: ["platform"]
areas: ["architecture", "debugging"]
topics: ["apparmor", "rootless-docker", "self-hosted-runners"]
---

# Write an AppArmor profile for a shared binary only when no other profile attaches to it

**Context**: `scripts/ci-runner-setup.sh` (#834) wrote `vereino-ci-rootlesskit`, a profile attached to `/usr/bin/rootlesskit` that allows user namespaces. Making the script build several runner instances (one per repository, PR #835) would have written one such profile per instance, and the factory server's Ubuntu already ships `/etc/apparmor.d/rootlesskit` for the same path (checked 2026-11-26).

**Problem**: AppArmor attaches profiles by executable path. Two profiles for the same path are a conflicting attachment, so a per-instance (or per-tool) profile for a machine-wide binary breaks the very program it was meant to allow, and the failure shows up only at exec time on the server.

**Rule**: A setup script that allows a machine-wide binary through AppArmor first looks for any other profile in `/etc/apparmor.d` attaching to that path (the distribution's or another instance's) and writes its own only when there is none; it removes its own stale copy when one appeared later. Per-user paths (e.g. browsers under one runner user's home) may keep per-instance profiles.

**Applies to**: `scripts/ci-runner-setup.sh` (`write_apparmor_profiles`, `rootlesskit_profile_elsewhere`), any future ops script that writes AppArmor profiles.
