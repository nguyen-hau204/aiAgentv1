# GoogleSlideAI (Web)

`GoogleSlideAI` là web app Next.js để tạo slide tiếng Việt bằng Gemini và xuất `.pptx` bằng PptxGenJS.

## Yêu cầu

- Node.js 20+
- NPM
- Gemini API key

## Cài đặt

```bash
npm install
copy .env.example .env.local
```

Thêm API key vào `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key
```

## Chạy web

```bash
npm run dev
```

Mở:

```text
http://localhost:3000
```

## Build production

```bash
npm run build
npm run start
```
