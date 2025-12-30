import { app, PORT } from './app';
import { connectDB } from './config/connectDB';
import authRouter from './routes/auth.router';
import userRouter from './routes/user.route';

connectDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


