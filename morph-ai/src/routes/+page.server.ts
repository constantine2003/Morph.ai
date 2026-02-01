
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GOOGLE_API_KEY } from '$env/static/private';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
    analyzeRepo: async ({ request }) => {
        const formData = await request.formData();
        const repoUrl = formData.get('repoUrl')?.toString();

        if (!repoUrl) return fail(400, { error: "Link required." });

        // Try to fetch repo data if it's a public GitHub repo
        let repoData = '';
        let readme = '';
        let fileTree = '';
        const githubMatch = repoUrl.match(/^https:\/\/github.com\/([^\/]+)\/([^\/]+)(?:\/|$)/);
        if (githubMatch) {
            const owner = githubMatch[1];
            const repo = githubMatch[2];
            try {
                // Fetch README
                const readmeRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`);
                if (readmeRes.ok) {
                    readme = await readmeRes.text();
                }
                // Fetch file tree (first 1000 files)
                const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
                if (treeRes.ok) {
                    const treeJson = await treeRes.json();
                    if (treeJson.tree) {
                        fileTree = treeJson.tree.map((item: any) => item.path).join('\n');
                    }
                }
            } catch (err) {
                // Ignore fetch errors, fallback to default prompt
            }
        }

        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            let prompt = '';
            if (readme || fileTree) {
                prompt =    `You are an expert code architect. Here is the README and file tree for a repository at ${repoUrl}.
                            README:\n\n${readme ? readme.substring(0, 8000) : 'No README found.'}
                            File Tree (truncated to 1000 files):\n\n${fileTree ? fileTree.substring(0, 8000) : 'No file tree found.'}
                            Please provide a concise, technical breakdown of the repository's structure, purpose, and any notable technologies or patterns. Do not speculate beyond the provided data. If you are unsure, say so.`;
            } else {
                prompt = `You are an expert code architect. I will provide a URL: ${repoUrl}. If you cannot access the contents of this URL directly, DO NOT speculate or invent details. If you do not have access, simply state: "The repository is private or inaccessible." If you CAN see it, provide a concise, technical breakdown of the repository's structure, purpose, and any notable technologies or patterns.`;
            }
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            return {
                success: true,
                analysis: text
            };
        } catch (error: any) {
            console.error("LOG:", error.message);
            return fail(500, { error: `System Error: ${error.message}` });
        }
    }
} satisfies Actions;