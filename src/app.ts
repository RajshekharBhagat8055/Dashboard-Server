import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRouter from './routes/auth.router';
import { connectDB } from './config/connectDB';
import userRouter from './routes/user.route';
import gameRouter from './routes/game.route';
import logRouter from './routes/log.route';

// Load environment variables
dotenv.config();

export const app = express();
export const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// Security middleware
app.use(helmet());
// CORS configuration - environment aware
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [];

    // Development origins (when running locally)
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        // Allow all 192.168.x.x addresses on ports 5173 and 5174
        /^http:\/\/192\.168\.\d+\.\d+:517[34]$/,
        // Allow localhost variations
        /^http:\/\/localhost:517[34]$/,
        /^http:\/\/127\.0\.0\.1:517[34]$/
      );
    }

    // Production origins (always allowed)
    allowedOrigins.push(
      'https://arka-dashboard-hub.vercel.app', // Your Vercel frontend
      /^https:\/\/arka-dashboard-hub.*\.vercel\.app$/, // Vercel preview deployments
      'https://dashboard-server-dr9z.onrender.com' // Your Render backend (for API calls)
    );

    // Check if the origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin, 'NODE_ENV:', process.env.NODE_ENV);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Cookie parsing middleware
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Balatro Admin Backend Server is running!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/games', gameRouter);
app.use('/api/logs', logRouter);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error:', error);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});
