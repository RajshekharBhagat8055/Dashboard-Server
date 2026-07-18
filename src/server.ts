import { app, PORT } from './app';

// DB connection is started from app.ts (imported above)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


