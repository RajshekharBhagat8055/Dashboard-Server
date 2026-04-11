import mongoose from "mongoose"

const connectDB = async(): Promise<void> => {
    if (mongoose.connection.readyState >= 1) {
        console.log("MongoDB is already connected");
    }

    try {
        const uri = process.env.MONGODB_URI as string;
        const dbName = process.env.DB_NAME || 'Admin';
        
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
        const ticketsDb = process.env.TICKETS_DB_NAME;
        if (ticketsDb && ticketsDb !== dbName) {
          console.log(`📎 Reports will read tickets from database: ${ticketsDb} (useDb)`);
        }
    } catch( error : any) {
        console.error(`MongoDB connection error:${error.message}`);
        process.exit(1);
    }
}

export { connectDB };