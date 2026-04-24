# Maro Solution

Maro Solution is a full-stack service-listing website for Nigeria. Service providers can add their business, and visitors can search by category, state, local government, and keyword, then contact providers directly on WhatsApp.

## Features

- Responsive homepage, listings page, and add-business page
- Blue-and-white modern UI with dark mode saved in `localStorage`
- Mobile/tablet hamburger navigation
- Nigerian states and all 774 LGAs available in the search and form dropdowns
- Featured categories and featured provider sections
- Business cards with profile image, phone, rating, location, and WhatsApp CTA
- Secure Express API with validation, sanitization, rate limiting, CORS, Helmet, MongoDB query sanitization, and protected image uploads
- MongoDB/Mongoose model and seed data for quick testing
- Static frontend served by the backend for simple local development and deployment

## Project structure

```text
maro_solution_webapp/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── data/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── uploads/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── scripts/
│   ├── styles/
│   ├── add-business.html
│   ├── index.html
│   └── listings.html
├── shared/
├── .env.example
├── generate-data.js
├── package.json
└── README.md
```

## Requirements

- Node.js 18+
- npm 9+
- MongoDB local instance or MongoDB Atlas

## Install

1. Install backend dependencies:

```bash
npm run install:backend
```

2. Create your environment file:

```bash
copy .env.example backend\\.env
```

Or manually create `backend/.env` with the values shown below.

## Environment variables

Set these in `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/maro-solution
FRONTEND_URL=http://localhost:5000
CORS_ORIGINS=http://localhost:5000,http://127.0.0.1:5000,http://localhost:5500,http://127.0.0.1:5500
MAX_FILE_SIZE_MB=3
```

Notes:

- `MONGODB_URI` should point to your MongoDB database.
- `FRONTEND_URL` should match the public frontend origin in production.
- `CORS_ORIGINS` can contain a comma-separated list of allowed frontend origins.
- `MAX_FILE_SIZE_MB` controls the upload size limit for profile images.

## Frontend API configuration

The frontend uses [frontend/scripts/config.js](/c:/Users/USER/OneDrive/Desktop/maro_solution_webapp/frontend/scripts/config.js:1) to decide which backend API to call.

Default local setup:

```js
window.MaroConfig = window.MaroConfig || {
  API_BASE_URL: '',
};
```

Behavior:

- If `API_BASE_URL` is empty, the frontend uses the same origin, which keeps local development working with `http://localhost:5000`.
- For Netlify deployment, set `API_BASE_URL` to your Render backend URL, for example:

```js
window.MaroConfig = window.MaroConfig || {
  API_BASE_URL: 'https://your-render-service.onrender.com/api/businesses',
};
```

This also ensures uploaded profile images resolve from the backend origin in production.

## How to run backend

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

The backend API and static frontend are served together at:

```text
http://localhost:5000
```

## How to run frontend

The frontend is already served by the Express backend, so once the backend is running you can open:

```text
http://localhost:5000
```

Pages:

- Home: `http://localhost:5000/`
- Listings: `http://localhost:5000/listings`
- Add Business: `http://localhost:5000/add-business`

## MongoDB connection

### Local MongoDB

1. Start MongoDB on your machine.
2. Use the default value:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/maro-solution
```

### MongoDB Atlas

1. Create a cluster on MongoDB Atlas.
2. Create a database user.
3. Whitelist your IP or deployment IP.
4. Replace `MONGODB_URI` with your Atlas connection string.

Example:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/maro-solution?retryWrites=true&w=majority
```

Never commit real credentials to source control.

## Deployment for Atlas + Render + Netlify

### 1. MongoDB Atlas setup

1. Create a MongoDB Atlas account and create a new project.
2. Create a cluster.
3. Create a database user with a username and password.
4. In `Network Access`, allow your deployment traffic.
5. Get your connection string and replace `<username>`, `<password>`, and database name.

