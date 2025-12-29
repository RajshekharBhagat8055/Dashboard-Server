import mongoose from "mongoose"

const connectDB = async(): Promise<void> => {
    if (mongoose.connection.readyState >= 1) {
        console.log("MongoDB is already connected");
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log("Connected to MongoDB");
    } catch( error : any) {
        console.error(`MongoDB connection error:${error.message}`);
        process.exit(1);
    }
}

export { connectDB };