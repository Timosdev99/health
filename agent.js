require('dotenv').config();
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { AIMessage, HumanMessage } = require("@langchain/core/messages");
const { StateGraph } = require("@langchain/langgraph");
const { tool } = require("@langchain/core/tools");
const { ToolNode } = require("@langchain/langgraph/prebuilt");
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { z } = require("zod");

if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY in environment variables');
}

// ✅ Create a health database lookup tool
function createHealthLookupTool(collection) {
    return tool(
        async ({ query, n }) => {
            console.log("Health lookup tool called with query:", query);

            try {
                const vectorStore = new MongoDBAtlasVectorSearch(
                    new GoogleGenerativeAIEmbeddings({
                        modelName: "embedding-001",
                        apiKey: process.env.GEMINI_API_KEY,
                    }),
                    {
                        collection,
                        indexName: "vector_index",
                        textKey: "embedding_text", // Ensure this matches your database schema
                        embeddingKey: "embedding",
                    }
                );

                const results = await vectorStore.similaritySearchWithScore(query, n || 10);
                console.log("Health lookup results found:", results.length);
                return results;
            } catch (error) {
                console.error("Health lookup tool error:", error);
                throw new Error(`Health lookup failed: ${error.message}`);
            }
        },
        {
            name: "healthlookup",
            description: "Searches the health database for relevant information",
            schema: z.object({
                query: z.string().min(1).describe("The search query"),
                n: z.number().min(1).max(50).optional().describe("Number of results to return"),
            }),
        }
    );
}

// ✅ Define the agent workflow
async function createWorkflow(tools) {
    function shouldContinue(state) {
        if (!state?.messages?.length) return "__end__";

        const lastMessage = state.messages[state.messages.length - 1];

        return (lastMessage instanceof AIMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0)
            ? "tools"
            : "__end__";
    }

    async function callModel(state) {
        if (!state?.messages) {
            throw new Error('Invalid state: messages array is required');
        }

        try {
            const model = new ChatGoogleGenerativeAI({
                modelName: "gemini-pro",
                apiKey: process.env.GEMINI_API_KEY,
                temperature: 0.2,
                maxRetries: 3,
                timeout: 30000,
            }).bindTools(tools);

            const systemMessage = {
                role: "system",
                content: "You are an AI health researcher that investigates claims made by influencers and public figures. " +
                    "Your role is to evaluate the claims for accuracy and provide a detailed report.\n\n" +
                    "Your tasks are:\n" +
                    "1. Analyze the health claims in the query\n" +
                    "2. Use the tools if needed to gather information\n" +
                    "3. Research and identify credible sources\n" +
                    "4. Report your findings as a JSON object with these fields:\n" +
                    "   - claim: The original claim being verified\n" +
                    "   - rating: Truthful or False\n" +
                    "   - explanation: Detailed analysis of why the claim is rated this way\n" +
                    "   - sources: Array of sources with url, credibility (high/medium/low), and summary"
            };

            // Convert state messages to the correct format
            const formattedMessages = state.messages.map(msg => {
                if (msg instanceof HumanMessage) {
                    return { role: "user", content: msg.content };
                } else if (msg instanceof AIMessage) {
                    return { role: "assistant", content: msg.content, tool_calls: msg.tool_calls };
                }
                return msg;
            });

            // Combine system message with state messages
            const messages = [systemMessage, ...formattedMessages];
            
            let response = await model.invoke(messages);

            if (response && response.tool_calls && response.tool_calls.length > 0) {
                console.log("Tool Calls Detected:", response.tool_calls);

                // Execute the tool calls
                const toolResponses = await Promise.all(
                    response.tool_calls.map(async (toolCall) => {
                        if (toolCall.name === "healthlookup") {
                            return await tools[0].func(toolCall.args);
                        }
                        return null;
                    })
                );

                console.log("Tool Responses:", toolResponses);

                return {
                    messages: [new AIMessage({ content: JSON.stringify(toolResponses), tool_calls: response.tool_calls })]
                };
            }

            if (response && response.content) {
                console.log("Model Response:", response.content);
                return { messages: [new AIMessage(response.content)] };
            } else {
                console.warn("Model response is missing or undefined.");
                return { messages: [new AIMessage("I'm sorry, I couldn't process your request. Please try again later.")] };
            }
        } catch (error) {
            console.error("Model call error:", error);
            throw new Error(`Model invocation failed: ${error.message}`);
        }
    }

    const toolNode = new ToolNode({ tools });

    const workflow = new StateGraph({
        channels: { messages: [] }
    });

    workflow
        .addNode("agent", callModel)
        .addNode("tools", toolNode)
        .addEdge("__start__", "agent")
        .addConditionalEdges("agent", shouldContinue)
        .addEdge("tools", "agent");

    return workflow;
}

// ✅ Call the agent with query
async function callAgent(client, query, thread_id) {
    if (!client || !query || !thread_id) {
        throw new Error('Missing required parameters: client, query, or thread_id');
    }

    try {
        const db = client.db(process.env.MONGO_DB_NAME || "health_database");
        const collection = db.collection("health");

        const tools = [createHealthLookupTool(collection)];
        const workflow = await createWorkflow(tools);

        const app = workflow.compile();

        const finalState = await app.invoke({
            messages: [new HumanMessage(query)],
        });

        console.log("Final State:", finalState);

        if (finalState && finalState.messages && finalState.messages.length > 0) {
            const lastMessage = finalState.messages[finalState.messages.length - 1];

            if (lastMessage && lastMessage.content) {
                console.log("Agent response received:", lastMessage.content);
                return lastMessage.content;
            } else {
                console.warn("Last message content is missing.");
                return undefined;
            }
        } else {
            console.warn("Final state or messages array is empty.");
            return undefined;
        }
    } catch (error) {
        console.error("Agent execution error:", error);
        throw new Error(`Agent execution failed: ${error.message}`);
    }
}

const query = "Is drinking celery juice good for health?";
module.exports = { callAgent };
