---
title: "A metadata stripper walks the whole image file and stops at its end marker"
modules: ["activities", "platform"]
areas: ["module-data", "testing"]
topics: ["image-metadata", "exif", "jpeg", "privacy"]
---

# A metadata stripper walks the whole image file and stops at its end marker

**Context**: The first `stripImageMetadata` in `@vereino/core` (#872, PR #897) filtered the JPEG segments up to the first start of scan and then copied the rest of the file unchanged. Its tests used hand-built JPEGs that end exactly at the end-of-image marker, so they passed. Review found that real phone files carry more after that marker: Google/Samsung Motion Photos append an MP4 clip (audio and a GPS atom), Ultra HDR and MPF files append secondary JPEGs with their own EXIF and XMP, and Samsung appends an SEFT trailer. Progressive JPEGs can also hold APPn or COM segments between scans. All of it would have reached storage and, once a picture was public, any guest.

**Problem**: A stripper that copies the "image data" as one opaque tail trusts the part of the file that phones use to hide extra payloads. Fixtures built in code show only the layout their author had in mind.

**Rule**: A metadata stripper parses the format to its terminator and copies only what it recognises. For a JPEG, it skips entropy-coded data (`FF00` and `FFD0`–`FFD7` are data), filters every later segment with the same keep rule, stops at `FFD9` and drops everything after it, and refuses a file with no end of image. For a PNG, it stops at `IEND`. For a WebP, it stops at the RIFF length. Its tests include a payload appended after the terminator and a metadata segment after the first scan, and they assert that a `SECRET` marker never survives.

**Applies to**: `packages/core/src/image-metadata.ts` and its TEST-I04 tests; any later upload path that strips or sanitises user files (people photos, documents).
