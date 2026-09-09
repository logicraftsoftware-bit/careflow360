# CareFlow360 Staff Mobile

Standalone Expo app for clinic admins, staff, and lab technicians. It shares the CareFlow360 API but is not part of the web CRM deployment.

## Run locally

1. Use Node.js 22.
2. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.
3. From the repository root run `npm run start -w @careflow360/staff-mobile`.
4. Open the QR code in Expo Go or launch an Android/iOS simulator.

The default API URL is `https://crm.hosmedai.com/api`. Admin and Staff login use the same credentials and permission model as the CRM.

## Current screens

- Admin/Staff login selector
- Role-aware dashboard
- Doctor, Lab, and Radiology appointment workspace
- Lab technician Assigned and Collected workflows
- Patient search and list
- Unified payment logs
- Admin and staff tools menu
- Profile and sign out
