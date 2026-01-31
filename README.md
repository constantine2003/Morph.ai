# Morph.ai — Generative Repository Architect 

**Damn, SvelteKit is awesome.** Morph.ai is a high-performance intelligence engine that transforms complex GitHub URLs into structured architectural reports and visual diagrams. 

Built with **SvelteKit**, **Tailwind CSS v4**, and **Google Gemini**, this project focuses on high-availability AI and strict data integrity.

---

##  Key Features

* **Architectural Visualization:** Automatically generates [Mermaid.js](https://mermaid.js.org/) diagrams of your repository structure.
* **Anti-Hallucination Logic:** Implements strict system constraints to ensure the AI doesn't "guess" the contents of private repositories.
* **Model Failover System:** A robust backend that automatically hot-swaps between Gemini models (2.0 Flash, 2.0 Flash-Lite, 1.5 Flash) if API rate limits are reached.
* **Multi-Format Export:** Download your architectural reports in PDF, Markdown, or Plain Text.

---

##  Tech Stack

* **Frontend:** SvelteKit (Progressive Enhancement with Actions)
* **Styling:** Tailwind CSS v4
* **Intelligence:** Google Gemini API (2.0 Flash & 1.5 Flash)
* **Diagrams:** Mermaid.js
* **Environment:** Node.js / Vite

---

##  The "Smart" Logic: How it Works

Morph.ai isn't just a wrapper. It uses a **Hierarchical Model Failover** strategy to ensure the app stays alive even on a free-tier API:

1.  **Request:** User inputs a GitHub URL.
2.  **Attempt 1:** Primary Model (`Gemini 2.0 Flash`) analyzes the structure.
3.  **Failover:** If a `429 Quota Exceeded` error is detected, the engine instantly switches to `Gemini 1.5 Flash`.
4.  **Integrity Check:** The "Strict Architect" persona prevents the model from hallucinating data if the repository is private or inaccessible.
