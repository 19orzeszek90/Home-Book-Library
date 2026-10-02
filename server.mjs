
import express from 'express';
import pg from 'pg';
import cors from 'cors';
import multer from 'multer';
import csv from 'fast-csv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import axios from 'axios';
import dotenv from 'dotenv';
import { scanByIsbn } from './scraper-service.js';
import { betterAuth } from "better-auth";
import { twoFactor, admin } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";

dotenv.config();

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const streamPipeline = promisify(pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ─── Better-Auth setup ───
const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || "dev_better_auth_secret",
  baseURL: process.env.BETTER_AUTH_URL || "http://patryk-ubuntu:3001",
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  // Tables will be created on first use
  plugins: [
    twoFactor({ issuer: "HomeBookLibrary" }),
    admin({ defaultRole: "user", adminRole: "admin" }),
  ],
});

// Better-Auth API routes
app.all("/api/auth/*", toNodeHandler(auth));

// Require auth middleware
async function requireAuth(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return res.status(401).json({ error: "Authentication required" });
  req.user = session.user;
  req.session = session.session;
  next();
}

// Require admin middleware
async function requireAdmin(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || session.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  req.user = session.user;
  next();
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => { req.setTimeout(300000); res.setTimeout(300000); next(); });
app.use(express.static(path.join(__dirname, 'dist')));

const COVERS_DIR = path.join(__dirname, 'storage', 'covers');
app.use('/storage/covers', express.static(COVERS_DIR));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

const fileUpload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB limit

const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, COVERS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const coverUpload = multer({ storage: coverStorage });

const deleteCover = (iconPath) => {
    if (iconPath && iconPath.startsWith('/storage/covers/')) {
        const filename = path.basename(iconPath);
        const filepath = path.join(COVERS_DIR, filename);
        fs.unlink(filepath, (err) => {
            if (err) console.error(`Failed to delete cover: ${filepath}`, err);
        });
    }
};

const downloadImage = async (url) => {
    try {
        const response = await axios({ method: 'GET', url, responseType: 'stream' });
        const extension = path.extname(new URL(url).pathname) || '.jpg';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;
        const filepath = path.join(COVERS_DIR, filename);
        await streamPipeline(response.data, fs.createWriteStream(filepath));
        return `/storage/covers/${filename}`;
    } catch (error) {
        console.error(`Failed to download image from ${url}:`, error.message);
        return null;
    }
};

const processCoverImage = async (imageUrl, oldIconPath) => {
    let newIconPath = oldIconPath;
    let needsUpdate = false;

    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        const downloadedPath = await downloadImage(imageUrl);
        if (downloadedPath) {
            newIconPath = downloadedPath;
            needsUpdate = true;
        }
    } else if (imageUrl && imageUrl.startsWith('/storage/covers/')) {
        if (imageUrl !== oldIconPath) {
            newIconPath = imageUrl;
            needsUpdate = true;
        }
    } else if (imageUrl === '') {
        newIconPath = null;
        needsUpdate = true;
    }

    if (needsUpdate && oldIconPath && oldIconPath !== newIconPath) {
        deleteCover(oldIconPath);
    }
    
    return newIconPath;
};

const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT to_regclass('public.books')`);
        if (res.rows[0].to_regclass === null) {
            await client.query(`
                CREATE TABLE books (
                    "ID" SERIAL PRIMARY KEY, "Title" TEXT NOT NULL, "Author" TEXT NOT NULL, "Publisher" TEXT,
                    "Published Date" TEXT, "Format" TEXT, "Pages" INTEGER, "Series" TEXT, "Volume" INTEGER,
                    "Language" TEXT, "ISBN" TEXT, "Page Read" INTEGER, "Item Url" TEXT, "Icon Path" TEXT,
                    "Photo Path" TEXT, "Image Url" TEXT, "Summary" TEXT, "Location" TEXT, "Price" REAL,
                    "Genres" TEXT, "Rating" REAL, "Added Date" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    "Copy Index" INTEGER, "Read" BOOLEAN DEFAULT false, "Started Reading Date" DATE,
                    "Finished Reading Date" DATE, "Favorite" BOOLEAN DEFAULT false, "Comments" TEXT,
                    "Tags" TEXT, "BookShelf" TEXT, "Settings" TEXT, "is_wishlist" BOOLEAN DEFAULT false
                );
            `);
        }
        // Create borrowings table if not exists
        const borrowRes = await client.query(`SELECT to_regclass('public.borrowings')`);
        if (borrowRes.rows[0].to_regclass === null) {
            await client.query(`
                CREATE TABLE borrowings (
                    "ID" SERIAL PRIMARY KEY,
                    "BookID" INTEGER NOT NULL REFERENCES books("ID") ON DELETE CASCADE,
                    "BorrowerName" TEXT NOT NULL,
                    "Phone" TEXT,
                    "Email" TEXT,
                    "BorrowDate" DATE NOT NULL,
                    "DueDate" DATE NOT NULL,
                    "ReturnedDate" DATE,
                    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
        }
    } catch (err) {
        console.error('Error during database initialization:', err);
        process.exit(1);
    } finally {
        client.release();
    }
};

