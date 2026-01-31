import { GoogleGenerativeAI } from "@google/generative-ai";
import { GOOGLE_API_KEY } from '$env/static/private';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
    analyzeRepo: async ({ request }) => {
        const formData = await request.formData();
        const repoUrl = formData.get('repoUrl')?.toString();

        if (!repoUrl) return fail(400, { error: "Link required." });

        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Using 2.0 Flash as it's the current stable high-speed model
            
            const prompt = `
            SYSTEM: You are a strict Repository Architect.

            USER REQUEST: Analyze the repository at ${repoUrl}

            MANDATORY CONSTRAINTS:

            1. You may ONLY analyze the repository if you can directly access its contents
            (e.g., view the file tree, README, or source files).
            - If the URL returns a 404, requires authentication, or repository contents
                cannot be fetched due to access restrictions, you MUST respond exactly with:

            "### ⚠️ Access Denied
            This repository is private or does not exist. Morph.ai cannot analyze internal structures without a Personal Access Token."

            2. If the repository URL is reachable but its contents cannot be inspected due to
            tooling or environment limitations, you MUST clearly state this limitation
            instead of assuming the repository is private.

            3. DO NOT speculate, hallucinate, or infer the repository structure based on:
            - the repository name
            - common frameworks
            - typical project layouts

            4. DO NOT provide generic templates, placeholder architectures, or hypothetical
            folder structures.

            5. If (and ONLY if) the repository is PUBLIC and its contents are accessible,
            your response MUST include:
            - A concise high-level architectural overview
            - A Mermaid diagram representing the actual folder structure or data flow
            - A list of identified key technologies based strictly on observed files
            `;

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