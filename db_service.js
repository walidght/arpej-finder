const { MongoClient } = require('mongodb');
const { format, startOfDay, endOfDay } = require('date-fns');

// Load environment variables
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DATABASE_NAME = process.env.DATABASE_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;

console.log(DATABASE_NAME);

const MONGO_URI = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@cluster.urbto.mongodb.net/?retryWrites=true&w=majority&appName=cluster`;

// Initialize the MongoDB client
const client = new MongoClient(MONGO_URI);

async function connectDB() {
    try {
        await client.connect();
        console.log('Connected successfully to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}

// Connect to the database when the module is loaded
connectDB();

const db = client.db(DATABASE_NAME);
const collection = db.collection(COLLECTION_NAME);

async function saveToDb(offers) {
    try {
        await collection.insertMany(offers);
        console.log('Data saved in DB');
    } catch (err) {
        console.error('Error saving data to DB', err);
    }
}

async function getFromDb(date) {
    try {
        // Create the start and end of the day for the query
        const startDate = startOfDay(new Date(date));
        const endDate = endOfDay(new Date(date));

        // Query the collection for documents within the date range
        const results = await collection
            .find({
                datetime: {
                    $gte: startDate,
                    $lte: endDate,
                },
            })
            .toArray();

        return results;
    } catch (err) {
        console.error('Error retrieving data from DB', err);
        return [];
    }
}

module.exports = {
    saveToDb,
    getFromDb,
};
