import { GoogleGenerativeAI } from "@google/generative-ai";
import { GOOGLE_API_KEY } from '$env/static/private';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

const ANALYSIS_PROMPT = (repoUrl: string, readme: string, fileTree: string) => `
You are an elite software architect producing a structured technical intelligence report.

Repository: ${repoUrl}

README:
${readme || 'No README found.'}

File Tree:
${fileTree || 'No file tree available.'}

---

Produce a comprehensive markdown report with the following EXACT sections. Use the headings as written:

## 🧠 Overview
2-3 sentences on what this project does and who it's for. Be specific, not generic.

## ⚙️ Tech Stack
List the key languages, frameworks, libraries, and tools detected. Use bullet points. Include version numbers if visible in the file tree (e.g., package.json paths).

## 🏗️ Architecture
Describe the high-level architecture. Is it monolithic, microservices, serverless, MVC, etc.? How is the code organized? Reference specific directories from the file tree.

## 🔄 Data Flow Diagram
Produce a Mermaid flowchart showing how data moves through the system (user → frontend → backend → DB, etc.). Use realistic node names from the repo. Keep it to 8-12 nodes max.

Use this exact format:
\`\`\`mermaid
flowchart LR
    ...
\`\`\`

## 📁 Key Files & Entry Points
Bullet list of the most important files and what they do. Reference actual paths from the file tree.

## 🔐 Notable Patterns
List 3-5 architectural or code patterns you observe (e.g., server-side rendering, form actions, edge functions, optimistic UI, etc.).

## ⚠️ Potential Concerns
List 2-4 honest observations about potential issues, missing patterns, or areas for improvement. Do not invent issues — only flag what you can infer from the structure.

---

Rules:
- Do NOT speculate beyond the README and file tree.
- If the repo is private/empty/inaccessible, state this clearly and stop.
- Mermaid STRICT RULES: Only use flowchart LR as the diagram type. Node IDs must be plain alphanumeric only (e.g. A, B, nodeA, db1). Node labels go in square brackets ONLY like A[Label Text]. NEVER use parentheses for node shapes. NEVER use double quotes inside labels. NEVER use special characters (colons, slashes, angle brackets, apostrophes) in labels. Keep to 8 nodes max. Valid example: Browser[User Browser] --> API[REST API] --> DB[Database].
- Be concise and technical. This report is for developers.
`;

export const actions = {
    analyzeRepo: async ({ request }) => {
        const formData = await request.formData();
        const repoUrl = formData.get('repoUrl')?.toString()?.trim();

        if (!repoUrl) return fail(400, { error: "Repository URL is required." });

        // Validate URL format loosely
        if (!repoUrl.startsWith('http')) {
            return fail(400, { error: "Please enter a valid URL starting with http:// or https://" });
        }

        let readme = '';
        let fileTree = '';

        const githubMatch = repoUrl.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/\s?#]+)/);
        if (githubMatch) {
            const owner = githubMatch[1];
            const repo = githubMatch[2].replace(/\.git$/, '');

            try {
                // Fetch README — try multiple common filenames
                for (const readmeName of ['README.md', 'readme.md', 'README.txt', 'README']) {
                    const res = await fetch(
                        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${readmeName}`,
                        { headers: { 'User-Agent': 'MorphAI/1.0' } }
                    );
                    if (res.ok) {
                        readme = await res.text();
                        break;
                    }
                }

                // Fetch file tree
                const treeRes = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
                    { headers: { 'User-Agent': 'MorphAI/1.0' } }
                );
                if (treeRes.ok) {
                    const treeJson = await treeRes.json();
                    if (treeJson.tree) {
                        // Filter to only blob (file) entries, sort, and limit
                        fileTree = treeJson.tree
                            .filter((item: any) => item.type === 'blob')
                            .map((item: any) => item.path)
                            .slice(0, 1500)
                            .join('\n');
                    } else if (treeJson.message) {
                        // GitHub API error (e.g., "Git Repository is empty.")
                        return fail(400, { error: `GitHub API: ${treeJson.message}` });
                    }
                }
            } catch (err) {
                // Network error fetching from GitHub — continue with empty data
                console.warn('GitHub fetch failed:', err);
            }
        }

        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    temperature: 0.4, // Lower temp = less hallucination
                    maxOutputTokens: 4096,
                }
            });

            const prompt = ANALYSIS_PROMPT(
                repoUrl,
                readme.substring(0, 6000),
                fileTree.substring(0, 6000)
            );

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            if (!text || text.trim().length < 50) {
                return fail(500, { error: "The AI returned an empty response. Please try again." });
            }

            return {
                success: true,
                analysis: text,
                repoUrl,
                hasGitHubData: !!(readme || fileTree),
            };
        } catch (error: any) {
            console.error("Gemini error:", error);

            // Surface quota/auth errors clearly
            if (error.message?.includes('quota') || error.message?.includes('429')) {
                return fail(429, { error: "API quota exceeded. Please try again later." });
            }
            if (error.message?.includes('API key')) {
                return fail(500, { error: "API key error. Please check your configuration." });
            }

            return fail(500, { error: `Analysis failed: ${error.message}` });
        }
    }
} satisfies Actions;