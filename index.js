const { MongoClient } = require("mongodb");
const { callAgent } = require("./agent"); // Adjust path if necessary

const uri = process.env.MONGODB_URI;

async function main() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const query = "Is it true that drinking celery juice on an empty stomach every morning has miraculous health benefits?";
        const threadId = "unique_thread_id_1234"; // Replace with a unique ID for each interaction
        const result = await callAgent(client, query, threadId);
        console.log("Final result:", result);
    } catch (error) {
        console.error("Error during the process:", error);
    } finally {
        await client.close();
    }
}

main();