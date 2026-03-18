# Quick Health Check Dashboard

A modern inventory and sales management dashboard built with React, Vite, and Tailwind CSS.

## Features
- Real-time sales tracking
- Inventory management with stock alerts
- Revenue trend visualization with Recharts
- CSV export for sales data
- Responsive, mobile-first design

## Deployment to Vercel

This project is optimized for deployment on [Vercel](https://vercel.com).

### Steps to Deploy:
1. **Export the Code**: Use the "Export to GitHub" or "Download ZIP" option in AI Studio.
2. **Push to GitHub**: If you downloaded a ZIP, initialize a git repo and push it to GitHub.
3. **Connect to Vercel**:
   - Go to the Vercel Dashboard.
   - Click "New Project".
   - Import your GitHub repository.
4. **Configure Project**:
   - **Framework Preset**: Vercel should automatically detect **Vite**.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   - If you use the Gemini API, add `GEMINI_API_KEY` to your Vercel project settings.
6. **Deploy**: Click "Deploy".

### SPA Routing
The included `vercel.json` ensures that all routes are redirected to `index.html`, allowing React Router (if added later) or other client-side logic to work correctly on Vercel.
