# morph.ai

**Architectural Intelligence Engine** — paste a GitHub URL, get a complete technical breakdown of any codebase instantly.

---

## What it does

morph.ai analyzes public GitHub repositories and produces a structured report covering:

- **Overview** — what the project is and who it's for
- **Tech Stack** — every framework, library, and tool detected
- **Architecture** — structural patterns, directory layout, monolith vs. serverless etc.
- **Data Flow Diagram** — auto-generated Mermaid flowchart of how data moves through the system
- **Key Files** — the most important entry points and what they do
- **Notable Patterns** — SSR, form actions, edge functions, optimistic UI, etc.
- **Potential Concerns** — honest observations about gaps or areas for improvement

---

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) — full-stack framework
- [Google Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/) — AI analysis
- [Mermaid](https://mermaid.js.org/) — data flow diagram rendering
- [marked](https://marked.js.org/) — markdown parsing
- [jsPDF](https://github.com/parallax/jsPDF) — PDF export

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/) API key (free tier works)

### Installation

```bash
git clone https://github.com/constantine2003/morph-ai
cd morph-ai
npm install
```

### Environment

Create a `.env` file in the project root:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
```

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Features

### History
Past analyses are saved to `localStorage` (up to 20 entries). Click the **History** button in the nav to browse and restore any previous report instantly — no re-analyzing needed.

### Share Link
The **Share** button in the report toolbar copies a URL with `?repo=` encoded in the query string. Anyone opening that link will have the repo auto-analyzed immediately.

### Retry
Re-run the same repo with one click if Gemini returns a weak or incomplete response.

### Copy Sections
Each section heading (`## Overview`, `## Tech Stack`, etc.) has a small copy icon — click it to copy just that section's markdown to your clipboard.

### Diagram Zoom
Click any Mermaid diagram to open a fullscreen modal with scroll-to-zoom and drag-to-pan.

### Export
Download the report as `.md`, `.pdf`, or `.txt`.

---

## Project Structure

```
src/
├── lib/
│   ├── assets/         # SVG icons
│   └── stores/
│       └── progress.ts # Loading state store
└── routes/
    ├── +layout.svelte  # Root layout
    ├── +page.svelte    # Main UI
    ├── +page.server.ts # GitHub fetch + Gemini API call
    └── layout.css      # Global styles
```

---

## How It Works

1. User pastes a GitHub URL and clicks **Analyze**
2. The server action fetches the repo's README and full file tree via the GitHub API
3. Both are sent to Gemini 2.5 Flash with a structured prompt
4. The response is rendered as markdown with Mermaid diagrams parsed and rendered client-side

GitHub data is fetched without authentication — public repos only. The file tree is capped at 1500 entries and the README at 6000 characters to stay within token limits.

---

## License

MIT
