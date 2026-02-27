const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { MongoMemoryServer } = require("mongodb-memory-server");

dotenv.config();

const connectDB = async () => {
    try {
        let uri = process.env.MONGO_URI;

        // Try connecting to the provided URI first
        console.log(`Attempting to connect to: ${uri}`);
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 2000 // Fail fast if not found
        });
        console.log("✅ MongoDB Connected (Local/Remote)");

    } catch (err) {
        console.log("⚠️ Local MongoDB not found. Starting embedded MongoDB...");

        try {
            const mongod = await MongoMemoryServer.create({
                binary: {
                    version: '6.0.4',
                    downloadDir: './mongodb-binaries'
                }
            });
            const uri = mongod.getUri();

            await mongoose.connect(uri);
            console.log(`✅ Embedded MongoDB Connected at: ${uri}`);

            // Keep it alive
            process.on('SIGTERM', async () => {
                await mongoose.disconnect();
                await mongod.stop();
            });

        } catch (memErr) {
            console.error("❌ Embedded MongoDB Failed:", memErr);
            process.exit(1);
        }
    }
};

module.exports = connectDB;
