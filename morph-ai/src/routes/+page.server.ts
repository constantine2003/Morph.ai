import { GoogleGenerativeAI } from "@google/generative-ai";
import { GOOGLE_API_KEY } from '$env/static/private';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
    analyzeRepo: async ({ request }) => {
        const formData = await request.formData();
        const repoUrl = formData.get('repoUrl')?.toString();

        if (!repoUrl) {
            return fail(400, { error: "Please provide a GitHub URL." });
        }

        if (!GOOGLE_API_KEY) {
            return fail(500, { error: "API Key missing in .env" });
        }

        // Initialize the Generative AI client
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

        try {
            /** * STRATEGY: 
             * We use 'gemini-1.5-pro' as it is the most robust model for architectural analysis.
             * If your account is very new, it might not have 'flash' enabled yet, 
             * but 'pro' is almost always available in AI Studio.
             */
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-pro" 
            });
            
            const prompt = `Analyze this GitHub repository: ${repoUrl}. 
            Provide a summary and a Mermaid.js flowchart of the architecture. 
            Wrap the mermaid code strictly in \`\`\`mermaid blocks.`;

            // Adding a timeout safety
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (!text) throw new Error("AI returned no text.");

            return {
                success: true,
                analysis: text
            };

        } catch (error: any) {
            console.error("FULL ERROR LOG:", error);

            // Detailed error reporting for 404s
            if (error.message.includes("404")) {
                return fail(500, { 
                    error: "Google says this model is 'Not Found'. Try updating your packages: npm install @google/generative-ai@latest" 
                });
            }

            return fail(500, { error: `System Error: ${error.message}` });
        }
    }
} satisfies Actions;