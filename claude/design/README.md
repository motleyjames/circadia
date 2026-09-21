# Design references

Source files for the Circadia Clinician Console canvas. Reference only: they are not
served, not built, and not part of the app.

Each is a self-contained Design Component page with inline styles and a small render
script. Implement FROM them: take the palette, type, spacing, copy and structure, and
translate into the app's own React and Tailwind conventions. Do not copy the runtime,
the {{hole}} syntax, or the data-props block.

- Shakedown.dc.html  the shakedown console home (build now)
- Invite.dc.html     invite a tester (build now)
- Main.dc.html       clinic triage queue (Phase B, not yet)
- Patient.dc.html    tester or patient detail with the 14-night raster (next)
- Phone.dc.html      the patient app's Tonight screen (after a screenshot audit)

All figures are sample data. Names are fictional.
