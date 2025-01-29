const { MongoClient } = require("mongodb");
const { callAgent } = require("./agent"); // Adjust the path if needed

const uri = process.env.MONGODB_URI;

async function main() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const query = "A popular health influencer claims that eating only bananas will improve overall health, is this true?";
        const threadId = "unique_thread_id_123"; // Replace with an appropriate thread ID
        const result = await callAgent(client, query, threadId);
        console.log("Final result:", result);
    } catch (error) {
        console.error("Error during the process:", error);
    } finally {
        await client.close();
    }
}

main();