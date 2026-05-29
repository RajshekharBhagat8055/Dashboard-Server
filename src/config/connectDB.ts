import mongoose from "mongoose"

let isConnected = false;
let arkaDb: mongoose.Connection | null = null;
let skillGameDb: mongoose.Connection | null = null;

const buildConnectionUri = (uri: string, dbName: string): string => {
    let connectionUri = uri;
    const uriParts = uri.split('/');

    if (uriParts.length > 3) {
        const lastPart = uriParts[uriParts.length - 1];
        if (lastPart && !lastPart.includes('@') && !lastPart.includes('?')) {
            uriParts[uriParts.length - 1] = dbName;
            connectionUri = uriParts.join('/');
        } else {
            connectionUri = uri.endsWith('/') ? `${uri}${dbName}` : `${uri}/${dbName}`;
        }
    } else {
        connectionUri = uri.endsWith('/') ? `${uri}${dbName}` : `${uri}/${dbName}`;
    }

    return connectionUri;
};

const connectDB = async(): Promise<void> => {
    if (isConnected && mongoose.connection.readyState >= 1) {
        console.log("MongoDB connections are already initialized");
        return;
    }

    try {
        const uri = process.env.MONGODB_URI as string;
        if (!uri) {
            throw new Error('MONGODB_URI is required');
        }

        const arkaDbName = process.env.DB_NAME || 'ArkaAdmin';
        const skillGameDbName =
            process.env.SKILL_GAME_DB_NAME ||
            process.env.TICKETS_DB_NAME ||
            'SkillGameDB';

        const connectionUri = buildConnectionUri(uri, arkaDbName);

        console.log(`Connecting to primary database: ${arkaDbName}`);
        await mongoose.connect(connectionUri);
        console.log(`✅ Connected to MongoDB database: ${arkaDbName}`);

        arkaDb = mongoose.connection.useDb(arkaDbName, { useCache: true });
        skillGameDb = mongoose.connection.useDb(skillGameDbName, { useCache: true });
        isConnected = true;

        console.log(`✅ Secondary database handle ready: ${skillGameDbName}`);
    } catch( error : any) {
        console.error(`MongoDB connection error:${error.message}`);
        process.exit(1);
    }
}

const getArkaDb = (): mongoose.Connection => {
    if (!arkaDb) {
        throw new Error('ArkaAdmin database is not initialized. Call connectDB() first.');
    }
    return arkaDb;
};

const getSkillGameDb = (): mongoose.Connection => {
    if (!skillGameDb) {
        throw new Error('SkillGameDB database is not initialized. Call connectDB() first.');
    }
    return skillGameDb;
};

export { connectDB, getArkaDb, getSkillGameDb };