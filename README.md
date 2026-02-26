# Noodle

A Chrome extension for saving, organizing, and acting on knowledge — highlights from any page, AI-assisted task notes, and a `#project` context system that connects your research to Claude.

**Author:** Diana Valdes · [Unusual Human Studio](https://www.dianavaldes.com)

## About me

I’m **Diana Valdes**, an AI experience product designer with an M.S. in Integrated Design, Business and Technology from the [University of Southern California Iovine & Young Academy](https://iovine-young.usc.edu/). I design, research and build interaction patterns for trustworthy human–AI collaboration. Noodle is one of those experiments—I hope others can take it further.

I write about the intersection of AI, design and the craft of building in my Substack **[The Dinner Party](https://dianafromthedinnerparty.substack.com/)**. I also share findings and a pattern library on my site **[dianavaldes.com](https://www.dianavaldes.com)**.

**If you’re a dev or designer:** follow along, spin up the project, share what you build, and reach out for collabs. I’d love to hear what you think—email me or say hi anytime.

## Features

### Saving & organizing

- **Highlight to save**: Select any text, pick a color from the toolbar, and save it instantly. A visual highlight confirms the save.
- **Three color categories**: Blue (Ideas), Green (Copy), and Coral (Questions) — each with a one-click save. Labels are customizable in Settings.
- **Folders**: Organize snippets into projects or subjects. Create folders from the sidebar (“+”) or when moving a snippet (“+ New Folder” in the folder picker).
- **Unfiled**: Snippets can stay unfiled; filter by “Unfiled” to see them.

### Finding & filtering

- **Filter by color**: Show All or only one category (Ideas, Copy, Questions).
- **Filter by folder**: Dropdown to show All Folders, Unfiled, or a specific folder.
- **Combined filters**: Use color and folder filters together to narrow the list.

### Snippet actions

- **Copy to clipboard**: One-click copy of the snippet text.
- **Move to folder**: Assign a snippet to a folder (or Unfiled) via the folder icon; create a new folder from the picker if needed.
- **Go to source**: Click the favicon/source link to open the original page. The extension scrolls to the snippet and briefly highlights it (flash highlight that fades). Works when opening in a new tab via a special URL hash.
- **Delete**: Remove a snippet from your list.

### Source page & “Go to source”

- **Text anchoring**: Snippets store the selected text plus surrounding context so the extension can find the same spot again on the page.
- **Scroll & flash highlight**: When you use “Go to source,” the page scrolls to the snippet and shows a short-lived highlight, even on dynamic content (with retries for pages like Slack, Teams, Gmail).

### Settings (gear icon in sidebar)

- **Enable on all websites**: Optional permission to run Noodle on any site, not just Claude. Toggle in Settings; Chrome will prompt for permission when you turn it on.
- **Color labels**: Rename the three categories (e.g. Ideas, Copy, Questions) to your own labels.
- **Folders**: View and delete folders. Deleting a folder moves its snippets to Unfiled.

### UI & behavior

- **Floating toggle**: Button in the corner opens the snippets sidebar. Badge shows total snippet count.
- **Draggable toggle**: Drag the toggle to reposition; position is saved and restored.
- **Tooltips**: Hover over color buttons, sidebar controls, and snippet actions for short descriptions.
- **Toasts**: Brief messages for actions like “Copied!”, “Saved to [label]”, “Moved to folder”, “Settings saved”.
- **Relative dates**: Snippets show “Just now”, “5m ago”, “2h ago”, “3d ago”, or a full date.
- **Favicon & URL**: Each snippet remembers the page URL and shows a favicon (with a fallback service when needed).

### Data & persistence

- **Persistent storage**: Snippets, folders, color labels, and toggle position are stored locally and survive browser restarts.
- **Local only**: Data stays in Chrome’s local storage on your machine.

### Task manager

- **Task panel**: A separate view for tasks alongside your snippets. Switch between panels from the sidebar header.
- **Customizable statuses**: Default columns (Todo, In Progress, Done) — add, rename, or reorder your own status labels in Settings.
- **Task editor**: Click any task to open a full editor with a title, notes field, and status picker.
- **Page-linked tasks**: Tasks capture the URL and page title where they were created for context.
- **Task badge**: The toggle shows a count of active (non-done) tasks.

### AI-powered task enhancement

- **Enhance button**: In the task editor, click Enhance — AI reads the task, page context, your notes, and your project snippets to produce sourced bullet points.
- **Source cards**: Each enhanced bullet can show a `*` button. Clicking it reveals a card with the original snippet preview and an "Open →" link that jumps to the matching project folder with the snippet highlighted.
- **Snippet detail view**: Click any snippet in the project folder view to open a focused detail view — full text, color category, folder tag, capture date, source URL, and note.
- **Two-tier mention chips**: Chips you place manually are solid (`#Project`). AI-suggested chips appear dashed with ✓ accept and ✕ dismiss buttons. Accepting a ghost chip promotes it to a solid chip and saves it to your notes.
- **Conditional save**: If your notes contain a `#` chip, the original notes (including your chip) are always preserved on save. If there are no chips, the enhanced content overrides.

### `#` as a universal context primitive

- **Seed mode** (task editor notes): Type `#` in the notes field to open a folder dropdown. Selecting a folder embeds a chip that seeds the AI with that folder’s snippets when you click Enhance.
- **Call mode** (AI chat): Type `#` in the chat input to open the same folder dropdown. Selecting a folder attaches it as context for that message. A pill row below your message shows which folders were called.

### AI chat

- **Ask about your snippets**: Open the AI chat panel and ask questions — Noodle surfaces relevant snippets from your folders as context.
- **Research mode**: Toggle research mode to enable multi-step web search via Tavily. Claude searches iteratively and returns an answer with inline web citations.
- **Context pills**: `#folder` chips you add to a message appear as labeled pills in the chat history so you can see exactly what context shaped each answer.

### rū MCP integration

- **Automatic sync**: Noodle pushes all folders and snippets to the [rū MCP server](https://github.com/unsualhumanstudio/ru) on every save and on extension load.
- **`#tag` in Claude Code**: With the `auto_context` prompt active in rū, typing `#ProjectName` in any Claude Code conversation automatically calls `get_noodle_context` — surfacing your Noodle snippets alongside Obsidian notes before Claude responds.
- **Graceful degradation**: If rū isn’t running, Noodle continues working normally with no errors.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select the folder containing this extension.

## Usage

### Saving snippets
1. Go to [claude.ai](https://claude.ai) (or any site if you’ve enabled “Enable on all websites” in Settings).
2. Highlight any text you want to save (at least 3 characters).
3. Use the toolbar that appears — click a color to save (hover for the label).
4. Click the floating toggle (bottom right by default) to open your snippets.
5. Use the color and folder filters to find snippets.
6. Use copy, folder, “Go to source,” or delete on each snippet as needed.

### Tasks
1. Switch to the Tasks panel from the sidebar header.
2. Create a task — it captures the current page as context.
3. Click a task to open the editor. Add notes and set a status.
4. Type `#` in the notes field to attach a project folder as context.
5. Click **Enhance** — AI generates sourced bullet points using your notes, page, and project snippets.

### AI chat
1. Open the AI chat panel from the sidebar.
2. Ask a question — type `#FolderName` to attach a project as context before sending.
3. Toggle research mode (web icon) to enable multi-step Tavily web search.

### rū MCP integration
1. Install and run [rū](https://github.com/unsualhumanstudio/ru).
2. Reload the Noodle extension — all your folders and snippets sync to rū automatically.
3. In Claude Code, type `#ProjectName` in any message — rū surfaces your Noodle context alongside Obsidian.

## Project structure

```
├── manifest.json       # Extension configuration
├── DESIGN_SYSTEM.md    # Styling, color palette, and design tokens
├── src/
│   ├── background.js   # Permissions, all-sites injection, AI API proxy (streaming + research), task enhancement, rū sync
│   ├── content.js      # All UI: snippets, folders, tasks, task editor, AI chat, enhanced view, # mention system
│   └── styles.css      # All styles
├── icons/              # Extension icons (16, 48, 128)
├── generate-icons.html # Icon generation helper
└── generate-icons.js
```

## Design system

Styling, color palette, typography, spacing, and component rules are documented in **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)**. Use it when adding or changing UI so the extension stays consistent (e.g. use the defined CSS variables for highlight colors, neutrals, shadows, and z-index layers).

## Development

1. Edit the source files in `src/`.
2. In Chrome, go to `chrome://extensions/`.
3. Click the refresh icon on the Noodle card.
4. Reload any tabs where you use the extension (e.g. claude.ai).

## License

MIT. Copyright © 2025 Diana Valdes (Unusual Human Studio). See [LICENSE](./LICENSE) for full terms.
