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
            // gemini-pro is the 'Old Reliable'. It exists on all API versions.
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            
            const result = await model.generateContent(`Analyze this: ${repoUrl}`);
            const response = await result.response;
            
            return {
                success: true,
                analysis: response.text()
            };
        } catch (error: any) {
            console.error("LOG:", error.message);
            return fail(500, { error: `Reset Error: ${error.message}` });
        }
    }
} satisfies Actions;