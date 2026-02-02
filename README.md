# Noodle

A Chrome extension that lets you highlight and save snippets from your Claude conversations (or any website) without breaking your flow.

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

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select the folder containing this extension.

## Usage

1. Go to [claude.ai](https://claude.ai) (or any site if you’ve enabled “Enable on all websites” in Settings).
2. Highlight any text you want to save (at least 3 characters).
3. Use the toolbar that appears — click a color to save (hover for the label).
4. Click the floating toggle (bottom right by default) to open your snippets.
5. Use the color and folder filters to find snippets.
6. Use copy, folder, “Go to source,” or delete on each snippet as needed.
7. Click **Settings** to turn on all-website mode, customize color labels, or manage folders.

## Project structure

```
├── manifest.json       # Extension configuration
├── DESIGN_SYSTEM.md    # Styling, color palette, and design tokens (see below)
├── src/
│   ├── background.js   # Permissions, all-sites injection
│   ├── content.js      # Main extension logic (highlights, sidebar, storage)
│   └── styles.css      # UI styles
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

Built with 🧡 & [Claude](https://claude.ai) in Cursor.

## License

MIT. Copyright © 2025 Diana Valdes (Unusual Human Studio). See [LICENSE](./LICENSE) for full terms.
