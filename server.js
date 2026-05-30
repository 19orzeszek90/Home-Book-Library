
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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

const COVERS_DIR = path.join(__dirname, 'storage', 'covers');
app.use('/storage/covers', express.static(COVERS_DIR));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

const fileUpload = multer({ dest: UPLOADS_DIR });

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
        const result = await pool.query('SELECT * FROM books ORDER BY "ID" ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/books', async (req, res) => {
    const book = req.body;
    try {
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
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Book IDs required' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const booksRes = await client.query('SELECT "Icon Path" FROM books WHERE "ID" = ANY($1::int[])', [ids]);
        for (const row of booksRes.rows) deleteCover(row['Icon Path']);
        await client.query('DELETE FROM books WHERE "ID" = ANY($1::int[])', [ids]);
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

app.post('/api/books/restore/full', fileUpload.single('restorefile'), async (req, res) => {
    const client = await pool.connect();
    try {
        const data = JSON.parse(await fsPromises.readFile(req.file.path, 'utf8'));
        for (const [name, b64] of Object.entries(data.images)) {
            await fsPromises.writeFile(path.join(COVERS_DIR, name), Buffer.from(b64.split(',')[1], 'base64'));
        }
        await client.query('BEGIN');
        for (const book of data.books) {
            if (book['Icon Path'] && !book['Icon Path'].startsWith('/')) book['Icon Path'] = `/storage/covers/${book['Icon Path']}`;
            delete book.ID;
            const keys = Object.keys(book).filter(k => book[k] !== null);
            await client.query(`INSERT INTO books (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(k => book[k]));
        }
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

// Skanowanie ISBN przez scraper (zamiennik Gemini AI)
app.get('/api/scan-isbn/:isbn', async (req, res) => {
    const { isbn } = req.params;
    try {
        const result = await scanByIsbn(isbn);
        if (result.error) {
            return res.status(404).json({ error: result.error });
        }
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
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

app.listen(port, () => {
    initializeDatabase();
    console.log(`Server is running on http://localhost:${port}`);
});

