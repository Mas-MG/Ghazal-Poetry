===========================================
📜 GHAZAL BOT - NESTJS TELEGRAM POETRY BOT
===========================================

📝 PROJECT DESCRIPTION
----------------------
Ghazal is a Telegram-based poetry bot built with NestJS, MongoDB, and Telegraf. It allows users to submit poems with their respective poets and categories, and schedule poetry to be automatically sent to Telegram channels that have added the bot. The bot supports category-based filtering and approval flow for content moderation.

An Angular front-end is available for introducing the bot and guiding users on how to use it.

📌 KEY FEATURES
---------------
- Submit poems with poet and category information.
- Admin approval system for submitted poems.
- Add the bot to a Telegram channel and schedule automatic poem posting.
- Choose poem categories for each channel.
- Menu system within the bot:
  - ➕ Send Poem
  - ❓ Help
  - 📣 Add Bot to Channel
  - 📋 View My Channels

🛠️ TECHNOLOGIES USED
---------------------
- **NestJS** – Backend framework
- **MongoDB (Mongoose)** – Database for storing poems and channel data
- **Telegraf.js** – Telegram Bot framework
- **Angular** – Front-end for introducing the bot
- **Swagger** – API documentation
- **dotenv / ConfigService** – Environment configuration and secure token handling

🚀 HOW TO USE THE BOT
----------------------
1. Start the bot in Telegram by searching: **@GhazalPoetry_Bot**
2. Use the menu to:
   - Submit a poem (title, poet, and category)
   - Get help with usage
   - Add the bot to a Telegram channel
   - View your added channels

3. When adding the bot to a channel:
   - Provide a schedule (e.g., 9-18pm)
   - Choose the categories of poems you'd like to receive
   - The bot will begin sending approved poems from those categories to the channel

🛡️ ADMIN PANEL (BACKEND)
-------------------------
- All submitted poems are stored in the database as **not approved** by default.
- Admins can view and approve/unapprove or edit poems.
- Approved poems will be sent according to channel settings.

🧾 API DOCUMENTATION (SWAGGER)
------------------------------
- The backend exposes Swagger documentation for the REST API.
- It is secured by an access token (Bearer token).
- To access Swagger:
  1. Start the NestJS server.
  2. Visit: `http://localhost:5500/api`
  3. Use the provided token to authorize protected routes.
  
  Common endpoints:
  - `GET /poems` – Get all poems
  - `GET /poems/unapproved` – Get all unapproved poems
  - `GET /poems/category/:category` – Get poems by category
  - `GET /channels` – View all channels
  - `GET /channels/:id` – View a specific channel

🧪 DEVELOPMENT SETUP
---------------------
1. Clone the repository.
2. Set up `.env` file with the following:
   - `MONGO_URI`
   - `API_TOKEN` (for Swagger auth)
   - `BOT_TOKEN` (Telegram bot token)

3. Install dependencies:
   ```bash
   npm install
