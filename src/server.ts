import { app, PORT } from './app';
import { connectDB } from './config/connectDB';

connectDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


