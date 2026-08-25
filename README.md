# Calendar

A study planner, to-do list and session timer in one page. No build step, no backend, no account — plain HTML, CSS and JavaScript, with everything saved in your browser's local storage.

## Put it online

1. Make a new GitHub repository and push these files to the root of it:

   ```bash
   git init
   git add .
   git commit -m "Calendar"
   git branch -M main
   git remote add origin https://github.com/<you>/calendar.git
   git push -u origin main
   ```

2. Go to vercel.com → **Add New → Project** → import the repo.
3. Leave every build setting empty. Framework preset: **Other**. Build command: none. Output directory: none.
4. Deploy.

There is nothing to configure. To work on it locally, open `index.html` in a browser, or run `python3 -m http.server` in this folder.

## Where your data lives

In `localStorage`, under the key `calendar.v1`, in the browser you are using. That means:

- It survives refreshes and redeploys.
- It does **not** follow you to another device or another browser.
- Clearing site data wipes it.

Setup → Your data has **Export backup** and **Restore backup**. Use them.

## Getting started

Setup has a **format guide**. Copy it, paste it into Claude along with your timetable, exam schedule or deadline list in whatever messy form you have it, and paste the CSV that comes back into the import box.

Or press **Load a sample** to fill the app with fake data and click around first. Setup → Your data → Delete everything clears it out afterwards.

## The import format

One record per line. First column is the record type. Quote any field containing a comma.

| Type | Columns |
|---|---|
| `SUBJECT` | name, color |
| `CLASS` | subject, day, start, end, room |
| `EXAM` | subject, title, date, kind, notes |
| `TODO` | subject, title, due, link, description |

- `day` — Mon…Sun. `start` / `end` — 24-hour `HH:MM`.
- `date` / `due` — `YYYY-MM-DD` (or `DD/MM/YYYY`).
- `kind` — `exam`, `test`, `ia` or `deadline`.
- Subjects mentioned anywhere are created automatically, so `SUBJECT` lines are only needed to fix colours.

```
SUBJECT,Physics HL,#5b8def
CLASS,Physics HL,Mon,08:30,09:45,Lab 2
EXAM,Physics HL,IA final draft,2026-09-30,ia,"2200 words, full error analysis"
TODO,Maths AA HL,Exercise 7C q1-14,2026-09-02,,
```

## What's in it

**Dashboard** — today's date, a countdown ticket for every upcoming exam and deadline, today and tomorrow side by side, and the to-do list pinned to the right. Today has a green start button and a plan button; tomorrow has a plan button. Personal plans are deliberately kept off this page — school and study only.

**Study** — a grid ruled in 5-minute steps, one to ten hours tall. Drag on empty space to block out time; drag a block to move it or its edges to resize. Each block takes a subject, a title, detail, links and any number of check-ins, and can be pulled straight from a to-do. Schedule coffee and lunch breaks; they are excluded from studied time. Press start and a red line tracks the present moment down the grid — blocks it has passed lock, everything ahead stays editable. Studied, to-go, planned and current-block figures update every second, and the floating **PiP** panel opens automatically when you press start (Chrome and Edge), showing an H:M:S countdown for the block you are in and an H:M:S count-up of total time studied. Turn that off in Setup → Preferences, or reopen it with **Pop out**.

**To-dos** — grouped by subject and colour-coded, with links and notes. Subject and due date are picked with tappable buttons rather than dropdowns: subject buttons carry the subject's colour, date buttons stay neutral, and **Pick a date** expands a date field that is otherwise hidden. Due dates can be **next class** or **the class after that**, calculated from your timetable, and the button tells you which day that lands on.

**Calendar** — the one page that shows everything: classes from your timetable, deadlines, study sessions, tasks due, personal plans, and the hours actually studied on each day. Toggle any of those five layers off with the filter buttons. Click a day to open it in full, or add a plan straight from there. **Plans** are personal reminders — dentist, football, whatever — and they live here only.

**Analytics** — hours by time of day, by weekday, by week and across the last fortnight; a subject split; progress against your weekly target with the pace needed to hit it; and a set of written observations about when and how consistently you actually work. The 40-hour target is adjustable in Setup.

**Setup** — appearance, imports, the format guide, the weekly timetable, deadlines, preferences, and selective or total data deletion. Tap a subject's swatch to open its colour ways: an 18-colour grid, a native picker, and a hex field if you want something exact.

## Appearance

Seven UI schemes — Night, Ocean, Plum, Forest, Mono, Paper, Linen — under Setup → Appearance. The ◐ button in the top bar cycles them without opening Setup. Any scheme's accent can be overridden with your own colour, and the choice carries into the floating PiP window too.

Type is Bricolage Grotesque for headings, Karla for everything else, and IBM Plex Mono wherever a number is a time.

## Files

```
index.html          shell and script tags
styles.css          all styling, both themes
js/store.js         state, persistence, time maths, CSV parser
js/ui.js            element builder, modals, toasts
js/dashboard.js     landing page
js/todos.js         to-do list, editor, next-class due dates
js/session.js       the 5-minute grid, live timer, PiP
js/calendarview.js  month view, personal plans, day sheet
js/analytics.js     charts and observations
js/settings.js      setup, imports, format guide, data control
js/app.js           routing and the one-second heartbeat
```

Scripts are plain classic scripts sharing one global scope — no modules, no bundler. Add a file, add a `<script>` tag, done.
