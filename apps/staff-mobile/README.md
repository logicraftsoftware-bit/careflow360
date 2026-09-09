# CareFlow360 Staff Mobile

Standalone React Native CLI app for clinic admins, staff, and lab technicians. It includes native Android and iOS projects, shares the CareFlow360 API, and is not part of the web CRM deployment.

## Run locally

1. Use Node.js 22.
2. Set the API URL in `src/config.ts` when using another environment.
3. Start Metro with `npm run start -w @careflow360/staff-mobile`.
4. Run Android with `npm run android -w @careflow360/staff-mobile`.
5. On macOS, install CocoaPods and run iOS with `npm run ios -w @careflow360/staff-mobile`.

The default API URL is `https://crm.hosmedai.com/api`. Admin and Staff login use the same credentials and permission model as the CRM. This project does not use Expo.

## Current screens

- Admin/Staff login selector
- Role-aware dashboard
- Doctor, Lab, and Radiology appointment workspace
- Lab technician Assigned and Collected workflows
- Patient search and list
- Unified payment logs
- Admin and staff tools menu
- Profile and sign out
