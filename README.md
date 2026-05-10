# LUMEN V2 — Setup & Deployment Guide

## ما اتغيّر في V2
- ✅ Supabase بدل MongoDB (database + file storage)
- ✅ Groq Whisper — audio transcription حقيقية
- ✅ PDF parsing — الـ AI بيقرأ PDF attachments
- ✅ Rate limiting — حماية من spam على الـ API
- ✅ Regenerate bug fix — بيشتغل من DRAFT و NEEDS_REVISION
- ✅ Error boundary — مفيش spinner للأبد لو الـ API فشل
- ✅ PublicBrief — بيعرض project_title / complexity / timeline
- ✅ API keys — اتشالوا من الكود، لازم تحطهم في .env

---

## Step 1 — Supabase Setup

1. روح [supabase.com](https://supabase.com) واعمل project جديد
2. Settings → API → انسخ:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`
3. SQL Editor → New Query → الصق محتوى `supabase_schema.sql` → Run
4. Storage → New bucket → اسمه `lumen-attachments` → Public: **ON**

---

## Step 2 — Local Development

```bash
# Backend
cd backend
npm install
cp .env.example .env      # عدّل القيم الحقيقية جوا
node src/seed.js           # ينشئ super admin + department + user
npm run dev                # يشتغل على port 3000

# Frontend (terminal تاني)
cd frontend
npm install
npm run dev                # يشتغل على port 5173
```

**Test credentials (بعد seed):**
- `sara@lumen.app` / `userpassword123` — Studio user
- `admin@lumen.app` / `adminpassword123` — Admin
- `super@lumen.app` / `superpassword123` — Super Admin

---

## Step 3 — Deploy Backend على Railway

1. ارفع الكود على GitHub repo خاص (backend folder)
2. روح [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Root Directory: `backend`
4. Railway هيلاقي `railway.json` تلقائياً ويستخدمه
5. Variables → Add Variables → أضف كل variables من `backend/.env.example`:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_STORAGE_BUCKET=lumen-attachments
   JWT_SECRET=...
   GROQ_API_KEY=...
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-2.5-flash
   NODE_ENV=production
   FRONTEND_URL=https://your-frontend.vercel.app
   ```
6. بعد deploy ناجح، انسخ الـ URL
7. Verify: افتح `https://your-backend.up.railway.app/health` — لازم يرجع `{"status":"ok"}`

---

## Step 4 — Deploy Frontend على Vercel

1. روح [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Root Directory: `frontend`
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Environment Variables:
   ```
   VITE_API_URL=https://your-backend.up.railway.app
   ```
   ⚠️ مفيش trailing slash في الـ URL
7. Deploy → انسخ الـ Vercel URL

---

## Step 5 — ربط Backend بالـ Frontend URL

1. ارجع على Railway → Variables
2. عدّل `FRONTEND_URL` → `https://your-app.vercel.app`
3. Railway هيعمل redeploy تلقائي

---

## ملاحظات مهمة

- `SUPABASE_SERVICE_ROLE_KEY` — **لا تعرضه في الـ frontend أبداً**، backend فقط
- الـ `vercel.json` موجود في `frontend/` وبيعمل SPA routing صح — بدونه كل route غير الـ home هيدي 404
- الـ Groq Whisper بيتعامل مع Arabic تلقائياً (`language: 'ar'`)
- الـ PDF parsing بيشتغل لـ text-based PDFs فقط — الـ scanned PDFs محتاجة OCR
- لو الـ audio transcription فشلت، الـ error بيتسجل لكن الـ brief بيكمّل
- الـ CORS configured يقبل بس من `FRONTEND_URL` — لو غلط هيديك 403
