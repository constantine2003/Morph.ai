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
                1. If you cannot access the contents of this URL directly (e.g., it is private, requires authentication, or returns a 404), you MUST respond exactly with: "### ⚠️ Access Denied\nThis repository is private or does not exist. Morph.ai cannot analyze internal structures without a Personal Access Token."
                2. DO NOT speculate, hallucinate, or guess the code structure based on the URL name.
                3. DO NOT provide a "generic" template of what you think might be there.
                4. If the repo is PUBLIC and accessible, provide:
                   - A high-level architectural overview.
                   - A Mermaid diagram showing the folder structure or data flow.
                   - Key technologies identified.
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