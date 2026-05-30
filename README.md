
# 📚 Home Book Library

<p align="center">
  <img src="screenshot.jpg" alt="Home Book Library App Preview" width="800">
</p>

A professional, high-performance web application designed for bibliophiles who need more than just a list. Home Book Library is a complete ecosystem for cataloging, managing, borrowing, and discovering your collection — no AI required.

---

## 🚀 Key Features

### 💎 Intelligent Collection Management
- **Library & Wishlist:** Separate your current collection from your future reads.
- **Collection View:** Automatically groups books into series and cycles, sorted by volume number. Collapsible sections keep the interface clean.
- **Dynamic Views:** Choose between `Compact`, `Default`, or `Cozy` grid sizes.

### 📖 Quick Scan (ISBN)
- **ISBN Barcode Scanner:** Scan or type an ISBN → automatically fetches book data.
- **No AI, No API Keys:** Uses OpenLibrary (free API) as primary source, enriches data from lubimyczytac.pl (ratings, series, translator, format, cover).
- **Fallback Chain:** OpenLibrary → Startpage search → lubimyczytac.pl HTML scrape (JSON-LD + data-ga-* attributes). If nothing found, allows manual entry.
- **Polish Books Support:** Full support for Polish editions — ratings, publishers, translators, categories.

### 📖 Book Borrowing Module
- **Track Borrowings:** Log who borrowed which book, with phone and email contact info.
- **Borrow / Extend / Return:** One-click return from book detail or Command Center.
- **Active Borrowings View:** Command Center shows only currently borrowed books with due dates. Overdue books are highlighted in red.
- **Persistent History:** All borrowings stored in PostgreSQL alongside your library.

### 🛠️ Professional Command Center
- **Bulk Operations:** Select multiple books to update language, format, shelf, or price simultaneously.
- **Database Cleanup:** Manage all genres and tags from a central hub. Merge duplicates or remove obsolete entries.
- **Table View:** Sortable, resizable data table for power users.
- **Borrowings Tab:** Dedicated view to see and manage all active borrowings.

### 📊 Advanced Analytics
- **Reading Journey:** Track annual reading progress with a visual goal banner.
- **Financial Stats:** Monitor your library's economy with average book value and estimated total value.
- **Visual Distributions:** Charts showing genre, rating, and language distributions.

### 🔄 Data Integrity & Portability
- **CSV Export/Import:** UTF-8 with BOM for Excel compatibility (Polish characters display correctly).
- **Full JSON Backups:** Export entire library including covers into a single backup file.
- **Restore from Backup:** Import full JSON snapshots.
- **Persistent Storage:** Fully dockerized with PostgreSQL and local volumes.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS + Vite
- **Backend:** Node.js + Express
- **Database:** PostgreSQL 14
- **Scraping (no AI):** OpenLibrary API + Startpage search + lubimyczytac.pl HTML parsing
- **Deployment:** Docker & Docker Compose

---

## ⚙️ Installation

### Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/19orzeszek90/Home-Book-Library-v1.git
cd Home-Book-Library-v1

# 2. Build & launch
docker compose up --build -d
```

Access your library at `http://localhost:3001`.

### Configuration

- **Port:** Change `3001:3000` in `docker-compose.yml` to any port you prefer.
- **Database credentials:** Edit `POSTGRES_USER` / `POSTGRES_PASSWORD` in `docker-compose.yml` if needed.
- **Scraping works out of the box** — no API keys needed. The Quick Scan feature uses:
  1. OpenLibrary API (free, no key)
  2. Startpage.com search (free, no key)
  3. lubimyczytac.pl HTML scraping (free, no key)

---

## 📖 How Quick Scan Works

The ISBN scanner uses a **zero-AI, zero-cost scraping pipeline:**

```
ISBN → OpenLibrary API (title, author, publisher)
     → Startpage search by ISBN → lubimyczytac.pl URL
     → Startpage search by title+author (fallback)
     → lubimyczytac.pl HTML scrape (ratings, series, format, translator, cover)
     → Save to database
```

All data is extracted from structured HTML (JSON-LD schema + `<dt>/<dd>` tables + `data-ga-*` attributes). No AI, no API keys, no external services required.

---

## 🛡️ License

This project is licensed under the MIT License.

*Developed with passion for books and clean code.*
