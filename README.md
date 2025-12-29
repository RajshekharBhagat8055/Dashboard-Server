# Balatro Admin Backend

A TypeScript/Node.js backend API for the Balatro Admin system, providing comprehensive management for distributors, retailers, super distributors, and online players.

## Features

- ðŸ” **Authentication & Authorization** - JWT-based auth with role-based access control
- ðŸ‘¥ **User Management** - Admin, Super Distributor, Distributor, and Retailer roles
- ðŸ“Š **Dashboard Analytics** - Real-time statistics and reporting
- ðŸŽ® **Player Management** - Online player monitoring and management
- ðŸ“ˆ **Business Hierarchy** - Multi-level distributor/retailer management
- ðŸ”’ **Security** - Helmet, CORS, rate limiting, input validation
- ðŸ“ **Logging** - Comprehensive request/response logging
- ðŸ—„ï¸ **Database** - MongoDB with Mongoose ODM

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, bcryptjs
- **Validation**: Custom middleware
- **Logging**: Morgan
- **Development**: Nodemon, concurrently

## Project Structure

`
src/
â”œâ”€â”€ controllers/     # Request handlers
â”œâ”€â”€ models/         # Database models
â”œâ”€â”€ routes/         # API routes
â”œâ”€â”€ middleware/     # Custom middleware
â”œâ”€â”€ services/       # Business logic
â”œâ”€â”€ utils/          # Utility functions
â”œâ”€â”€ types/          # TypeScript definitions
â””â”€â”€ config/         # Configuration files
tests/              # Unit and integration tests
config/             # Environment configurations
scripts/            # Build and deployment scripts
docs/               # API documentation
`

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation

1. Clone the repository
   `ash
   git clone <repository-url>
   cd balatro_admin_backend
   `

2. Install dependencies
   `ash
   npm install
   `

3. Set up environment variables
   `ash
   cp .env.example .env
   # Edit .env with your configuration
   `

4. Start MongoDB service

5. Create initial admin user
   `ash
   npm run create-admin
   `

6. Run the development server
   `ash
   npm run dev
   `

The server will start on http://localhost:3000

## Available Scripts

-
pm run dev - Start development server with hot reload
-
pm run build - Build the project for production
-
pm run start - Start the production server
-
pm run create-admin - Create initial admin user
-
pm run lint - Run ESLint
-
pm run test - Run tests
-
pm run test:watch - Run tests in watch mode
-
pm run clean - Clean build directory

## API Endpoints

### Authentication
- POST /api/auth/login - User login
- POST /api/auth/logout - User logout
- POST /api/auth/refresh - Refresh access token

### Users
- GET /api/users - Get all users (Admin only)
- POST /api/users - Create new user (Admin only)
- PUT /api/users/:id - Update user (Admin only)
- DELETE /api/users/:id - Delete user (Admin only)

### Distributors
- GET /api/distributors - Get all distributors
- POST /api/distributors - Create distributor
- PUT /api/distributors/:id - Update distributor
- DELETE /api/distributors/:id - Delete distributor

### Retailers
- GET /api/retailers - Get all retailers
- POST /api/retailers - Create retailer
- PUT /api/retailers/:id - Update retailer
- DELETE /api/retailers/:id - Delete retailer

### Players
- GET /api/players/online - Get online players
- PUT /api/players/:id/ban - Ban player
- PUT /api/players/:id/unban - Unban player

### Admin
- GET /api/admin/dashboard - Get dashboard statistics
- GET /api/admin/login-requests - Get login requests
- PUT /api/admin/login-requests/:id/approve - Approve login request

## Environment Variables

See .env.example for all required environment variables.

## Database Models

- **User** - System users with different roles
- **Distributor** - Distributor entities
- **Retailer** - Retailer entities
- **SuperDistributor** - Super distributor entities
- **Player** - Game players
- **LoginRequest** - Login request logs

## Security Features

- JWT authentication with expiration
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization
- SQL injection prevention

## Development

### Code Style

- TypeScript strict mode enabled
- ESLint for code linting
- Prettier for code formatting

### Testing

`ash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
`

### API Documentation

API documentation is available at /api/docs when running in development mode.

## Deployment

1. Build the project
   `ash
   npm run build
   `

2. Set environment variables for production

3. Start the server
   `ash
   npm start
   `

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support, please contact the development team.
