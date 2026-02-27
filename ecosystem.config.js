module.exports = {
    apps: [
        {
            name: "chat-app",
            script: "./server.js",
            instances: 1,
            env: {
                NODE_ENV: "development",
                PORT: 3000,
                MONGO_URI: "mongodb://127.0.0.1:27017/chatapp",
                JWT_SECRET: "supersecretjwtkey_123"
            },
            env_production: {
                NODE_ENV: "production",
                PORT: 3000,
                MONGO_URI: "mongodb://127.0.0.1:27017/chatapp",
                JWT_SECRET: "your_production_secret_here"
            }
        }
    ]
};
