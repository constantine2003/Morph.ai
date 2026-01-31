import { GoogleGenerativeAI } from "@google/generative-ai";
import { GOOGLE_API_KEY } from '$env/static/private';

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

export const actions = {
    // This function triggers when the user clicks 'Morph'
    analyzeRepo: async ({ request }) => {
        const formData = await request.formData();
        const repoUrl = formData.get('repoUrl');

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `You are a Senior Architect. Analyze this repo: ${repoUrl}.
            1. What does it do? (2 sentences)
            2. Provide a Mermaid.js 'graph TD' flowchart showing how the parts connect.
            Return only the markdown.`;

            const result = await model.generateContent(prompt);
            return {
                success: true,
                analysis: result.response.text()
            };
        } catch (error) {
            return { success: false, error: "AI failed to respond. Check your API key!" };
        }
    }
};