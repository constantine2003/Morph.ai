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
            You are an expert code architect. 
            I will provide a URL: ${repoUrl}. 
            If you cannot access the contents of this URL directly, DO NOT speculate. 
            State clearly that the repository is private or inaccessible. 
            If you CAN see it, provide a technical breakdown.
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