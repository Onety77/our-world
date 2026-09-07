# Where the artwork comes from

Source material, kept for good and **never served to a browser**.

`public/` is not a folder of project files — every byte in it is copied into
`dist/` and deployed. These four images were sitting in there and nothing had
ever referenced them: the icon master at a megabyte and a half, and three logo
proposals at about three more. Four and a third megabytes on every deploy, for
files no page has ever asked for.

They are worth keeping — the proposals carry the prompts that made them, and
the master is what the icons were cut from — so they moved here rather than
being deleted. This folder is not part of the build.

- `garden-icon-master.png` — the full-size original. `public/icons/*` were cut
  from it, and are the ones the browser and the home screen actually use.
- `logos/` — the three proposals, and `logos/README.md` for which was chosen
  and why.

**If you add artwork, it goes here unless a page loads it.**
