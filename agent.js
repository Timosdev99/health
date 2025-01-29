require('dotenv').config();
const { Gemini } = require("@langchain/google-genai");
const { AIMessage, HumanMessage } = require("@langchain/core/messages");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { StateGraph } = require("@langchain/langgraph");
const { Annotation } = require("@langchain/langgraph");
const { tool } = require("@langchain/core/tools");
const { ToolNode } = require("@langchain/langgraph/prebuilt");
const { MongoDBSaver } = require("@langchain/mongodb");
const { MongoDBAtlasVectorSearch } = require("@langchain/mongodb");
const { MongoClient } = require("mongodb");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { z } = require("zod");

async function callAgent(client, query, thread_id) {
    const dbName = "health_database";
    const db = client.db(dbName);
    const collection = db.collection("health");

    const GraphState = Annotation.Root({
        messages: Annotation({
            reducer: (x, y) => x.concat(y),
        }),
    });

    const healthlookup = tool(
        async ({ query, n = 10 }) => {
            console.log("Health lookup tool called");

            const dbConfig = {
                collection: collection,
                indexName: "vector_index",
                textKey: "embedding_text",
                embeddingKey: "embedding",
            };

            try {
                const vectorStore = new MongoDBAtlasVectorSearch(
                    new OpenAIEmbeddings(),
                    dbConfig
                );

                const result = await vectorStore.similaritySearchWithScore(query, n);
                return JSON.stringify(result);
            } catch (error) {
                console.error("Error in healthlookup tool:", error);
                return JSON.stringify([]);
            }
        },
        {
            name: "healthlookup",
            description: "Gathers influencers' details from the Health database",
            schema: z.object({
                query: z.string().describe("The search query"),
                n: z.number().optional().default(10).describe("Number of results to return"),
            }),
        }
    );

    const tools = [healthlookup];

    const toolNode = new ToolNode(tools);

    const gemini = new Gemini({ modelName: 'gemini-2.0-Flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0.2 }).bindTools(tools); // restored `new` keyword

    function shouldContinue(state) {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1];
        if(lastMessage instanceof AIMessage){
            if (lastMessage.tool_call) {
              return "tools";
            }
          }

        return "__end__";
    }


    async function callModel(state) {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are an AI health researcher that investigates claims made by influencers and public figures. Your role is to evaluate the claims for accuracy and provide a detailed report including sources.
                
                **Your Task:**

                1.  **Analyze:** Evaluate the health claims made in the user's query.
                2.  **Use Tools:** If it is relevant, use the provided tools to gather more information.
                3.  **Research:** Identify credible sources that support or refute the health claims.
                4.  **Report:** Output the result in JSON format. 

                    \`\`\`json
                      {
                        "claim": "The original claim being verified",
                         "rating": "Truthful/False",
                         "sources": [{
                           "url": "url of the source",
                           "credibility": "high/medium/low",
                           "summary": "a summary about the source"
                          }]
                      }
                    \`\`\`
                `,
            ],
            new MessagesPlaceholder("messages"),
        ]);


    const formattedPrompt = await prompt.formatMessages({
      system_message: "You are a health verification AI.",
      time: new Date().toISOString(),
      tool_names: tools.map((tool) => tool.name).join(", "),
    });

    try {
      const result = await gemini.invoke({...formattedPrompt, messages: state.messages});
      return { messages: [result] };
    }
      catch (error) {
      console.error("Error calling LLM:", error);
      return { messages: [new AIMessage("Error in LLM call.")] };
    }
    }
    const workflow = new StateGraph(GraphState)
        .addNode("agent", callModel)
        .addNode("tools", toolNode)
        .addEdge("__start__", "agent")
        .addConditionalEdges("agent", shouldContinue)
        .addEdge("tools", "agent");

    const checkpointer = new MongoDBSaver({ client, dbName });

    const app = workflow.compile({ checkpointer });

    const finalState = await app.invoke(
        {
            messages: [new HumanMessage(query)],
        },
        { recursionLimit: 15, configurable: { thread_id: thread_id } }
    );

    console.log(finalState.messages[finalState.messages.length - 1].content);

    return finalState.messages[finalState.messages.length - 1].content;
}

module.exports = { callAgent };