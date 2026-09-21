import { app, PORT } from './app';
import { connectDB } from './config/connectDB';

connectDB().catch((err) => {
  console.error('DB connect failed:', err);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
