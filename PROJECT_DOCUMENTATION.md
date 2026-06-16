# Maro Services Hub Project Documentation

## 1. Project Overview

Maro Services Hub is a service directory for Nigeria. Visitors can search for local service providers by category, state, local government, and keyword. Business owners can submit listings, pay the listing fee, manage their profile, upload photos, and optionally add Google Maps coordinates. Admin users review payments, approve or reject listings, verify phone numbers, and handle trust reports.

## 2. Technology Stack

Frontend:
- HTML
- CSS
- JavaScript

Backend:
- Node.js
- Express

Database:
- MongoDB with Mongoose models

Services:
- Cloudinary for image uploads
- Paystack for listing payments
- Resend for transactional email notifications

## 3. Folder Structure

`backend/src/models`
Defines MongoDB schemas for businesses, admins, and business reports.

`backend/src/controllers`
Contains request handlers for business listings, owner accounts, admin sessions, payments, ratings, comments, reports, and notification side effects.

`backend/src/routes`
Maps API endpoints to controller functions and middleware.

`backend/src/middleware`
Contains authentication, validation, upload handling, and centralized error handling.

`backend/src/utils`
Contains shared helpers for async Express handling, sanitization, and email delivery.

`backend/src/config`
Contains database and Cloudinary configuration helpers.

`frontend`
Contains static HTML pages, shared CSS, browser JavaScript, app configuration, assets, and PWA metadata.

`shared`
Contains shared category and Nigeria location data used by project tooling.

## 4. Business Listing Flow

Add Business -> Payment -> Admin Approval -> Public Listing

1. A business owner submits the Add Business form.
2. The backend validates the listing, stores the business as pending, and saves uploaded image URLs.
3. The owner initializes Paystack payment.
4. Paystack redirects back to the listings page with a payment reference.
5. The backend verifies the Paystack reference and marks payment as verified.
6. Admin reviews the listing and approves or rejects it.
7. Approved and paid listings become visible on public listing and profile pages.

## 5. Owner Dashboard Flow

1. Owner logs in with email or phone plus password.
2. Backend returns an owner JWT.
3. Dashboard loads the owner business profile with the JWT.
4. Owner can update business details, service description, address, optional latitude/longitude, profile photo, and service photos.
5. Owner can request password reset by email and complete reset with a tokenized link.

## 6. Admin Dashboard Flow

1. Admin logs in with email and password.
2. Backend returns an admin JWT.
3. Dashboard loads pending businesses and submitted reports.
4. Admin can verify payment, verify phone number, approve listings, reject listings, reject payments, delete listings, resolve reports, and delete reports.

## 7. Authentication Flow

Admin authentication:
- Uses `JWT_SECRET`.
- Protected routes require a bearer token.
- Middleware attaches the admin document to `req.admin`.

Owner authentication:
- Uses `OWNER_JWT_SECRET` when set, otherwise falls back to `JWT_SECRET`.
- Protected owner routes require a bearer token.
- Middleware attaches the business document to `req.ownerBusiness`.

Password handling:
- Passwords are stored as bcrypt hashes.
- Reset tokens are hashed before storage.
- Sensitive password fields are removed from business JSON responses.

## 8. Google Maps Integration

The Google Maps feature is intentionally simple and does not use the Google Maps API.

Business records may store:
- `latitude`
- `longitude`
- `googleMapsUrl`

When latitude and longitude exist, the app builds:

`https://www.google.com/maps?q=LATITUDE,LONGITUDE`

Public profile pages show a "Get Directions" button only when valid coordinates exist. Listings can show a small "Location Available" indicator. No Google API key, billing account, embedded map, or interactive map is required.

## 9. Image Upload Flow

1. The frontend sends profile and service images through multipart form data.
2. Upload middleware validates file extensions and MIME types.
3. Multer stores accepted images in Cloudinary.
4. Cloudinary URLs are saved on the business document.
5. Profile and service images render on listing cards, profile pages, owner dashboard, and admin review screens.

## 10. Deployment Architecture

GitHub -> Render -> Netlify

Typical deployment responsibilities:
- GitHub stores the source code.
- Render hosts the backend Express API and connects to MongoDB and service credentials.
- Netlify hosts the static frontend and points browser API calls to the backend API URL.

## 11. Environment Variables

Do not commit real secret values. Store production values in the hosting provider dashboard.

`MONGODB_URI`
MongoDB connection string used by the backend.

`PORT`
Backend server port. Render may provide this automatically.

`NODE_ENV`
Runtime environment, commonly `production` in deployed environments.

`FRONTEND_URL`
Primary frontend origin allowed by CORS.

`CORS_ORIGINS`
Optional comma-separated list of additional frontend origins allowed by CORS.

`JWT_SECRET`
Secret used to sign and verify admin JWTs. Also used as the owner JWT fallback.

`OWNER_JWT_SECRET`
Optional separate secret used for owner JWTs.

`CLOUDINARY_CLOUD_NAME`
Cloudinary cloud name for image storage.

`CLOUDINARY_API_KEY`
Cloudinary API key.

`CLOUDINARY_API_SECRET`
Cloudinary API secret.

`PAYSTACK_SECRET_KEY`
Paystack secret key used by the backend for transaction initialization and verification.

`PAYSTACK_PUBLIC_KEY`
Paystack public key, if needed by frontend or future payment integrations.

`LISTING_FEE_NAIRA`
Listing fee amount in naira. The backend converts this to kobo for Paystack.

`RESEND_API_KEY`
Resend API key used for transactional email.

`RESEND_FROM_EMAIL`
Verified sender email address used by Resend.

`ADMIN_NOTIFICATION_EMAIL`
Email address that receives business report notifications.

`ADMIN_DELETE_TOKEN`
Legacy or operational token listed in the example environment file; keep secret if used by deployment tooling.