app.get('/api/books', async (req, res) => {
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        const userId = session?.user?.id;
        let query;
        let params = [];
        if (userId) {
            query = 'SELECT * FROM books WHERE "UserId" = $1 ORDER BY "ID" ASC';
            params = [userId];
        } else {
            query = 'SELECT * FROM books ORDER BY "ID" ASC';
        }
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get unique bookshelves
app.get('/api/bookshelves', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT "BookShelf" FROM books WHERE "BookShelf" IS NOT NULL AND "BookShelf" != \'\' ORDER BY "BookShelf"');
        res.json(result.rows.map(r => r.BookShelf));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/books', async (req, res) => {
    const book = req.body;
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        if (session?.user?.id) book['UserId'] = session.user.id;
        const newIconPath = await processCoverImage(book['Image Url'], null);
        book['Icon Path'] = newIconPath;
        book['Photo Path'] = newIconPath;
        delete book['Image Url'];

        const validColumns = Object.keys(book).filter(k => k !== 'ID' && book[k] !== undefined);
        const columns = validColumns.map(k => `"${k}"`).join(', ');
        const placeholders = validColumns.map((_, i) => `$${i + 1}`).join(', ');
        const values = validColumns.map(k => book[k]);

        const query = `INSERT INTO books (${columns}) VALUES (${placeholders}) RETURNING *`;
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to add book' });
    }
});

app.put('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    const book = req.body;
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        const ownerRes = await pool.query('SELECT "UserId" FROM books WHERE "ID" = $1', [id]);
        if (session?.user?.id && ownerRes.rows[0]?.UserId && ownerRes.rows[0].UserId !== session.user.id) {
            return res.status(403).json({ error: 'Not your book' });
        }
        const oldBookRes = await pool.query('SELECT "Icon Path" FROM books WHERE "ID" = $1', [id]);
        if (oldBookRes.rows.length === 0) return res.status(404).json({ error: 'Book not found' });
        
        const oldIconPath = oldBookRes.rows[0]['Icon Path'];
        const newIconPath = await processCoverImage(book['Image Url'], oldIconPath);
        book['Icon Path'] = newIconPath;
        book['Photo Path'] = newIconPath;
        book['Image Url'] = null;
        
        const validUpdateKeys = Object.keys(book).filter(key => book[key] !== undefined && key !== 'ID');
        const setClauses = validUpdateKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const values = validUpdateKeys.map(k => book[k]);

        if (values.length === 0) {
            const result = await pool.query('SELECT * FROM books WHERE "ID" = $1', [id]);
            return res.json(result.rows[0]);
        }

        const query = `UPDATE books SET ${setClauses} WHERE "ID" = $${values.length + 1} RETURNING *`;
        const result = await pool.query(query, [...values, id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update book' });
    }
});

// New Bulk Update Endpoint
app.patch('/api/books/bulk', async (req, res) => {
    const { ids, updates } = req.body;
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id;
    // Filter to only user's books if logged in
    let filteredIds = ids;
    if (userId) {
        const owned = await pool.query('SELECT "ID" FROM books WHERE "ID" = ANY($1::int[]) AND "UserId" = $2', [ids, userId]);
        filteredIds = owned.rows.map(r => r.ID);
        if (filteredIds.length === 0) return res.status(403).json({ error: 'Not your books' });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !updates) {
        return res.status(400).json({ error: 'Valid IDs array and updates object required.' });
    }

    const client = await pool.connect();
    try {
    await client.query('BEGIN');
        
        const validKeys = Object.keys(updates).filter(k => updates[k] !== undefined);
        if (validKeys.length > 0) {
            const setClauses = validKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
            const values = validKeys.map(k => updates[k]);
            const query = `UPDATE books SET ${setClauses} WHERE "ID" = ANY($${validKeys.length + 1}::int[])`;
            await client.query(query, [...values, ids]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Bulk update successful' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Bulk update error:', err);
        res.status(500).json({ error: 'Bulk update failed' });
    } finally {
        client.release();
    }
});

app.delete('/api/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const session = await auth.api.getSession({ headers: req.headers });
        const ownerRes = await pool.query('SELECT "UserId" FROM books WHERE "ID" = $1', [id]);
        if (session?.user?.id && ownerRes.rows[0]?.UserId && ownerRes.rows[0].UserId !== session.user.id) {
            return res.status(403).json({ error: 'Not your book' });
        }
    } catch (e) { return res.status(403).json({ error: 'Not your book' }); }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const bookRes = await client.query('SELECT "Icon Path" FROM books WHERE "ID" = $1', [id]);
        if (bookRes.rows.length > 0) deleteCover(bookRes.rows[0]['Icon Path']);
        await client.query('DELETE FROM books WHERE "ID" = $1', [id]);
        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to delete book' });
    } finally {
        client.release();
    }
});

