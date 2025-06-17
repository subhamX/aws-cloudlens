import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const getMyModel = () => {
    const googleAi = createGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
    });


    const model = googleAi('gemini-2.5-flash-preview-04-17')
    return {
        model
    };
}