import { app, PORT } from './app';
import { connectDB } from './config/connectDB';
import authRouter from './routes/auth.router';

connectDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.use('/api/auth', authRouter)


