# Bookmark Manager

A comprehensive bookmark manager built with Astro, React, and Tailwind CSS. Features both web application and browser extension with MongoDB sync and offline localStorage fallback.

## 🚀 Features

### Core Features
- ✅ **Add, Edit, Delete Bookmarks** - Full CRUD operations
- 🔍 **Advanced Search** - Full-text search across titles, URLs, descriptions, and tags
- 🏷️ **Tags & Folders** - Organize bookmarks with tags and folder structure
- 📝 **Notes** - Add descriptions and notes to bookmarks
- 📊 **Visit Tracking** - Track visit count and last visited date

### Sync & Storage
- ☁️ **MongoDB Cloud Sync** - Sync bookmarks across devices
- 💾 **Local Storage Fallback** - Works offline with localStorage
- 🔄 **Auto-sync** - Automatic synchronization when online
- 📱 **PWA Support** - Install as a Progressive Web App

### Import/Export
- 📥 **Import** - Import from JSON, Chrome, Firefox (Netscape HTML)
- 📤 **Export** - Export to JSON format
- 🔄 **Duplicate Detection** - Automatic duplicate detection and removal
- 🔗 **Dead Link Checker** - Validate bookmark URLs

### Browser Extension
- 🌐 **Chrome & Firefox** - Browser extension for quick saving
- ⌨️ **Keyboard Shortcuts** - Ctrl+Shift+B to save current page
- 🖱️ **Context Menu** - Right-click to save bookmarks
- 🔔 **Notifications** - Visual feedback for saved bookmarks

### UI/UX
- 🌙 **Dark Mode** - Toggle between light and dark themes
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- ⚡ **Fast Search** - Instant search with debouncing
- 🎨 **Modern UI** - Clean, intuitive interface with Tailwind CSS

## 🛠️ Tech Stack

- **Frontend**: Astro + React + TypeScript
- **Styling**: Tailwind CSS
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT with email/password
- **Deployment**: Vercel-ready
- **Extension**: Chrome Extension Manifest V3

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- MongoDB database (local or cloud)
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bookmark-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/bookmarks
   JWT_SECRET=your-super-secret-jwt-key-here
   APP_URL=http://localhost:3000
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

## 🌐 Deployment

### Vercel Deployment

1. **Connect to Vercel**
   - Import your GitHub repository to Vercel
   - Set environment variables in Vercel dashboard

2. **Environment Variables**
   ```
   MONGODB_URI=your-mongodb-connection-string
   JWT_SECRET=your-jwt-secret
   APP_URL=https://your-app.vercel.app
   ```

3. **Deploy**
   - Vercel will automatically deploy on push to main branch

### Manual Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Deploy the `dist/` folder** to your hosting provider

## 🔧 Browser Extension

### Development

1. **Build extension**
   ```bash
   npm run build:extension
   ```

2. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder

3. **Load in Firefox**
   - Open `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select `extension/manifest.json`

### Features

- **Quick Save**: Click extension icon to save current page
- **Keyboard Shortcut**: `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
- **Context Menu**: Right-click any page or link to save
- **Auto-sync**: Syncs with web app when authenticated

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### Bookmarks
- `GET /api/bookmarks` - Get user bookmarks (with search/filter)
- `POST /api/bookmarks` - Create new bookmark
- `GET /api/bookmarks/[id]` - Get specific bookmark
- `PUT /api/bookmarks/[id]` - Update bookmark
- `DELETE /api/bookmarks/[id]` - Delete bookmark

### Query Parameters
- `search` - Full-text search
- `tags` - Filter by tags (comma-separated)
- `folder` - Filter by folder
- `page` - Pagination page number
- `limit` - Results per page

## 🎯 Usage

### Web Application

1. **Register/Login** - Create account or login
2. **Add Bookmarks** - Click "Add Bookmark" button
3. **Search & Filter** - Use search bar and filters
4. **Organize** - Add tags and folders
5. **Import/Export** - Use toolbar buttons

### Browser Extension

1. **Install Extension** - Load in Chrome/Firefox
2. **Save Bookmarks** - Click extension icon or use Ctrl+Shift+B
3. **Sync** - Login to sync with web app
4. **Quick Access** - Right-click context menu

## 🔒 Security Features

- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt rounds
- **Input Validation** - Server-side validation
- **CORS Protection** - Configured CORS policies
- **Environment Variables** - Secure config management

## 🚧 Development

### Project Structure
```
bookmark-manager/
├── src/
│   ├── components/          # React components
│   ├── lib/                # Utilities and models
│   ├── pages/              # Astro pages and API routes
│   └── layouts/            # Astro layouts
├── extension/              # Browser extension
├── public/                 # Static assets
└── scripts/               # Build scripts
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run build:extension` - Build browser extension

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/bookmark-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/bookmark-manager/discussions)
- **Email**: your-email@example.com

## 🎉 Acknowledgments

- [Astro](https://astro.build/) - Web framework
- [React](https://reactjs.org/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [MongoDB](https://www.mongodb.com/) - Database
- [Vercel](https://vercel.com/) - Deployment platform