app.delete('/api/books', async (req, res) => {
    const { ids } = req.body;
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id;
    let filteredIds = ids;
    if (userId) {
        const owned = await pool.query('SELECT "ID" FROM books WHERE "ID" = ANY($1::int[]) AND "UserId" = $2', [ids, userId]);
        filteredIds = owned.rows.map(r => r.ID);
        if (filteredIds.length === 0) return res.status(403).json({ error: 'Not your books' });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Book IDs required' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const booksRes = await client.query('SELECT "Icon Path" FROM books WHERE "ID" = ANY($1::int[])', [ids]);
        for (const row of booksRes.rows) deleteCover(row['Icon Path']);
        await client.query('DELETE FROM books WHERE "ID" = ANY($1::int[])', [filteredIds]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'Books deleted' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Bulk delete failed' });
    } finally {
        client.release();
    }
});

app.post('/api/books/import', fileUpload.single('csvfile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    const client = await pool.connect();
    let newBooksCount = 0;
    try {
        await client.query('BEGIN');
        const stream = fs.createReadStream(req.file.path).pipe(csv.parse({ headers: true, bom: true, ignoreEmpty: true }));
        for await (const row of stream) {
            const iconPath = await processCoverImage(row['Image Url'], null);
            row['Icon Path'] = iconPath;
            row['Photo Path'] = iconPath;
            delete row['Image Url'];
            const validColumns = Object.keys(row).filter(k => k !== 'ID' && row[k] !== '');
            const columns = validColumns.map(k => `"${k}"`).join(', ');
            const placeholders = validColumns.map((_, i) => `$${i + 1}`).join(', ');
            await client.query(`INSERT INTO books (${columns}) VALUES (${placeholders})`, validColumns.map(k => row[k]));
            newBooksCount++;
        }
        await client.query('COMMIT');
        res.json({ newBooksCount });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
        fs.unlink(req.file.path, () => {});
    }
});

app.get('/api/books/export', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM books ORDER BY "ID" ASC');
        // Force UTF-8 encoding with BOM for Excel compatibility
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="export.csv"`);
        res.write('\ufeff'); // Write UTF-8 BOM
        csv.write(result.rows, { headers: true }).pipe(res);
    } catch (err) {
        res.status(500).json({ error: 'Export failed' });
    }
});

app.post('/api/upload-cover', coverUpload.single('cover'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ path: `/storage/covers/${req.file.filename}` });
});

app.get('/api/books/backup/full', async (req, res) => {
    try {
        const { rows: books } = await pool.query('SELECT * FROM books ORDER BY "ID" ASC');
        // Remove internal UserId from backup data
        for (const book of books) {
            delete book['UserId'];
        }
        const images = {};
        for (const book of books) {
            if (book['Icon Path'] && book['Icon Path'].startsWith('/storage/covers/')) {
                const filename = path.basename(book['Icon Path']);
                const filepath = path.join(COVERS_DIR, filename);
                try {
                    const data = await fsPromises.readFile(filepath);
                    images[filename] = `data:image/jpeg;base64,${data.toString('base64')}`;
                    book['Icon Path'] = filename;
                } catch (e) {}
            }
        }
        res.json({ books, images });
    } catch (err) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

// SSE progress system
const progressClients = new Set();
function sendProgress(msg) {
    const json = JSON.stringify(msg);
    for (const client of progressClients) {
        try { client.write(`data: ${json}\n\n`); } catch (e) {}
    }
}
app.get('/api/restore/progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    progressClients.add(res);
    req.on('close', () => progressClients.delete(res));
});

app.post('/api/books/restore/full', fileUpload.single('restorefile'), async (req, res) => {
    const client = await pool.connect();
    try {
        sendProgress({ step: 'parsing', message: 'Parsing backup file...' });
        const data = JSON.parse(await fsPromises.readFile(req.file.path, 'utf8'));
        sendProgress({ step: 'writing-images', message: `Restoring ${Object.keys(data.images).length} cover images...` });
        for (const [name, b64] of Object.entries(data.images)) {
            await fsPromises.writeFile(path.join(COVERS_DIR, name), Buffer.from(b64.split(',')[1], 'base64'));
        }
        console.log('[RESTORE] Starting restore of', data.books.length, 'books with', Object.keys(data.images).length, 'images');
        await client.query('BEGIN');
        sendProgress({ step: 'inserting', current: 0, total: data.books.length, message: `Restoring books (0/${data.books.length})...` });
        let inserted = 0;
        for (const book of data.books) {
            if (book['Icon Path'] && !book['Icon Path'].startsWith('/')) book['Icon Path'] = `/storage/covers/${book['Icon Path']}`;
            console.log('[RESTORE] Processing book:', book.Title || book['Title'], 'ID:', book.ID);
            delete book.ID;
            if (!book['UserId']) {
                const session = await auth.api.getSession({ headers: req.headers });
                if (session?.user?.id) book['UserId'] = session.user.id;
                console.log('[RESTORE] Added UserId:', book['UserId']);
            }
            // Filter out null/undefined keys, but keep empty strings
            // Also remove keys that don't exist in the table
            const knownColumns = ['Title', 'Author', 'Publisher', 'Published Date', 'Format', 'Pages', 'Series', 'Volume',
                'Language', 'ISBN', 'Page Read', 'Item Url', 'Icon Path', 'Photo Path', 'Image Url', 'Summary',
                'Location', 'Price', 'Genres', 'Rating', 'Added Date', 'Copy Index', 'Read', 'Started Reading Date',
                'Finished Reading Date', 'Favorite', 'Comments', 'Tags', 'BookShelf', 'Settings', 'is_wishlist',
                'UserId'];
            const keys = Object.keys(book).filter(k => book[k] !== null && book[k] !== undefined && knownColumns.includes(k));
            const values = keys.map(k => book[k]);
            try {
                const result = await client.query(
                    `INSERT INTO books (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
                    values
                );
                console.log('[RESTORE] Inserted:', result.rows[0]?.ID || 'OK');
            } catch (insertErr) {
                console.error('[RESTORE] Insert failed for book:', book.Title, '-', insertErr.message);
                throw insertErr;
            }
            inserted++;
            if (inserted % 10 === 0 || inserted === data.books.length) {
                sendProgress({ step: 'inserting', current: inserted, total: data.books.length, message: `Restoring books (${inserted}/${data.books.length})...` });
            }
        }
        sendProgress({ step: 'images', message: 'Restoring cover images...' });
        await client.query('COMMIT');
        res.json({ message: 'Restored' });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: e.message });
    } finally {
        client.release();
    }
});

