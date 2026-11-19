---
title: "Reset dialog state while rendering, not in an effect, and give void handlers braces"
modules: ["club_core"]
areas: ["backend-ui"]
topics: ["eslint", "react-hooks", "dialog-state"]
---

# Reset dialog state while rendering, not in an effect, and give void handlers braces

**Context**: #377 (`club_core/components/useAddExternalPlace.ts`): the first `yarn verify` failed at `lint` with six errors in new components — `react-hooks` "Calling setState synchronously within an effect can trigger cascading renders" for a `useEffect(() => { if (open) setName(initialName) }, [open, initialName])`, and `@typescript-eslint/no-confusing-void-expression` for `onClick={() => state.close(false)}` and `onChange={(e) => state.setName(e.target.value)}`.

**Problem**: Typecheck and the unit tests pass, so these surface only in the lint step of the gate, after a long build; `yarn format` then also reflows the edited files, costing another resume.

**Rule**: To reset a field when a dialog or sheet opens, adjust state during render with a previous-value state (`const [wasOpen, setWasOpen] = useState(open); if (open !== wasOpen) { setWasOpen(open); if (open) setName(initialName) }`) or reset in the close handler — never `setState` inside `useEffect`. Write event handlers that call a void function with braces (`onClick={() => { close(false) }}`). Run `npx eslint <changed files>` and `yarn format` before the first `yarn verify`.

**Applies to**: Every client component and hook under `packages/app/src/modules/*/components/` and `packages/ui/src/`.