Example Atlas URI:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/maro-solution?retryWrites=true&w=majority
```

Recommended production database name:

- `maro-solution`

### 2. Render backend deployment

Deploy the `backend/` folder as a Node.js Web Service on Render.

Render settings:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Set these environment variables in Render:

```env
PORT=10000
MONGODB_URI=your_mongodb_atlas_connection_string
FRONTEND_URL=https://your-netlify-site.netlify.app
CORS_ORIGINS=https://your-netlify-site.netlify.app,http://localhost:5000,http://127.0.0.1:5000,http://localhost:5500,http://127.0.0.1:5500
MAX_FILE_SIZE_MB=3
```

Notes:

- Render usually provides `PORT` automatically, but setting it explicitly is fine.
- After deployment, your backend base URL will look like:

```text
https://your-render-service.onrender.com
```

- Your API base URL for the frontend will be:

```text
https://your-render-service.onrender.com/api/businesses
```

### 3. Netlify frontend deployment

Deploy the `frontend/` folder to Netlify.

Before uploading or publishing, edit [frontend/scripts/config.js](/c:/Users/USER/OneDrive/Desktop/maro_solution_webapp/frontend/scripts/config.js:1) and set:

```js
window.MaroConfig = window.MaroConfig || {
  API_BASE_URL: 'https://your-render-service.onrender.com/api/businesses',
};
```

Netlify publish settings:

- Publish directory: `frontend`
- Build command: none required

Because this is a static frontend, you do not need a build step for Netlify.

### 4. Which folder to upload to Netlify

Upload or publish the `frontend/` folder.

That folder contains:

- `index.html`
- `listings.html`
- `add-business.html`
- `styles/`
- `scripts/`

Do not upload the `backend/` folder to Netlify.

### 5. Local development still works

Local behavior is unchanged:

- Backend + frontend together: `http://localhost:5000`
- Frontend config can stay as:

```js
window.MaroConfig = window.MaroConfig || {
  API_BASE_URL: '',
};
```

- That keeps local API calls on the same origin.

## Seed sample data

After your MongoDB connection is ready:

```bash
npm run seed
```

This clears existing businesses and inserts sample providers with ratings for testing.

## API endpoints

- `POST /api/businesses`
- `GET /api/businesses`
- `GET /api/businesses/:id`
- `PUT /api/businesses/:id`
- `DELETE /api/businesses/:id`

Supported `GET /api/businesses` query filters:

- `category`
- `state`
- `localGovernment`
- `keyword`

## Upload rules

- Allowed image types: `jpg`, `jpeg`, `png`, `webp`
- Upload size limit controlled by `MAX_FILE_SIZE_MB`
- Uploaded images are stored in `backend/uploads/`

## Security notes

- `helmet` adds secure HTTP headers
- `express-rate-limit` protects both general traffic and business submissions
- `cors` uses an allowlist approach
- `express-validator` validates form/API fields
- `express-mongo-sanitize` helps block MongoDB operator injection
- Input strings are sanitized before persistence

## Deployment

You can deploy this project to platforms such as Render, Railway, Fly.io, or a VPS.

### Basic deployment steps

1. Provision a MongoDB database, preferably MongoDB Atlas.
2. Deploy the `backend/` Node.js app.
3. Set environment variables from the `.env.example` file.
4. Ensure persistent storage is configured if you want uploaded files to survive redeploys.
5. Point your custom domain to the deployed backend.

### Production tips

- Use a managed object store like Cloudinary, S3, or similar for long-term image storage.
- Set `FRONTEND_URL` to your real production domain.
- Use HTTPS in production.
- Add admin authentication before exposing update/delete actions publicly.

## Data files

- `backend/src/data/nigeriaData.js` contains all Nigerian states plus FCT and the full LGA mapping.
- `backend/src/data/categories.js` contains the business category list.
- `frontend/scripts/data.js` exposes the same data to the browser for dropdown population.