app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    try {
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20`);
        const results = (response.data.items || []).map(item => {
            const vi = item.volumeInfo;
            return {
                title: vi.title, authors: vi.authors || [], publisher: vi.publisher, publishedDate: vi.publishedDate,
                summary: vi.description, isbn: vi.industryIdentifiers?.[0]?.identifier, pages: vi.pageCount,
                imageUrl: vi.imageLinks?.thumbnail?.replace('http:', 'https:'), rating: vi.averageRating
            };
        });
        res.json(results);
    } catch (e) {
        // Google Books API niedostępne (quota exceeded itd.) — zwróć puste wyniki
        // Frontend pokaże wtedy opcję scrapra zamiast błędu
        res.json([]);
    }
});

// Skanowanie ISBN przez scraper
app.get('/api/scan-isbn/:isbn', async (req, res) => {
    const { isbn } = req.params;
    try {
        const result = await scanByIsbn(isbn);
        if (result.data) {
            // Success: return book data + logs
            res.json({ ...result.data, _logs: result.logs || [] });
        } else {
            // Error: return error + logs
            res.status(404).json({ error: result.error, _logs: result.logs || [] });
        }
    } catch (e) {
        res.status(500).json({ error: e.message, _logs: [] });
    }
});

// DODAWANIE KSIĄŻKI (z aplikacji mobilnej)
app.post('/api/books', async (req, res) => {
    const { Title, Author, ISBN, "Icon Path": iconPath } = req.body;
    
    if (!Title) {
        return res.status(400).json({ error: 'Tytuł jest wymagany' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Jeśli okładka to link zewnętrzny, pobierz ją (używamy Twojej logiki processCoverImage)
        let finalIconPath = iconPath;
        if (iconPath && iconPath.startsWith('http')) {
            // Uwaga: processCoverImage musi być dostępne w tym pliku
            // Jeśli nie, po prostu zapiszemy link lub dodamy logikę pobierania
            finalIconPath = iconPath; // Tymczasowo sam link
        }

        const result = await client.query(
            'INSERT INTO books ("Title", "Author", "ISBN", "Icon Path") VALUES ($1, $2, $3, $4) RETURNING "ID"',
            [Title, Author, ISBN, finalIconPath]
        );
        
        await client.query('COMMIT');
        res.status(201).json({ id: result.rows[0].ID, message: 'Książka dodana!' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Błąd dodawania książki:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/auth/get-session', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers });
    res.json(session || { user: null, session: null });
});

// ─── User management endpoints (admin only) ───
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, role, banned, "createdAt" FROM "user" ORDER BY "createdAt" DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    try {
        await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [role, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
    const { banned } = req.body;
    try {
        if (banned) {
            await pool.query('UPDATE "user" SET banned = true, "banReason" = $1 WHERE id = $2', ['Banned by admin', req.params.id]);
        } else {
            await pool.query('UPDATE "user" SET banned = false, "banReason" = NULL WHERE id = $2', [req.params.id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user (admin only, cannot delete admins)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userRes = await pool.query('SELECT role FROM "user" WHERE id = $1', [req.params.id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        if (userRes.rows[0].role === 'admin') return res.status(403).json({ error: 'Cannot delete admin users' });
        await pool.query('DELETE FROM "user" WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reset user password (admin only)
app.put('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
        // Use better-auth API to update password
        const result = await auth.api.updateUser({
            body: { userId: req.params.id, password: newPassword },
            headers: req.headers,
        });
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        // Fallback: direct DB update (better-auth hashes internally)
        // We'll use the fetch approach instead
        res.status(500).json({ error: 'Failed to reset password: ' + err.message });
    }
});

// ─── Borrowing endpoints ───

app.get('/api/borrowings', async (req, res) => {
    try {
        const result = await pool.query('SELECT b.*, books."Title", books."Author" FROM borrowings b LEFT JOIN books ON b."BookID" = books."ID" ORDER BY b."BorrowDate" DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/borrowings/active', async (req, res) => {
    try {
        const result = await pool.query('SELECT b.*, books."Title", books."Author" FROM borrowings b LEFT JOIN books ON b."BookID" = books."ID" WHERE b."ReturnedDate" IS NULL ORDER BY b."DueDate" ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/borrowings/book/:bookId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM borrowings WHERE "BookID" = $1 AND "ReturnedDate" IS NULL', [req.params.bookId]);
        res.json(result.rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/borrowings', async (req, res) => {
    const { bookId, borrowerName, phone, email, borrowDate, dueDate } = req.body;
    if (!bookId || !borrowerName || !borrowDate || !dueDate) {
        return res.status(400).json({ error: 'bookId, borrowerName, borrowDate and dueDate are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO borrowings ("BookID", "BorrowerName", "Phone", "Email", "BorrowDate", "DueDate")
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [bookId, borrowerName, phone || null, email || null, borrowDate, dueDate]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/borrowings/:id/return', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE borrowings SET "ReturnedDate" = CURRENT_DATE WHERE "ID" = $1 AND "ReturnedDate" IS NULL RETURNING *`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Borrowing not found or already returned' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/borrowings/:id', async (req, res) => {
    const { borrowerName, phone, email, dueDate } = req.body;
    try {
        const result = await pool.query(
            `UPDATE borrowings SET "BorrowerName" = COALESCE($1, "BorrowerName"), "Phone" = $2, "Email" = $3, "DueDate" = COALESCE($4, "DueDate") WHERE "ID" = $5 RETURNING *`,
            [borrowerName || null, phone !== undefined ? phone : null, email !== undefined ? email : null, dueDate || null, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Borrowing not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/borrowings/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM borrowings WHERE "ID" = $1', [req.params.id]);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

async function setupBetterAuth() {
    for (let i = 0; i < 10; i++) {
        try {
            const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
            if (toBeCreated.length > 0 || toBeAdded.length > 0) {
                console.log(`[DB] Creating ${toBeCreated.length} tables, adding ${toBeAdded.length} columns...`);
                await runMigrations();
                console.log('[DB] Better-Auth schema ready.');
            } else {
                console.log('[DB] Better-Auth schema is up to date.');
            }
            // admin@library.local already seeded via normal registration
            return;
        } catch (err) {
            console.warn(`[DB] DB not ready (attempt ${i + 1}/10): ${err.message}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error('Failed to initialize Better-Auth schema after 10 attempts');
}

async function startServer() {
    await setupBetterAuth();
    initializeDatabase();
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

startServer().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});

