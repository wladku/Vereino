---
title: "A job run through the CLI cannot see the test gateway's sessions; check the booking in the server process, and register every new command"
modules: ["payments", "platform"]
areas: ["testing", "module-data"]
topics: ["integration-tests", "cli", "payment-gateways", "job-commands", "register-command"]
---

# A job run through the CLI cannot see the test gateway's sessions; check the booking in the server process, and register every new command

**Context**: #301 drove the four scheduled `payments` jobs through `mercato payments run-job --now` in TEST-C14. The checkout sweep run that way booked nothing, although the provider had "captured" the checkout. A second run then failed with `Command handler not registered for id payments.order_campaigns.close_due`: the handler was defined but its `registerCommand(...)` line was missing, and typecheck cannot catch that.

**Problem**: The gateway test adapter (`payments/services/test-gateway.ts`) keeps its sessions in the memory of the process that created them, so the web server holds them. A `mercato` CLI process starts with an empty adapter, and a capture set by webhook is invisible to it. A command handler that is never registered compiles fine and fails only at the first `commandBus.execute`.

**Rule**: In an integration test, run a job command through the CLI to prove it is wired and scoped. Assert gateway-dependent effects (capture, refund) in the server process, through the refresh or webhook routes. Each new `CommandHandler` constant needs its `registerCommand(...)` line, and an integration test must execute every new command id at least once.

**Applies to**: `packages/app/.ai/qa/tests/**` tests that call `mercato(...)` for payments jobs; `payments/commands/*.ts`; any module adding job commands.
