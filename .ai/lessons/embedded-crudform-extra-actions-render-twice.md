---
title: "An embedded CrudForm renders extraActions twice; close a dialog form with the dialog, not a Cancel extra action"
modules: ["platform", "communication"]
areas: ["backend-ui"]
topics: ["crud-form", "dialog", "embedded", "member-pages"]
---

# An embedded CrudForm renders extraActions twice; close a dialog form with the dialog, not a Cancel extra action

**Context**: #102 (E06-S20) embedded the announcement composer (`CrudForm embedded`) in the member inbox's "New announcement" dialog with a "Cancel" button passed as `extraActions`. The browser snapshot of the integration test showed two "Cancel" buttons, one above and one below the form.

**Problem**: In `@open-mercato/ui` 0.9.0 an embedded `CrudForm` renders `extraActions` in its top action row and again in its footer (`FormFooter`); `cancelHref` is ignored when embedded, so the footer has no cancel of its own. A dialog host that adds Cancel as an extra action gets it twice.

**Rule**: Inside a `Dialog`, pass no Cancel through `extraActions`; the dialog's close button and Escape cancel. Also leave `DialogContent` its own height and scroll (it caps at 90 vh and scrolls), so no arbitrary `max-h-[…]` class is needed (`ds:check` rejects one).

**Applies to**: any `CrudForm embedded` in a `Dialog` (`communication/components/ThreadComposer.tsx` in `ClubMessagesPage.tsx`), `extraActions`, `DialogContent` classes.
