# AEO Content Studio

Generate AI-optimized publishing kits with a single click. This tool creates AEO (Answer Engine Optimization) content structured for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.

## Features

- **AEO-Optimized Articles**: Generates content with bolded direct answers, frequent lists, and high entity density
- **Social Media Copy**: Ready-to-paste content for Medium and LinkedIn
- **Image Generation**: Optional DALL-E 3 integration for article images
- **Copy Buttons**: One-click copy for Markdown, HTML, and social media formats

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **AI**: Google Gemini API (text), OpenAI DALL-E 3 (images, optional)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

**Get your free Gemini API key**: https://makersuite.google.com/app/apikey

### 3. Run the Application

```bash
npm start
```

Visit `http://localhost:3000` in your browser.

## Usage

1. Enter your **Topic/Question** (e.g., "How to improve website SEO in 2024")
2. Enter your **Business Type/Industry** (e.g., "Digital Marketing Agency")
3. Optionally expand "Call to Action Details" to add contact information
4. Optionally expand "Image Generation" and add your OpenAI API key for DALL-E images
5. Click **Generate Content Kit**

## Output

The tool generates:

- **Article Tab**: Full AEO-optimized blog post with copy buttons for Markdown and HTML
- **Social Media Tab**: Formatted copy for Medium (title, subtitle, intro) and LinkedIn (emoji-enriched post with hashtags)
- **Image Tab**: AI-generated article image (if OpenAI key provided) with download button

## Deployment to Netlify

This app requires a Node.js backend, so for Netlify deployment you'll need to use Netlify Functions:

1. Create a `netlify.toml` file (included)
2. Move server logic to `netlify/functions/generate.js`
3. Deploy via GitHub integration

## API Endpoints

- `POST /api/generate` - Generate content kit
- `GET /api/health` - Health check

## License

MIT
