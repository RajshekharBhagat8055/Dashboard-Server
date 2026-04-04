import dns from "node:dns";
import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
    if (mongoose.connection.readyState >= 1) {
        console.log("MongoDB is already connected");
        return;
    }

    try {
        const uri = process.env.MONGODB_URI as string;
        if (!uri) {
            throw new Error("MONGODB_URI is not set");
        }
        const dbName = process.env.DB_NAME || "Admin";

        // Windows + Node often use a resolver path where SRV lookups fail with
        // querySrv ECONNREFUSED while other tools resolve fine. Point c-ares at public DNS.
        if (
            process.platform === "win32" &&
            uri.startsWith("mongodb+srv://") &&
            process.env.MONGO_SKIP_DNS_PATCH !== "1"
        ) {
            const fromEnv = process.env.MONGO_DNS_SERVERS?.split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            dns.setServers(fromEnv?.length ? fromEnv : ["8.8.8.8", "1.1.1.1"]);
        }
        
        // Remove any existing database name from URI and add the one from env
        let connectionUri = uri;
        const uriParts = uri.split('/');
        
        // Remove database name if it exists
        if (uriParts.length > 3) {
            const lastPart = uriParts[uriParts.length - 1];
            if (lastPart && !lastPart.includes('@') && !lastPart.includes('?')) {
                // Has database name, replace it
                uriParts[uriParts.length - 1] = dbName;
                connectionUri = uriParts.join('/');
            } else {
                // No database name, add it
                if (uri.endsWith('/')) {
                    connectionUri = `${uri}${dbName}`;
                } else {
                    connectionUri = `${uri}/${dbName}`;
                }
            }
        } else {
            // No database name, add it
            if (uri.endsWith('/')) {
                connectionUri = `${uri}${dbName}`;
            } else {
                connectionUri = `${uri}/${dbName}`;
            }
        }
        
        console.log(`Connecting to database: ${dbName}`);
        await mongoose.connect(connectionUri);
        console.log(`✅ Connected to MongoDB database: ${dbName}`);
    } catch( error : any) {
        console.error(`MongoDB connection error:${error.message}`);
        process.exit(1);
    }
}

export { connectDB };